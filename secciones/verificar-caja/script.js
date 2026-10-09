const boxForm = document.querySelector("#boxForm");
const userForm = document.querySelector("#userForm");
const cedulaInput = document.querySelector("#cedula");
const userList = document.querySelector("#userList");
const emptyUsers = document.querySelector("#emptyUsers");
const userCount = document.querySelector("#userCount");
const detailPanel = document.querySelector("#detailPanel");
const inlineError = document.querySelector("#inlineError");
const statusText = document.querySelector("#statusText");
const openAllOnusButton = document.querySelector("#openAllOnus");
const popupStatus = document.querySelector("#popupStatus");
const copySheetButton = document.querySelector("#copySheet");
const copyStatus = document.querySelector("#copyStatus");
const portAnnotationOutput = document.querySelector("#portAnnotationOutput");
const copyPortAnnotationButton = document.querySelector("#copyPortAnnotation");
const portAnnotationStatus = document.querySelector("#portAnnotationStatus");
const markBoxVerifiedButton = document.querySelector("#markBoxVerified");
const cancelBoxEditButton = document.querySelector("#cancelBoxEdit");
const verifiedList = document.querySelector("#verifiedList");
const verifiedDetail = document.querySelector("#verifiedDetail");
const verifiedStatus = document.querySelector("#verifiedStatus");
const verifiedCount = document.querySelector("#verifiedCount");
const verifiedSearch = document.querySelector("#verifiedSearch");
const verifiedType = document.querySelector("#verifiedType");
const BOX_DRAFT_KEY = "intercol_verificar_caja_draft_v1";
const users = [];
let selectedId = null;
let pendingOnuUsers = [];
let advisorAuth = { user: null, profile: null, isAdmin: false };
let verifiedBoxes = [];
let stopVerifiedBoxSync = null;
let editingVerifiedBoxId = null;
const onuUrl = cedula => `https://intercolwisp.smartolt.com/onu/configured?free_text=${encodeURIComponent(cedula)}&sort_by=id&sort_order=desc`;
const notesUrl = cedula => `https://wisphub.net/clientes/ver/${encodeURIComponent(cedula)}@cibercitywisp/#set1`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const boxData = () => Object.fromEntries(new FormData(boxForm).entries());
const portActionFor = user => user?.portAction || (user?.orangeBackground ? "cancelled" : "");
const portActionText = action => ({
  cancelled: "SE TOMA PUERTO CANCELADO",
  splitter: "SE COLOCA SPLITTER",
  addressChange: "Cliente cambio de dirección",
  notRegistered: "Cliente no registra"
}[action] || "");
const formatCurrentTime = () => {
  const now = new Date();
  const hour = now.getHours();
  return `${String(hour % 12 || 12).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`;
};
const portFor = user => Number(user.port) || 1;
const listOrderFor = (user, index = 0) => Number(user.listOrder) || index + 1;
const physicalPortFor = port => ((port - 1) % 8) + 1;
const splitterFor = port => Math.floor((port - 1) / 8) + 1;
const splitterColorFor = port => `splitter-color-${((splitterFor(port) - 1) % 4) + 1}`;
const realPortLabel = (port, boxType) => boxType === "x16"
  ? `<span class="splitter-badge ${splitterColorFor(port)}">Splitter ${splitterFor(port)}</span><span>Puerto ${physicalPortFor(port)}</span>`
  : `<span>Puerto ${port}</span>`;
const realPortDisplayLabel = (port, boxType) => boxType === "x16"
  ? `<span class="splitter-badge ${splitterColorFor(port)}">Splitter ${splitterFor(port)}</span><span>Puerto real ${physicalPortFor(port)}</span>`
  : `<span>Puerto real ${port}</span>`;

function requestAdvisorLogin() {
  verifiedStatus.textContent = "Inicia sesión para guardar y consultar las cajas verificadas.";
  window.parent.postMessage({ type: "INTERCOL_REQUIRE_AUTH" }, "*");
}

function syncVerifiedBoxes() {
  if (stopVerifiedBoxSync) { stopVerifiedBoxSync(); stopVerifiedBoxSync = null; }
  verifiedBoxes = [];
  verifiedList.replaceChildren();
  const firebase = window.parent.INTERCOL_FIREBASE;
  if (!firebase?.subscribeVerifiedBoxes) {
    verifiedStatus.textContent = "No se pudo conectar con Firebase.";
    return;
  }
  verifiedCount.textContent = "Cargando…";
  verifiedStatus.textContent = "Cargando cajas guardadas…";
  stopVerifiedBoxSync = firebase.subscribeVerifiedBoxes(items => {
    verifiedBoxes = items.sort((a, b) => timestampMillis(b.creadoEn) - timestampMillis(a.creadoEn));
    verifiedCount.textContent = `${verifiedBoxes.length} caja${verifiedBoxes.length === 1 ? "" : "s"}`;
    verifiedStatus.textContent = verifiedBoxes.length ? "Selecciona una caja para consultar su ficha." : "Aún no hay cajas verificadas.";
    renderVerifiedBoxes();
    const selectedBox = verifiedBoxes.find(box => box.id === verifiedDetail.dataset.boxId);
    if (selectedBox) showVerifiedBox(selectedBox);
  }, error => {
    console.error("No se pudieron cargar las cajas verificadas:", error);
    verifiedCount.textContent = "Error";
    verifiedStatus.textContent = error?.code === "permission-denied"
      ? "Firebase no permite leer cajas verificadas. Revisa las reglas de Firestore."
      : "No se pudieron cargar las cajas verificadas. Revisa la conexión.";
  });
}

function timestampMillis(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBoxDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "—");
}

function renderVerifiedBoxes() {
  const term = verifiedSearch.value.trim().toLocaleLowerCase();
  const type = verifiedType.value;
  const results = verifiedBoxes.filter(box => {
    if (type !== "all" && box.tipoCaja !== type) return false;
    const searchable = [box.numeroCaja, box.direccion, box.tecnico, box.asesor, box.fecha, box.tipoCaja,
      ...(Array.isArray(box.cedulas) ? box.cedulas.flatMap(user => [user.cedula, user.puertoTecnico, user.puertoReal, user.comentario]) : [])]
      .join(" ").toLocaleLowerCase();
    return searchable.includes(term);
  });
  verifiedList.replaceChildren();
  if (!results.length) {
    const empty = document.createElement("div"); empty.className = "verified-empty"; empty.textContent = verifiedBoxes.length ? "No hay cajas que coincidan con la búsqueda." : "Aún no hay cajas verificadas."; verifiedList.appendChild(empty); return;
  }
  results.forEach(box => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `verified-row ${verifiedDetail.dataset.boxId === box.id ? "selected" : ""}`;
    const title = document.createElement("strong"); title.textContent = `${box.numeroCaja || "Sin número"} · ${String(box.tipoCaja || "").toUpperCase()}`;
    const summary = document.createElement("span"); summary.textContent = `${box.direccion || "Sin dirección"} · ${box.tecnico || "Sin técnico"} · ${formatBoxDate(box.fecha)}`;
    const advisor = document.createElement("span"); advisor.className = "verified-row-advisor"; advisor.textContent = `Asesor: ${box.asesor || "Sin asesor"}`;
    const count = document.createElement("small"); count.textContent = `${Array.isArray(box.cedulas) ? box.cedulas.length : 0} puertos`;
    button.append(title, summary, advisor, count);
    button.addEventListener("click", () => showVerifiedBox(box));
    verifiedList.appendChild(button);
  });
}

function showVerifiedBox(box) {
  verifiedDetail.dataset.boxId = box.id;
  const safeLink = safeFilterLink(box.link);
  const usersMarkup = (Array.isArray(box.cedulas) ? box.cedulas : []).slice().sort((a, b) => Number(a.puertoTecnico) - Number(b.puertoTecnico)).map(user => {
    const realPort = Number(user.puertoReal) || Number(user.puertoTecnico) || 1;
    const action = user.accionPuerto || (user.fondoNaranja ? "cancelled" : "");
    const actionClass = action === "cancelled" ? "action-cancelled" : action === "splitter" ? "action-splitter" : action === "addressChange" ? "action-address-change" : action === "notRegistered" ? "action-not-registered" : "";
    return `<article class="verified-port ${actionClass}"><div class="verified-port-identity"><strong>${escapeHtml(user.cedula || "")}</strong>${action ? `<span class="port-action-badge">${portActionText(action)}</span>` : ""}</div><div class="verified-port-data"><span>Puerto (lista del técnico): <b>${escapeHtml(user.puertoTecnico ?? "—")}</b></span><span>Puerto real: <b>${realPortLabel(realPort, box.tipoCaja)}</b></span></div>${user.comentario ? `<p>${escapeHtml(user.comentario)}</p>` : ""}</article>`;
  }).join("");
  const canEdit = Boolean(advisorAuth.user && (advisorAuth.isAdmin || box.asesorUid === advisorAuth.user.uid));
  const actions = canEdit ? `<div class="verified-record-actions"><button type="button" class="secondary" id="editVerifiedBox">Editar caja</button><button type="button" class="danger" id="deleteVerifiedBox">Eliminar caja</button></div>` : "";
  verifiedDetail.innerHTML = `<div class="verified-ficha"><div class="verified-ficha-heading"><div><span class="detail-kicker">FICHA DE CAJA VERIFICADA</span><h3>${escapeHtml(box.numeroCaja || "Sin número")}</h3></div>${safeLink ? `<a class="secondary verified-filter-link" href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">Filtrar caja ↗</a>` : ""}</div>${actions}<dl class="detail-data"><div><dt>Fecha</dt><dd>${escapeHtml(formatBoxDate(box.fecha))}</dd></div><div><dt>Tipo de caja</dt><dd>${escapeHtml(String(box.tipoCaja || "").toUpperCase())}</dd></div><div><dt>Dirección</dt><dd>${escapeHtml(box.direccion || "—")}</dd></div><div><dt>Técnico</dt><dd>${escapeHtml(box.tecnico || "—")}</dd></div><div><dt>Asesor</dt><dd>${escapeHtml(box.asesor || "—")}</dd></div></dl><h4>Puertos e identificaciones</h4><div class="verified-port-list">${usersMarkup || '<p class="verified-status">No se guardaron puertos.</p>'}</div></div>`;
  document.querySelector("#editVerifiedBox")?.addEventListener("click", () => beginVerifiedBoxEdit(box));
  document.querySelector("#deleteVerifiedBox")?.addEventListener("click", () => removeVerifiedBox(box));
  renderVerifiedBoxes();
}

function canManageVerifiedBox(box) {
  return Boolean(advisorAuth.user && box && (advisorAuth.isAdmin || box.asesorUid === advisorAuth.user.uid));
}

function beginVerifiedBoxEdit(box) {
  if (!canManageVerifiedBox(box)) return;
  const fields = boxForm.elements;
  fields.date.value = String(box.fecha || "");
  Array.from(fields.boxType).forEach(input => { input.checked = input.value === box.tipoCaja; });
  fields.boxNumber.value = String(box.numeroCaja || "");
  fields.address.value = String(box.direccion || "");
  fields.technician.value = String(box.tecnico || "");
  fields.advisor.value = String(box.asesor || "");
  fields.link.value = String(box.link || "");
  users.splice(0, users.length, ...(Array.isArray(box.cedulas) ? box.cedulas : []).map((user, index) => ({
    id: `saved-${box.id}-${index}`,
    cedula: String(user.cedula || ""),
    port: Number(user.puertoReal) || Number(user.puertoTecnico) || 1,
    listOrder: Number(user.puertoTecnico) || index + 1,
    comment: String(user.comentario || ""),
    orangeBackground: Boolean(user.fondoNaranja),
    portAction: user.accionPuerto || (user.fondoNaranja ? "cancelled" : "")
  })));
  selectedId = users[0]?.id || null;
  editingVerifiedBoxId = box.id;
  markBoxVerifiedButton.textContent = "Guardar cambios";
  cancelBoxEditButton.hidden = false;
  copyStatus.textContent = `Editando ${box.numeroCaja || "la caja verificada"}. Guarda los cambios con el botón “Guardar cambios”.`;
  if (selectedId) selectUser(selectedId);
  else detailPanel.innerHTML = '<div class="detail-placeholder"><span class="detail-icon">⌕</span><strong>Aún no hay cédulas</strong><p>Agrega las identificaciones de la caja.</p></div>';
  renderList();
  updateStatus();
  boxForm.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#boxNumber").focus({ preventScroll: true });
}

async function removeVerifiedBox(box) {
  if (!canManageVerifiedBox(box)) return;
  if (!window.confirm(`¿Eliminar la caja ${box.numeroCaja || "sin número"}? Esta acción no se puede deshacer.`)) return;
  const firebase = window.parent.INTERCOL_FIREBASE;
  if (!firebase?.deleteVerifiedBox) { verifiedStatus.textContent = "Firebase todavía no está listo. Recarga la página e inténtalo de nuevo."; return; }
  verifiedStatus.textContent = "Eliminando caja…";
  try {
    await firebase.deleteVerifiedBox(box.id);
    if (editingVerifiedBoxId === box.id) resetBoxForm();
    if (verifiedDetail.dataset.boxId === box.id) {
      delete verifiedDetail.dataset.boxId;
      verifiedDetail.innerHTML = '<div class="detail-placeholder"><span class="detail-icon">▤</span><strong>Caja eliminada</strong><p>Selecciona otra caja para consultar su ficha.</p></div>';
    }
    verifiedStatus.textContent = "Caja eliminada.";
  } catch (error) {
    console.error("No se pudo eliminar la caja verificada:", error);
    verifiedStatus.textContent = error?.code === "permission-denied" ? "Firestore no autorizó eliminar esta caja. Solo su creador o un administrador pueden hacerlo." : `No se pudo eliminar la caja: ${error?.message || "Revisa la conexión."}`;
  }
}

function safeFilterLink(value) {
  try { const url = new URL(String(value || "")); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}

function saveBoxDraft() {
  try {
    localStorage.setItem(BOX_DRAFT_KEY, JSON.stringify({ form: boxData(), users, selectedId }));
  } catch { /* local storage can be unavailable in private browsing */ }
}

function restoreBoxDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(BOX_DRAFT_KEY) || "null");
    if (!draft) return;
    for (const [name, savedValue] of Object.entries(draft.form || {})) {
      const fields = boxForm.elements[name];
      if (!fields) continue;
      if (typeof fields.length === "number" && fields[0]?.type === "radio") {
        Array.from(fields).forEach(field => { field.checked = field.value === savedValue; });
      } else fields.value = savedValue;
    }
    if (Array.isArray(draft.users)) users.push(...draft.users.filter(user => user && typeof user.cedula === "string").map((user, index) => ({
      ...user,
      port: Number.isInteger(Number(user.port)) && Number(user.port) > 0 ? Number(user.port) : index + 1,
      listOrder: Number.isInteger(Number(user.listOrder)) && Number(user.listOrder) > 0 ? Number(user.listOrder) : index + 1,
      orangeBackground: Boolean(user.orangeBackground),
      portAction: user.portAction || (user.orangeBackground ? "cancelled" : "")
    })));
    selectedId = users.some(user => user.id === draft.selectedId) ? draft.selectedId : users[0]?.id || null;
  } catch { /* Ignore an invalid saved draft and start a fresh form. */ }
}

const dateField = document.querySelector("#boxDate");
const today = new Date();
dateField.value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
restoreBoxDraft();

function updateStatus() {
  const data = boxData();
  const ready = data.date && data.boxType && data.boxNumber.trim() && data.address.trim() && data.technician.trim() && data.advisor.trim();
  statusText.textContent = ready ? `${data.boxType.toUpperCase()} · ${users.length} cédula${users.length === 1 ? "" : "s"}` : "Completa los datos de la caja";
  markBoxVerifiedButton.disabled = !ready || !users.length;
  markBoxVerifiedButton.textContent = editingVerifiedBoxId ? "Guardar cambios" : "Caja verificada";
  cancelBoxEditButton.hidden = !editingVerifiedBoxId;
  updateSheetRows();
  saveBoxDraft();
}

async function saveVerifiedBox() {
  const data = boxData();
  const ready = data.date && data.boxType && data.boxNumber.trim() && data.address.trim() && data.technician.trim() && data.advisor.trim() && users.length;
  if (!ready) { verifiedStatus.textContent = "Completa los datos generales y agrega al menos una cédula."; return; }
  if (data.link && !safeFilterLink(data.link)) { verifiedStatus.textContent = "El link debe comenzar con http:// o https://."; return; }
  const firebase = window.parent.INTERCOL_FIREBASE;
  const authUser = advisorAuth.user || firebase?.auth?.currentUser;
  if (!authUser) { requestAdvisorLogin(); return; }
  if ((!editingVerifiedBoxId && !firebase?.createVerifiedBox) || (editingVerifiedBoxId && !firebase?.updateVerifiedBox) || !firebase?.getAdvisorProfile) {
    verifiedStatus.textContent = "Firebase todavía no está listo. Recarga la página e inténtalo de nuevo.";
    return;
  }
  let profile = advisorAuth.profile;
  try { if (!profile) profile = await firebase.getAdvisorProfile(authUser.uid); }
  catch (error) { console.error(error); }
  if (!profile) { verifiedStatus.textContent = "No se encontró el perfil del asesor. Cierra sesión e inicia nuevamente."; return; }
  markBoxVerifiedButton.disabled = true;
  markBoxVerifiedButton.textContent = "Guardando…";
  try {
    const verifiedBoxData = {
      fecha: data.date,
      tipoCaja: data.boxType,
      numeroCaja: data.boxNumber.trim(),
      direccion: data.address.trim(),
      tecnico: data.technician.trim(),
      asesor: data.advisor.trim(),
      link: safeFilterLink(data.link),
      asesorUid: authUser.uid,
      creadoPor: String(profile.asesor || authUser.displayName || "Asesor"),
      usuarioRegistrado: String(profile.usuario || authUser.email?.split("@")[0] || ""),
      cedulas: users.slice().sort((a, b) => listOrderFor(a) - listOrderFor(b)).map(user => ({
        cedula: user.cedula,
        puertoTecnico: listOrderFor(user),
        puertoReal: portFor(user),
        comentario: String(user.comment || ""),
        fondoNaranja: portActionFor(user) === "cancelled",
        accionPuerto: portActionFor(user)
      }))
    };
    if (editingVerifiedBoxId) {
      const box = verifiedBoxes.find(item => item.id === editingVerifiedBoxId);
      if (!canManageVerifiedBox(box)) throw new Error("No tienes permiso para editar esta caja.");
      await firebase.updateVerifiedBox(editingVerifiedBoxId, verifiedBoxData);
      verifiedStatus.textContent = "Cambios guardados. La ficha se actualizó para todos los asesores.";
    } else {
      await firebase.createVerifiedBox(verifiedBoxData);
      verifiedStatus.textContent = "Caja verificada y guardada para todos los asesores.";
    }
    resetBoxForm();
    document.querySelector("#verifiedTitle").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error("No se pudo guardar la caja verificada:", error);
    const errorCode = String(error?.code || "").replace(/^firestore\//, "");
    verifiedStatus.textContent = errorCode === "permission-denied"
      ? "Firestore denegó el guardado (permission-denied). Confirma que iniciaste sesión y publica en Firebase Console las reglas de cajasVerificadas."
      : errorCode
        ? `No se pudo guardar (${errorCode}): ${error?.message || "Revisa la conexión con Firebase."}`
        : `No se pudo guardar: ${error?.message || "Comprueba tu conexión e inténtalo de nuevo."}`;
  } finally {
    updateStatus();
  }
}

function resetBoxForm() {
  boxForm.reset();
  const resetToday = new Date();
  dateField.value = new Date(resetToday.getTime() - resetToday.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  users.length = 0;
  selectedId = null;
  editingVerifiedBoxId = null;
  cancelBoxEditButton.hidden = true;
  markBoxVerifiedButton.textContent = "Caja verificada";
  cedulaInput.value = "";
  inlineError.textContent = "";
  detailPanel.innerHTML = '<div class="detail-placeholder"><span class="detail-icon">⌕</span><strong>Selecciona una cédula</strong><p>Aquí verás el puerto asignado y los accesos a los detalles del usuario.</p></div>';
  try { localStorage.removeItem(BOX_DRAFT_KEY); } catch { /* Ignore unavailable local storage. */ }
  renderList();
  updateStatus();
  updatePortAnnotation();
  copyStatus.textContent = "Los datos de la caja se limpiaron. Puedes registrar la siguiente.";
}

function cleanCell(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function updateSheetRows() {
  const data = boxData();
  const ready = Boolean(data.date && data.boxType && data.boxNumber.trim() && data.address.trim() && data.technician.trim() && data.advisor.trim());
  copySheetButton.disabled = !ready || !users.length;
  if (!ready) {
    copyStatus.textContent = "Completa los datos generales de la caja.";
    return;
  }

  const maxPort = Math.max(data.boxType === "x16" ? 16 : 8, ...users.map(user => listOrderFor(user)));
  const groups = Math.ceil(maxPort / 8);
  const rowCount = groups * 8 + Math.max(0, groups - 1) * 2;
  copyStatus.textContent = `Bloque ${data.boxType.toUpperCase()} listo: ${rowCount} filas, con puertos en grupos de 8.`;
}

function renderList() {
  users.sort((a, b) => listOrderFor(a) - listOrderFor(b));
  const boxType = boxData().boxType;
  userList.innerHTML = users.map((user, index) => { const action = portActionFor(user); const actionClass = action === "cancelled" ? "action-cancelled" : action === "splitter" ? "action-splitter" : action === "addressChange" ? "action-address-change" : action === "notRegistered" ? "action-not-registered" : "action-active"; return `<li><div class="user-row-shell"><button class="user-row ${user.id === selectedId ? "selected" : ""} ${actionClass}" type="button" data-user-id="${escapeHtml(user.id)}" aria-pressed="${user.id === selectedId}"><span class="port-tag">Puerto ${listOrderFor(user, index)}</span><span class="user-id">${escapeHtml(user.cedula)}</span><span class="port-real-tag">${realPortDisplayLabel(portFor(user), boxType)}</span></button><button class="identity-edit-button" type="button" data-edit-identity="${escapeHtml(user.id)}" title="Editar cédula" aria-label="Editar cédula de ${escapeHtml(user.cedula)}">✎</button><button class="identity-delete-button" type="button" data-delete-user="${escapeHtml(user.id)}" title="Eliminar cédula" aria-label="Eliminar cédula ${escapeHtml(user.cedula)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button></div></li>`; }).join("");
  emptyUsers.hidden = users.length > 0;
  userCount.textContent = `${users.length} registro${users.length === 1 ? "" : "s"}`;
  openAllOnusButton.disabled = users.length === 0;
  if (!users.length) { pendingOnuUsers = []; popupStatus.textContent = ""; openAllOnusButton.textContent = "↗ Todas las ONU"; }
  userList.querySelectorAll("[data-user-id]").forEach(button => button.addEventListener("click", () => selectUser(button.dataset.userId)));
  userList.querySelectorAll("[data-edit-identity]").forEach(button => button.addEventListener("click", () => startIdentityEdit(button.dataset.editIdentity)));
  userList.querySelectorAll("[data-delete-user]").forEach(button => button.addEventListener("click", () => deleteUser(button.dataset.deleteUser)));
  updateStatus();
}

function deleteUser(id) {
  const index = users.findIndex(item => item.id === id);
  if (index < 0) return;
  users.splice(index, 1);
  if (selectedId === id) selectedId = users[0]?.id || null;
  saveBoxDraft();
  renderList();
  if (selectedId) selectUser(selectedId);
  else detailPanel.innerHTML = '<div class="detail-placeholder"><span class="detail-icon">⌕</span><strong>Selecciona una cédula</strong><p>Aquí verás el puerto asignado y los accesos a los detalles del usuario.</p></div>';
}

function startIdentityEdit(id) {
  const user = users.find(item => item.id === id);
  const row = userList.querySelector(`[data-edit-identity="${CSS.escape(id)}"]`)?.closest("li");
  if (!user || !row) return;
  const form = document.createElement("form");
  form.className = "user-inline-edit";
  const label = document.createElement("label");
  label.textContent = `Editar cédula · Puerto ${listOrderFor(user, users.indexOf(user))}`;
  const input = document.createElement("input");
  input.name = "identity";
  input.value = user.cedula;
  input.required = true;
  input.setAttribute("aria-label", "Cédula o dirección");
  const actions = document.createElement("div");
  actions.className = "user-inline-edit-actions";
  const save = document.createElement("button"); save.type = "submit"; save.className = "primary"; save.textContent = "Guardar";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "secondary"; cancel.textContent = "Cancelar"; cancel.addEventListener("click", renderList);
  const error = document.createElement("span"); error.className = "inline-error"; error.setAttribute("role", "alert");
  actions.append(save, cancel);
  form.append(label, input, actions, error);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const identity = input.value.trim();
    if (!identity) { error.textContent = "Escribe una cédula o dirección."; return; }
    if (users.some(item => item.id !== user.id && item.cedula.toLocaleLowerCase() === identity.toLocaleLowerCase())) {
      error.textContent = "Esa cédula ya está registrada en esta caja.";
      return;
    }
    user.cedula = identity;
    selectedId = user.id;
    saveBoxDraft();
    renderList();
    selectUser(user.id);
  });
  row.replaceChildren(form);
  input.focus();
  input.select();
}

function updatePortAnnotation() {
  const data = boxData();
  const user = users.find(item => item.id === selectedId);
  const dateMatch = String(data.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateMatch ? `${Number(dateMatch[3])}/${Number(dateMatch[2])}/${dateMatch[1]}` : "";
  const action = portActionText(portActionFor(user));
  const technician = String(data.technician || "").trim();
  const advisor = String(data.advisor || "").trim();
  const complete = Boolean(date && action && technician && advisor);
  portAnnotationOutput.value = complete ? `${date} ${action} ${technician} - ${advisor} - ${formatCurrentTime()}` : "";
  copyPortAnnotationButton.disabled = !complete;
  if (!user) portAnnotationStatus.textContent = "Selecciona un puerto y una acción en su detalle.";
  else if (!action) portAnnotationStatus.textContent = "Elige la acción en el detalle del puerto seleccionado.";
  else if (!complete) portAnnotationStatus.textContent = "Completa la fecha, el técnico y el asesor en los datos de la caja.";
  else portAnnotationStatus.textContent = `Anotación lista para ${user.cedula}.`;
}

function portCellComment(user) {
  const action = portActionFor(user);
  const comment = String(user.comment || "").trim();
  const parts = [user.cedula];
  if (["addressChange", "notRegistered"].includes(action)) {
    const actionText = portActionText(action);
    if (!comment.toLocaleLowerCase().startsWith(actionText.toLocaleLowerCase())) parts.push(actionText);
    if (comment) parts.push(comment);
  } else if (comment) parts.push(comment);
  if (action) parts.push(formatCurrentTime());
  return parts.map(cleanCell).filter(Boolean).join(" - ");
}

function changePortAction(user, nextAction) {
  const previousText = portActionText(portActionFor(user));
  let extraComment = String(user.comment || "").trim();
  if (previousText && extraComment.toLocaleLowerCase().startsWith(previousText.toLocaleLowerCase())) {
    extraComment = extraComment.slice(previousText.length).replace(/^\s*(?:[-–—·:]\s*)?/, "").trim();
  }
  const nextText = portActionText(nextAction);
  user.portAction = nextAction;
  user.orangeBackground = nextAction === "cancelled";
  user.comment = [nextText, extraComment].filter(Boolean).join(" - ");
}

function selectUser(id) {
  selectedId = id;
  const user = users.find(item => item.id === id);
  if (!user) return;
  const data = boxData();
  const links = `<a class="detail-link" href="${onuUrl(user.cedula)}" target="_blank" rel="noopener noreferrer">ONU <span aria-hidden="true">↗</span></a><a class="detail-link" href="${notesUrl(user.cedula)}" target="_blank" rel="noopener noreferrer">Anotaciones <span aria-hidden="true">↗</span></a>`;
  const currentAction = portActionFor(user);
  detailPanel.innerHTML = `<div class="user-detail"><span class="detail-kicker">DETALLE DE IDENTIFICACIÓN</span><h3>${escapeHtml(user.cedula)}</h3><dl class="detail-data"><div><dt>Orden de la lista del técnico</dt><dd>Lista ${listOrderFor(user, users.indexOf(user))}</dd></div><div><dt>Puerto real actual</dt><dd>${realPortLabel(portFor(user), data.boxType)}</dd></div><div><dt>Tipo de caja</dt><dd>${escapeHtml((data.boxType || "x8").toUpperCase())}</dd></div><div><dt>Número de caja</dt><dd>${escapeHtml(data.boxNumber || "—")}</dd></div><div><dt>Técnico</dt><dd>${escapeHtml(data.technician || "—")}</dd></div><div><dt>Asesor</dt><dd>${escapeHtml(data.advisor || "—")}</dd></div></dl><label class="comment-label" for="portComment">Comentario de este puerto</label><textarea id="portComment" class="port-comment" placeholder="Ej. Se instaló primer splitter">${escapeHtml(user.comment || "")}</textarea><fieldset class="port-action-choices"><legend>Acción del puerto</legend><label class="port-action-choice active ${!currentAction ? "selected" : ""}"><input type="radio" name="portAction" value="" ${!currentAction ? "checked" : ""}><span>Activo (sin marca)</span></label><label class="port-action-choice cancelled ${currentAction === "cancelled" ? "selected" : ""}"><input type="radio" name="portAction" value="cancelled" ${currentAction === "cancelled" ? "checked" : ""}><span>Se toma puerto cancelado</span></label><label class="port-action-choice splitter ${currentAction === "splitter" ? "selected" : ""}"><input type="radio" name="portAction" value="splitter" ${currentAction === "splitter" ? "checked" : ""}><span>Se coloca splitter</span></label><label class="port-action-choice address-change ${currentAction === "addressChange" ? "selected" : ""}"><input type="radio" name="portAction" value="addressChange" ${currentAction === "addressChange" ? "checked" : ""}><span>Cliente cambio de dirección</span></label><label class="port-action-choice not-registered ${currentAction === "notRegistered" ? "selected" : ""}"><input type="radio" name="portAction" value="notRegistered" ${currentAction === "notRegistered" ? "checked" : ""}><span>Cliente no registra</span></label></fieldset><nav class="detail-links" aria-label="Detalles del usuario">${links}</nav></div>`;
  const editForm = document.createElement("form");
  editForm.className = "record-edit-form";
  editForm.innerHTML = `<label for="editIdentity">Cédula o dirección</label><input id="editIdentity" name="identity" required value="${escapeHtml(user.cedula)}"><label for="editPort">Puerto real (1–${data.boxType === "x16" ? "16" : "8"})</label><input id="editPort" name="port" type="number" min="1" max="${data.boxType === "x16" ? "16" : "8"}" step="1" required value="${portFor(user)}"><button type="submit" class="secondary">Guardar cambios</button>`;
  detailPanel.querySelector(".user-detail").insertBefore(editForm, detailPanel.querySelector(".detail-links"));
  editForm.addEventListener("submit", event => { event.preventDefault(); const identity = editForm.elements.identity.value.trim(); const port = Number(editForm.elements.port.value); const maxPort = data.boxType === "x16" ? 16 : 8; if (!identity || !Number.isInteger(port) || port < 1 || port > maxPort) return; if (users.some(item => item.id !== user.id && item.cedula.toLocaleLowerCase() === identity.toLocaleLowerCase())) { inlineError.textContent = "Ese dato ya está registrado."; return; } user.cedula = identity; user.port = port; inlineError.textContent = ""; selectUser(user.id); });
  detailPanel.querySelector("#portComment").addEventListener("input", event => {
    user.comment = event.target.value;
    updateSheetRows();
    saveBoxDraft();
  });
  detailPanel.querySelectorAll('input[name="portAction"]').forEach(input => input.addEventListener("change", event => {
    changePortAction(user, event.target.value);
    detailPanel.querySelector("#portComment").value = user.comment;
    saveBoxDraft();
    renderList();
    updatePortAnnotation();
    selectUser(user.id);
  }));
  updatePortAnnotation();
  renderList();
}

copyPortAnnotationButton.addEventListener("click", async () => {
  updatePortAnnotation();
  if (!portAnnotationOutput.value) return;
  try {
    await navigator.clipboard.writeText(portAnnotationOutput.value);
    portAnnotationStatus.textContent = "Anotación copiada.";
  } catch {
    portAnnotationOutput.focus();
    portAnnotationOutput.select();
    portAnnotationStatus.textContent = "Anotación seleccionada; cópiala con Ctrl+C.";
  }
});

userForm.addEventListener("submit", event => {
  event.preventDefault();
  const cedula = cedulaInput.value.trim();
  inlineError.textContent = "";
  if (!cedula) {
    inlineError.textContent = "Escribe la identificación del usuario para agregarla.";
    return;
  }
  if (users.some(user => user.cedula.toLocaleLowerCase() === cedula.toLocaleLowerCase())) {
    inlineError.textContent = "Esa cédula ya está registrada en esta caja.";
    return;
  }
  const listOrder = users.length ? Math.max(...users.map(user => listOrderFor(user))) + 1 : 1;
  const maxPort = boxData().boxType === "x16" ? 16 : 8;
  const occupiedPorts = new Set(users.map(user => portFor(user)));
  let port = 1;
  while (occupiedPorts.has(port) && port <= maxPort) port += 1;
  if (port > maxPort) port = ((listOrder - 1) % maxPort) + 1;
  const user = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, cedula, port, listOrder, orangeBackground: false, portAction: "" };
  users.push(user);
  cedulaInput.value = "";
  selectUser(user.id);
  cedulaInput.focus();
});

boxForm.addEventListener("input", () => {
  updateStatus();
  if (selectedId) selectUser(selectedId);
  else updatePortAnnotation();
});

document.querySelector("#clearUsers").addEventListener("click", () => {
  editingVerifiedBoxId = null;
  resetBoxForm();
});

function sheetPortRows() {
  const data = boxData();
  const maxPort = Math.max(data.boxType === "x16" ? 16 : 8, ...users.map(user => listOrderFor(user)));
  const groupCount = Math.ceil(maxPort / 8);
  const rows = [];
  for (let group = 0; group < groupCount; group += 1) {
    for (let localPort = 1; localPort <= 8; localPort += 1) {
      const port = group * 8 + localPort;
      if (port > maxPort) break;
      rows.push({ port, label: localPort });
    }
    if (group < groupCount - 1) rows.push(null, null);
  }
  if (data.boxType === "x16") rows.push(null, null);
  else rows.push(null, null, null, null, null, null);
  return rows;
}

function sheetTableMarkup() {
  const data = boxData();
  const [year, month, day] = data.date.split("-");
  const portRows = sheetPortRows();
  const blockRows = portRows.length;
  const border = "1px solid #111827";
  const base = `border:${border};padding:3px 5px;font:10px Arial,sans-serif;vertical-align:middle;`;
  const generalCells = [
    `${day}/${month}/${year}`, data.boxNumber, data.address, data.technician, data.advisor
  ].map(value => `<td rowspan="${blockRows}" style="${base}text-align:center;min-width:75px;">${escapeHtml(cleanCell(value))}</td>`).join("");
  const rows = portRows.map((slot, index) => {
    const portUsers = slot ? users.filter(item => listOrderFor(item) === slot.port) : [];
    const comment = portUsers.map(portCellComment).filter(Boolean).join(" · ");
    const action = portUsers.map(portActionFor).find(Boolean) || "";
    const general = index === 0 ? generalCells : "";
    const label = slot?.label ?? "";
    const actionColor = action === "cancelled" ? "#ff9900" : action === "splitter" ? "#38bdf8" : action === "addressChange" ? "#c084fc" : action === "notRegistered" ? "#fb7185" : "";
    const cellStyle = `${base}text-align:left;min-width:280px;${actionColor ? `background-color:${actionColor};color:#111827;` : ""}`;
    return `<tr>${general}<td style="${base}text-align:center;width:28px;">${label}</td><td style="${cellStyle}">${escapeHtml(comment)}</td></tr>`;
  }).join("");
  return `<table style="border-collapse:collapse;border-spacing:0;"><tbody>${rows}</tbody></table>`;
}

async function copyFormattedBlock() {
  const data = boxData();
  const portRows = sheetPortRows();
  const blockRows = portRows.length;
  const [year, month, day] = data.date.split("-");
  const general = [`${day}/${month}/${year}`, data.boxNumber, data.address, data.technician, data.advisor];
  const plainRows = portRows.map((slot, index) => [
    ...(index === 0 ? general : ["", "", "", "", ""]), slot?.label ?? "",
    slot ? users.filter(user => listOrderFor(user) === slot.port).map(portCellComment).filter(Boolean).join(" · ") : ""
  ].map(cleanCell).join("\t")).join("\n");
  const html = sheetTableMarkup();
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    copyStatus.textContent = "Este navegador no permite copiar formato enriquecido. Abre INTERCOL en Chrome o Edge por una dirección segura (HTTPS) e inténtalo de nuevo.";
    return;
  }
  try {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plainRows], { type: "text/plain" })
    });
    await navigator.clipboard.write([item]);
    copyStatus.textContent = "Bloque con formato copiado. Pégalo en la primera celda del bloque vacío de la hoja.";
  } catch (error) {
    copyStatus.textContent = "No se pudo copiar el formato. Revisa que el navegador permita el portapapeles para esta página.";
  }
}

copySheetButton.addEventListener("click", copyFormattedBlock);
markBoxVerifiedButton.addEventListener("click", saveVerifiedBox);
cancelBoxEditButton.addEventListener("click", () => {
  if (!editingVerifiedBoxId) return;
  resetBoxForm();
  copyStatus.textContent = "Edición cancelada. Puedes empezar otra caja.";
});
verifiedSearch.addEventListener("input", renderVerifiedBoxes);
verifiedType.addEventListener("change", renderVerifiedBoxes);
document.querySelector("#openPublicVerifiedList").addEventListener("click", () => window.parent.postMessage({ type: "INTERCOL_OPEN_VERIFIED_BOXES" }, "*"));

openAllOnusButton.addEventListener("click", () => {
  if (pendingOnuUsers.length) {
    const user = pendingOnuUsers.shift();
    const tab = window.open(onuUrl(user.cedula), "_blank");
    if (tab) {
      tab.opener = null;
      popupStatus.textContent = pendingOnuUsers.length
        ? `Abierta ${user.cedula}. Pulsa “Abrir siguiente ONU” para continuar (${pendingOnuUsers.length} restantes).`
        : `Listo: se abrieron todas las ONU.`;
    } else {
      pendingOnuUsers.unshift(user);
      popupStatus.textContent = "El navegador sigue bloqueando las pestañas. Permite ventanas emergentes para INTERCOL e inténtalo de nuevo.";
    }
    openAllOnusButton.textContent = pendingOnuUsers.length ? `Abrir siguiente ONU (${pendingOnuUsers.length})` : "↗ Todas las ONU";
    return;
  }

  popupStatus.textContent = "";
  const blockedUsers = [];
  users.forEach(user => {
    const tab = window.open(onuUrl(user.cedula), "_blank");
    if (tab) tab.opener = null;
    else blockedUsers.push(user);
  });
  pendingOnuUsers = blockedUsers;
  if (pendingOnuUsers.length) {
    openAllOnusButton.textContent = `Abrir siguiente ONU (${pendingOnuUsers.length})`;
    popupStatus.textContent = `El navegador permitió algunas pestañas y bloqueó ${pendingOnuUsers.length}. Pulsa el botón para abrirlas una por una.`;
  } else {
    popupStatus.textContent = "Listo: se abrieron todas las ONU.";
    openAllOnusButton.textContent = "↗ Todas las ONU";
  }
});
window.addEventListener("message", event => {
  if (event.data?.type === "INTERCOL_THEME") {
    Object.entries(event.data.variables || {}).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));
    document.documentElement.dataset.theme = event.data.theme || "light";
  }
  if (event.data?.type === "INTERCOL_AUTH_STATE") {
    const previousUid = advisorAuth.user?.uid || null;
    const previouslyReady = Boolean(advisorAuth.user && advisorAuth.profile);
    advisorAuth = { user: event.data.user || null, profile: event.data.profile || null, isAdmin: Boolean(event.data.isAdmin) };
    if (previousUid !== advisorAuth.user?.uid || previouslyReady !== Boolean(advisorAuth.user && advisorAuth.profile)) syncVerifiedBoxes();
    else renderVerifiedBoxes();
  }
});
window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");
window.parent.addEventListener("intercol-firebase-ready", syncVerifiedBoxes);

const resizeSection = () => window.parent.postMessage({ type: "INTERCOL_SECTION_RESIZE", height: document.documentElement.scrollHeight }, "*");
new ResizeObserver(resizeSection).observe(document.documentElement);
renderList();
if (selectedId) selectUser(selectedId);
else updatePortAnnotation();
syncVerifiedBoxes();
window.addEventListener("load", resizeSection);
setTimeout(resizeSection, 80);
renderVerifiedBoxes();









