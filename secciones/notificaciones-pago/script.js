const form = document.querySelector("#notificationForm");
const formStatus = document.querySelector("#formStatus");
const saveButton = document.querySelector("#saveButton");
const cancelEditButton = document.querySelector("#cancelEdit");
const dateInput = form.elements.notificationDate;
const firebase = window.parent.INTERCOL_FIREBASE;
let records = [];
let activeTab = "pending";
let advisor = null;
let stopSync = null;
let busy = false;
function dateKey(date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function todayKey() { return dateKey(new Date()); }
function formatDate(value, options = { day: "numeric", month: "long" }) { return new Date(value + "T12:00:00").toLocaleDateString("es-CO", options); }
function reportError(error) { console.error("Error en notificaciones de pago:", error); formStatus.textContent = error.code === "permission-denied" ? "Firebase bloqueó esta operación. Confirma las reglas de Firestore y que estés usando tu cuenta." : "No se pudo guardar/cargar. Revisa tu conexión e inténtalo de nuevo."; }
function normalizeRecord(item) { return { id: item.id, customerName: String(item.nombre || ""), customerId: String(item.cedula || ""), notificationDate: String(item.fechaNotificacion || ""), reviewed: Boolean(item.revisado), reviewedAt: item.revisadoEn?.toDate ? item.revisadoEn.toDate().toISOString() : item.revisadoEn || "" }; }
function resetForm() { form.reset(); form.elements.recordId.value = ""; dateInput.value = todayKey(); saveButton.textContent = "Agregar notificación"; cancelEditButton.hidden = true; document.querySelector("#formTitle").textContent = "Nueva notificación"; }
function beginEdit(record) { form.elements.recordId.value = record.id; form.elements.customerName.value = record.customerName; form.elements.customerId.value = record.customerId; dateInput.value = record.notificationDate; saveButton.textContent = "Guardar cambios"; cancelEditButton.hidden = false; document.querySelector("#formTitle").textContent = "Editar notificación"; formStatus.textContent = "Editando a " + record.customerName + "."; form.elements.customerName.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function node(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function makeRecordCard(record, status) {
  const card = node("article", "record-card" + (status === "today" ? " is-today" : "") + (status === "overdue" ? " is-overdue" : ""));
  const main = node("div", "record-main"); const nameRow = node("div", "record-name-row");
  nameRow.append(node("strong", "record-name", record.customerName));
  nameRow.append(node("span", "record-date", status === "today" ? "Hoy" : status === "overdue" ? "Vencida · " + formatDate(record.notificationDate) : formatDate(record.notificationDate)));
  main.append(nameRow, node("div", "record-id", "Cédula: " + record.customerId));
  const actions = node("div", "record-actions");
  const review = node("button", "record-action " + (status === "reviewed" ? "" : "complete"), status === "reviewed" ? "Volver a pendientes" : "Marcar revisado"); review.type = "button"; review.addEventListener("click", () => changeReviewed(record.id, status !== "reviewed")); actions.append(review);
  const invoice = node("a", "record-action invoice-link", "Revisar factura"); invoice.href = "http://wisphub.net/clientes/ver/" + encodeURIComponent(record.customerId) + "@cibercitywisp/#retab3"; invoice.target = "_blank"; invoice.rel = "noopener noreferrer";
  const edit = node("button", "record-action", "Editar"); edit.type = "button"; edit.addEventListener("click", () => beginEdit(record));
  const remove = node("button", "record-action delete", "Eliminar"); remove.type = "button"; remove.addEventListener("click", () => deleteRecord(record));
  actions.append(invoice, edit, remove); card.append(main, actions); return card;
}
function renderGroup(listId, emptyId, rows, status) { const list = document.querySelector("#" + listId); list.replaceChildren(); rows.forEach(record => list.append(makeRecordCard(record, status))); if (emptyId) document.querySelector("#" + emptyId).hidden = rows.length > 0; }
function setCount(id, value) { document.querySelector("#" + id).textContent = String(value); }
function render() {
  const today = todayKey(); const pending = records.filter(record => !record.reviewed);
  const reviewed = records.filter(record => record.reviewed).sort((a,b) => (b.reviewedAt || "").localeCompare(a.reviewedAt || ""));
  const dueToday = pending.filter(record => record.notificationDate === today).sort((a,b) => a.customerName.localeCompare(b.customerName,"es"));
  const overdue = pending.filter(record => record.notificationDate < today).sort((a,b) => a.notificationDate.localeCompare(b.notificationDate) || a.customerName.localeCompare(b.customerName,"es"));
  const upcoming = pending.filter(record => record.notificationDate > today).sort((a,b) => a.notificationDate.localeCompare(b.notificationDate) || a.customerName.localeCompare(b.customerName,"es"));
  const todayText = formatDate(today, { weekday:"long", day:"numeric", month:"long" });
  document.querySelector("#todayDate").textContent = todayText; document.querySelector("#todayLabel").textContent = "Avisos del " + todayText + ".";
  [["todayCount",dueToday.length],["upcomingCount",upcoming.length],["reviewedCount",reviewed.length],["pendingTabCount",pending.length],["reviewedTabCount",reviewed.length],["todayGroupCount",dueToday.length],["overdueGroupCount",overdue.length],["upcomingGroupCount",upcoming.length],["reviewedGroupCount",reviewed.length]].forEach(([id,value]) => setCount(id,value));
  const alert = document.querySelector("#todayAlert"), dueCount = dueToday.length + overdue.length; alert.hidden = dueCount === 0;
  if (dueCount) { document.querySelector("#alertTitle").textContent = dueToday.length ? dueToday.length + " usuario" + (dueToday.length === 1 ? "" : "s") + " por verificar hoy" : "Tienes notificaciones pendientes"; document.querySelector("#alertText").textContent = overdue.length ? overdue.length + " pendiente" + (overdue.length === 1 ? "" : "s") + " de fechas anteriores." : "Revisa la lista y marca cada seguimiento cuando termines."; }
  document.querySelector("#overdueGroup").hidden = overdue.length === 0;
  renderGroup("todayList","todayEmpty",dueToday,"today"); renderGroup("overdueList",null,overdue,"overdue"); renderGroup("upcomingList","upcomingEmpty",upcoming,"upcoming"); renderGroup("reviewedList","reviewedEmpty",reviewed,"reviewed");
  document.querySelector("#pendingPanel").hidden = activeTab !== "pending"; document.querySelector("#reviewedPanel").hidden = activeTab !== "reviewed";
  document.querySelectorAll("[data-tab]").forEach(button => { const active = button.dataset.tab === activeTab; button.classList.toggle("active",active); button.setAttribute("aria-selected",String(active)); });
  window.parent.postMessage({ type:"INTERCOL_SECTION_RESIZE", height:document.documentElement.scrollHeight },"*");
}
async function changeReviewed(id, reviewed) { try { setBusy(true); await firebase.setPaymentNotificationReviewed(id, reviewed, advisor.asesor); formStatus.textContent = reviewed ? "Usuario marcado como revisado." : "Usuario devuelto a pendientes."; } catch (error) { reportError(error); } finally { setBusy(false); } }
async function deleteRecord(record) { if (!window.confirm("¿Eliminar la notificación de " + record.customerName + "?")) return; try { setBusy(true); await firebase.deletePaymentNotification(record.id); formStatus.textContent = "Notificación eliminada."; if (form.elements.recordId.value === record.id) resetForm(); } catch (error) { reportError(error); } finally { setBusy(false); } }
function setBusy(value) { busy = value; saveButton.disabled = value; }
form.addEventListener("submit", async event => {
  event.preventDefault(); if (!advisor || busy) return;
  const recordId = form.elements.recordId.value, customerName = form.elements.customerName.value.trim(), customerId = form.elements.customerId.value.trim(), notificationDate = dateInput.value;
  if (!customerName || !customerId || !notificationDate) { formStatus.textContent = "Completa el nombre, la cédula y la fecha."; return; }
  if (records.some(row => row.id !== recordId && row.customerId.toLowerCase() === customerId.toLowerCase() && row.notificationDate === notificationDate && !row.reviewed)) { formStatus.textContent = "Ya existe una notificación pendiente para esa cédula y fecha."; return; }
  try { setBusy(true); if (recordId) { await firebase.updatePaymentNotification(recordId,{customerName,customerId,notificationDate}); formStatus.textContent = "Notificación actualizada."; } else { await firebase.createPaymentNotification({customerName,customerId,notificationDate,advisorUid:advisor.uid,advisorName:advisor.asesor}); formStatus.textContent = "Notificación agregada."; } resetForm(); }
  catch (error) { reportError(error); } finally { setBusy(false); }
});
cancelEditButton.addEventListener("click", () => { resetForm(); formStatus.textContent = ""; });
document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => { activeTab = button.dataset.tab; render(); }));
window.addEventListener("message", event => {
  if (event.data?.type === "INTERCOL_THEME") { document.documentElement.dataset.theme = event.data.theme; Object.entries(event.data.variables || {}).forEach(([key,value]) => document.documentElement.style.setProperty(key,value)); }
  if (event.data?.type === "INTERCOL_AUTH_STATE") {
    if (stopSync) { stopSync(); stopSync = null; }
    advisor = event.data.user && event.data.profile ? { uid:event.data.user.uid, asesor:event.data.profile.asesor } : null;
    records = [];
    if (!advisor) { formStatus.textContent = "Inicia sesión para cargar tus notificaciones."; render(); return; }
    formStatus.textContent = "Cargando tus notificaciones…";
    stopSync = firebase.subscribePaymentNotifications(advisor.uid, items => { records = items.map(normalizeRecord); formStatus.textContent = ""; render(); }, reportError);
  }
});
window.parent.postMessage({type:"INTERCOL_SECTION_READY"},"*");
dateInput.value = todayKey(); render(); window.setInterval(render,60000); document.addEventListener("visibilitychange",()=>{if(!document.hidden)render();});
