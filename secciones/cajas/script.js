const $ = selector => document.querySelector(selector);
const list = $("#boxList");
const detail = $("#boxDetail");
const status = $("#boxStatus");
const count = $("#boxCount");
const search = $("#boxSearch");
const typeFilter = $("#boxType");
let verifications = [];
let groups = [];
let selectedKey = "";
let viewer = { user: null, profile: null };
let stopSync = null;
function updateAvailableHeight() {
  try { document.documentElement.style.setProperty("--intercol-viewport-height", `${window.parent.innerHeight}px`); }
  catch { document.documentElement.style.setProperty("--intercol-viewport-height", `${window.innerHeight}px`); }
}
updateAvailableHeight();
window.parent.addEventListener("resize", updateAvailableHeight);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const millis = value => value?.toMillis?.() ?? (value?.seconds ? value.seconds * 1000 : Date.parse(value || "") || 0);
const normalizedBoxNumber = value => String(value || "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const boxKey = box => {
  const normalized = normalizedBoxNumber(box.numeroCaja);
  const hasNoNumber = !normalized || ["sinnumero", "cajasinnumero", "nonumero", "cajanonumero", "na"].includes(normalized);
  // A box without an identifier cannot be safely matched to another verification.
  // Keep each source record separate instead of merging unrelated physical boxes.
  return hasNoNumber ? `sin-numero:${box.id}` : normalized;
};
const portCount = box => Array.isArray(box.cedulas) ? box.cedulas.length : 0;
const displayDate = value => { const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "Fecha pendiente"); };
const stateOf = user => user.estadoServicio || (user.accionPuerto === "cancelled" || user.fondoNaranja ? "cancelled" : user.accionPuerto === "notRegistered" ? "notRegistered" : "active");
const stateLabel = value => ({ active: "Activos", suspended: "Suspendidos", cancelled: "Cancelados", notRegistered: "No registra" }[value] || "Activos");

function groupVerifications() {
  const map = new Map();
  verifications.forEach(item => {
    const key = boxKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  groups = [...map.entries()].map(([key, history]) => {
    history.sort((a, b) => millis(b.creadoEn) - millis(a.creadoEn) || String(b.fecha || "").localeCompare(String(a.fecha || "")));
    return { key, history, latest: history[0] };
  }).sort((a, b) => millis(b.latest.creadoEn) - millis(a.latest.creadoEn) || String(b.latest.numeroCaja || "").localeCompare(String(a.latest.numeroCaja || ""), "es", { numeric: true }));
}

function renderList() {
  const term = search.value.trim().toLocaleLowerCase("es");
  const matches = groups.filter(group => {
    const box = group.latest;
    if (typeFilter.value !== "all" && box.tipoCaja !== typeFilter.value) return false;
    const all = group.history.flatMap(item => [item.tecnico, item.asesor, item.fecha, ...(Array.isArray(item.cedulas) ? item.cedulas.map(user => user.cedula) : [])]).join(" ");
    return [box.numeroCaja, box.direccion, box.tecnico, box.asesor, box.tipoCaja, all].join(" ").toLocaleLowerCase("es").includes(term);
  });
  list.replaceChildren();
  if (!matches.length) { const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = groups.length ? "No hay cajas que coincidan con la búsqueda." : "Aún no hay cajas verificadas."; list.append(empty); }
  matches.forEach(group => {
    const box = group.latest;
    const row = document.createElement("button"); row.type = "button"; row.className = `box-row${group.key === selectedKey ? " selected" : ""}`;
    row.innerHTML = `<strong>Caja ${esc(box.numeroCaja || "Sin número")} · ${esc(String(box.tipoCaja || "").toUpperCase())}</strong><span>${esc(box.direccion || "Sin dirección")} · Última verificación ${esc(displayDate(box.fecha))}</span><div class="row-tags"><small class="tag">Técnico: ${esc(box.tecnico || "Sin registrar")}</small><small class="tag">${group.history.length} verificación${group.history.length === 1 ? "" : "es"}</small><small>${portCount(box)} puertos</small></div>`;
    row.addEventListener("click", () => { selectedKey = group.key; renderList(); renderDetail(group); }); list.append(row);
  });
}

function verificationSummary(box) {
  const counts = { active: 0, suspended: 0, cancelled: 0, notRegistered: 0 };
  (Array.isArray(box.cedulas) ? box.cedulas : []).forEach(user => { const state = stateOf(user); counts[state] = (counts[state] || 0) + 1; });
  return Object.entries(counts).filter(([, value]) => value).map(([key, value]) => `${value} ${stateLabel(key).toLocaleLowerCase("es")}`).join(" · ") || "Sin identificaciones registradas";
}

function verificationMarkup(box, index) {
  const users = (Array.isArray(box.cedulas) ? box.cedulas : []).slice().sort((a, b) => Number(a.puertoTecnico) - Number(b.puertoTecnico)).map(user => `<li class="port-state-${esc(stateOf(user))}${user.accionPuerto === "splitter" ? " has-splitter" : ""}"><strong>Puerto ${esc(user.puertoTecnico ?? "—")}</strong><span>${esc(user.cedula || "Sin identificación")}</span><small>${esc(stateLabel(stateOf(user)))}${user.estadoServicio === "suspended" && user.suspendidoDesde ? ` desde ${esc(displayDate(user.suspendidoDesde))}` : ""}${user.accionPuerto === "splitter" ? " · Se colocó splitter" : ""}${user.comentario ? ` · ${esc(user.comentario)}` : ""}</small></li>`).join("");
  const statuses = { active: 0, suspended: 0, cancelled: 0, notRegistered: 0 };
  (Array.isArray(box.cedulas) ? box.cedulas : []).forEach(user => { const current = stateOf(user); statuses[current] = (statuses[current] || 0) + 1; });
  const statusTags = Object.entries(statuses).filter(([, value]) => value).map(([key, value]) => `<span class="status-tag state-${key}">${value} ${esc(stateLabel(key).toLocaleLowerCase("es"))}</span>`).join("");
  return `<article class="history-item${index === 0 ? " is-latest" : ""}"><header><div><strong>${index === 0 ? "Última verificación" : `Verificación ${index + 1}`}</strong><p>Fecha: ${esc(displayDate(box.fecha))} · Técnico: ${esc(box.tecnico || "Sin registrar")}</p></div><span class="tag">${portCount(box)} puertos</span></header><div class="history-meta"><small>${esc(box.asesor ? `Asesor: ${box.asesor}` : "Asesor sin registrar")}</small><div class="status-tags">${statusTags}</div></div><button class="history-button" type="button" data-toggle-verification="${index}" aria-expanded="${index === 0}">${index === 0 ? "Ocultar puertos" : "Ver puertos de esta verificación"}</button><ul class="verification-ports" ${index === 0 ? "" : "hidden"}>${users || "<li>Sin datos de puertos</li>"}</ul></article>`;
}

function renderDetail(group) {
  if (!group) { detail.innerHTML = `<div class="placeholder"><span>▤</span><strong>Selecciona una caja</strong><p>Aquí verás sus datos y el historial de verificaciones.</p></div>`; return; }
  const latest = group.latest;
  const canStartVerification = Boolean(viewer.user && viewer.profile);
  detail.innerHTML = `<header class="detail-heading"><div><span class="eyebrow">FICHA DE CAJA</span><h2>Caja ${esc(latest.numeroCaja || "Sin número")} · ${esc(String(latest.tipoCaja || "").toUpperCase())}</h2><p>La última verificación sirve como base. Actualiza solo los datos y puertos que hayan cambiado.</p></div><button class="primary-button" type="button" data-new-verification ${canStartVerification ? "" : "disabled title=\"Inicia sesión para verificar\""}>＋ Verificar caja</button></header><section class="box-facts"><div class="fact"><span>Dirección registrada</span><strong>${esc(latest.direccion || "—")}</strong></div><div class="fact"><span>Tipo de caja</span><strong>${esc(String(latest.tipoCaja || "—").toUpperCase())}</strong></div><div class="fact"><span>Última verificación</span><strong>${esc(displayDate(latest.fecha))}</strong></div><div class="fact"><span>Técnico</span><strong>${esc(latest.tecnico || "—")}</strong></div><div class="fact"><span>Asesor</span><strong>${esc(latest.asesor || "—")}</strong></div><div class="fact"><span>Puertos registrados</span><strong>${portCount(latest)}</strong></div></section><div class="history-title"><h3>Historial de verificaciones</h3><span>${group.history.length} registro${group.history.length === 1 ? "" : "s"}</span></div><section class="history-list">${group.history.map(verificationMarkup).join("")}</section>`;
  detail.querySelector("[data-new-verification]")?.addEventListener("click", () => {
    const box = { id: latest.id, numeroCaja: latest.numeroCaja, tipoCaja: latest.tipoCaja, fecha: latest.fecha, direccion: latest.direccion, tecnico: latest.tecnico, asesor: latest.asesor, link: latest.link, cedulas: (Array.isArray(latest.cedulas) ? latest.cedulas : []).map(user => ({ ...user })) };
    window.parent.postMessage({ type: "INTERCOL_START_BOX_VERIFICATION", box }, "*");
  });
  detail.querySelectorAll("[data-toggle-verification]").forEach(button => button.addEventListener("click", () => {
    const portList = button.closest(".history-item")?.querySelector(".verification-ports");
    if (!portList) return;
    portList.hidden = !portList.hidden;
    button.setAttribute("aria-expanded", String(!portList.hidden));
    button.textContent = portList.hidden ? "Ver puertos de esta verificación" : "Ocultar puertos";
  }));
}

function connect() {
  if (stopSync) stopSync();
  const firebase = window.parent.INTERCOL_FIREBASE;
  if (!viewer.user || !viewer.profile) { status.textContent = "Inicia sesión con la misma cuenta autorizada para Verificar caja."; return; }
  if (!firebase?.subscribeVerifiedBoxes) { status.textContent = "No se pudo inicializar Firebase. Recarga la página."; return; }
  status.textContent = "Cargando cajas…";
  stopSync = firebase.subscribeVerifiedBoxes(items => {
    verifications = items;
    groupVerifications();
    count.textContent = `${groups.length} caja${groups.length === 1 ? "" : "s"} · ${verifications.length} verificaciones`;
    status.textContent = "Selecciona una caja para consultar la última verificación y su historial.";
    renderList();
    if (selectedKey) renderDetail(groups.find(group => group.key === selectedKey));
  }, error => {
    console.error("No se pudo consultar el catálogo de cajas:", error);
    status.textContent = error?.code === "permission-denied" ? "Firebase no autorizó consultar las cajas. Revisa las reglas de cajas verificadas." : "No se pudieron cargar las cajas. Revisa la conexión.";
  });
}

search.addEventListener("input", renderList);
typeFilter.addEventListener("change", renderList);
window.addEventListener("message", event => {
  if (event.source !== window.parent) return;
  if (event.data?.type === "INTERCOL_AUTH_STATE") { viewer = { user: event.data.user || null, profile: event.data.profile || null }; connect(); }
  if (event.data?.type === "INTERCOL_THEME") { Object.entries(event.data.variables || {}).forEach(([name, value]) => document.documentElement.style.setProperty(name, value)); document.documentElement.dataset.theme = event.data.theme || "dark"; }
});
window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");
window.parent.addEventListener("intercol-firebase-ready", connect);
window.addEventListener("beforeunload", () => stopSync?.());
