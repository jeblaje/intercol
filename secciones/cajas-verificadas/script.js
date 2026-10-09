const boxList = document.querySelector("#boxList");
const boxDetail = document.querySelector("#boxDetail");
const status = document.querySelector("#status");
const count = document.querySelector("#boxCount");
const search = document.querySelector("#boxSearch");
const typeFilter = document.querySelector("#boxType");
let boxes = [];
let loaded = false;
let stopSubscription = null;

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const actionText = action => ({ cancelled: "SE TOMA PUERTO CANCELADO", splitter: "SE COLOCA SPLITTER", addressChange: "Cliente cambio de dirección", notRegistered: "Cliente no registra" }[action] || "ACTIVO");
function displayDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (value || "—");
}
function safeUrl(value) {
  try { const url = new URL(String(value || "")); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}
function realPort(port, boxType) {
  const numeric = Math.max(1, Number(port) || 1);
  if (boxType !== "x16") return `Puerto ${numeric}`;
  const splitter = Math.floor((numeric - 1) / 8) + 1;
  const physical = ((numeric - 1) % 8) + 1;
  return `<span class="splitter">Splitter ${splitter}</span> · Puerto ${physical}`;
}
function renderList() {
  const term = search.value.trim().toLocaleLowerCase();
  const selected = boxDetail.dataset.boxId || "";
  const filtered = boxes.filter(box => {
    if (typeFilter.value !== "all" && box.tipoCaja !== typeFilter.value) return false;
    const portText = (Array.isArray(box.cedulas) ? box.cedulas.flatMap(user => [user.cedula, user.puertoTecnico, user.puertoReal, user.comentario]) : []).join(" ");
    return [box.numeroCaja, box.direccion, box.tecnico, box.asesor, box.creadoPor, box.usuarioRegistrado, box.fecha, box.tipoCaja, portText].join(" ").toLocaleLowerCase().includes(term);
  });
  boxList.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("div"); empty.className = "empty-list";
    empty.textContent = loaded ? (boxes.length ? "No hay cajas que coincidan con la búsqueda." : "Aún no hay cajas verificadas.") : "Conectando con Firebase…";
    boxList.appendChild(empty);
  }
  filtered.forEach(box => {
    const row = document.createElement("button"); row.type = "button"; row.className = `box-row ${box.id === selected ? "selected" : ""}`;
    const title = document.createElement("strong"); title.textContent = `${box.numeroCaja || "Sin número"} · ${String(box.tipoCaja || "").toUpperCase()}`;
    const summary = document.createElement("span"); summary.textContent = `${box.direccion || "Sin dirección"} · ${box.tecnico || "Sin técnico"} · ${displayDate(box.fecha)}`;
    const records = document.createElement("small"); records.textContent = `${Array.isArray(box.cedulas) ? box.cedulas.length : 0} identificaciones · ${box.asesor || "Sin asesor"}`;
    row.append(title, summary, records); row.addEventListener("click", () => showDetail(box)); boxList.appendChild(row);
  });
}
function showDetail(box) {
  boxDetail.dataset.boxId = box.id;
  const link = safeUrl(box.link);
  const users = (Array.isArray(box.cedulas) ? box.cedulas : []).slice().sort((a, b) => Number(a.puertoTecnico) - Number(b.puertoTecnico)).map(user => {
    const action = user.accionPuerto || (user.fondoNaranja ? "cancelled" : "active");
    const actionClass = action === "cancelled" ? "action-cancelled" : action === "splitter" ? "action-splitter" : action === "addressChange" ? "action-address-change" : action === "notRegistered" ? "action-not-registered" : "action-active";
    return `<article class="port-card ${actionClass}"><div class="port-id"><strong>${esc(user.cedula)}</strong><span class="port-action-label">${esc(actionText(action))}</span></div><div class="port-values"><span>Puerto (lista del técnico): <b>${esc(user.puertoTecnico ?? "—")}</b></span><span>Puerto real: <b>${realPort(user.puertoReal || user.puertoTecnico, box.tipoCaja)}</b></span></div>${user.comentario ? `<p class="port-comment">${esc(user.comentario)}</p>` : ""}</article>`;
  }).join("");
  boxDetail.innerHTML = `<div class="ficha"><div class="ficha-head"><div><span class="ficha-kicker">FICHA DE CAJA VERIFICADA</span><h2>${esc(box.numeroCaja || "Sin número")}</h2></div>${link ? `<a class="filter-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Filtrar caja ↗</a>` : '<span class="filter-link disabled">Sin link de filtro</span>'}</div><dl class="data"><div><dt>Fecha</dt><dd>${esc(displayDate(box.fecha))}</dd></div><div><dt>Tipo de caja</dt><dd>${esc(String(box.tipoCaja || "").toUpperCase())}</dd></div><div><dt>Dirección</dt><dd>${esc(box.direccion || "—")}</dd></div><div><dt>Técnico</dt><dd>${esc(box.tecnico || "—")}</dd></div><div><dt>Asesor de la caja</dt><dd>${esc(box.asesor || "—")}</dd></div></dl><h3>Puertos e identificaciones</h3><div class="ports">${users || '<p class="creator">No se guardaron puertos.</p>'}</div><p class="creator">Registrada por: ${esc(box.creadoPor || "—")} · Usuario registrado: ${esc(box.usuarioRegistrado || "—")}</p></div>`;
  renderList();
}
function subscribe() {
  if (stopSubscription) return;
  const firebase = window.parent.INTERCOL_FIREBASE;
  if (!firebase?.subscribeVerifiedBoxes) { status.textContent = "No se pudo inicializar Firebase. Recarga la página."; return; }
  status.textContent = "Cargando cajas verificadas…";
  stopSubscription = firebase.subscribeVerifiedBoxes(items => {
    boxes = items.sort((a, b) => {
      const stamp = value => value?.toMillis?.() ?? (value?.seconds ? value.seconds * 1000 : Date.parse(value || "") || 0);
      return stamp(b.creadoEn) - stamp(a.creadoEn);
    });
    loaded = true; count.textContent = `${boxes.length} caja${boxes.length === 1 ? "" : "s"}`;
    status.textContent = boxes.length ? "Consulta pública de todas las cajas verificadas." : "Todavía no se han guardado cajas.";
    const selected = boxes.find(box => box.id === boxDetail.dataset.boxId);
    if (selected) showDetail(selected);
    else renderList();
  }, error => {
    console.error("Error leyendo cajas verificadas:", error);
    loaded = true; count.textContent = "Error";
    status.textContent = error?.code === "permission-denied"
      ? "Firestore no permite lectura pública. Publica las reglas actualizadas de Firestore."
      : "No se pudieron cargar las cajas. Revisa tu conexión.";
    renderList();
  });
}
search.addEventListener("input", renderList);
typeFilter.addEventListener("change", renderList);
window.addEventListener("message", event => {
  if (event.data?.type !== "INTERCOL_THEME") return;
  document.documentElement.dataset.theme = event.data.theme || "light";
  for (const [name, value] of Object.entries(event.data.variables || {})) document.documentElement.style.setProperty(name, value);
});
window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");
window.parent.addEventListener("intercol-firebase-ready", subscribe);
subscribe();
