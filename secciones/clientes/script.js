const $ = selector => document.querySelector(selector);
const clientsHost = $("#clientList");
const notificationsHost = $("#notificationList");
const detailsHost = $("#clientCardPanel");
const processNames = { reconexion: "Reconexión", "cambio-fecha-pago": "Cambio de fecha de pago", "cambio-plan": "Cambio de plan" };
const processStepTemplates = {
  reconexion: ["Actualiza cuánto se le cobra a este cliente por la reconexión", "¿Generaste o ajustaste la factura?", "¿Cambiaste la fecha de pago?", "¿Hiciste la anotación?"],
  "cambio-fecha-pago": ["Confirmar cliente y fecha de pago actual", "Acordar la nueva fecha de pago", "Actualizar la fecha en la plataforma", "Confirmar el cambio con el cliente"],
  "cambio-plan": ["Confirmar cliente y plan actual", "Acordar el nuevo plan", "Actualizar el plan en la plataforma", "Confirmar el cambio con el cliente"]
};
const processStepHelp = {
  reconexion: [
    "Selecciona el valor de reconexión que se guardará en la ficha del cliente.",
    "Abre las facturas pendientes en Wisphub y selecciona si generaste una factura nueva o ajustaste una existente.",
    "Actualiza la fecha de pago en Wisphub y registra el día del mes que quedó (del 1 al 30).",
    "Abre las anotaciones en Wisphub, copia el texto preparado y confirma que hiciste la anotación. También puedes programar la revisión de la próxima factura."
  ]
};
const legacyReconnectionSteps = ["Confirmar cliente y validar su cédula", "Verificar estado del servicio y motivo de suspensión", "Realizar la reconexión en la plataforma", "Confirmar con el cliente que el servicio funciona"];
let clients = [];
let processes = [];
let customerInvoiceRecords = [];
let customerInvoiceLoadError = "";
let customerInvoiceLoading = false;
let selectedClientId = null;
let selectedClientHistoryTab = "resumen";
let selectedInvoiceHistoryStatus = "pending";
let profileMode = false;
let editingClientProfileId = null;
let isAuthenticated = false;
let currentUserUid = "";
let currentUserName = "";
let currentUserIsAdmin = false;
let stopClientsSync = null;
let stopProcessesSync = null;
let stopCustomerInvoiceSync = null;
let stopAdjustmentZonesSync = null;
let adjustmentZones = [{ nombre: "Zona general", valor: 15000 }, { nombre: "Zona especial", valor: 20000 }];
const processSaveErrors = new Map();
let processDetailSaveQueue = Promise.resolve();
function processWriteErrorMessage(error, subject) {
  console.error(`No se pudo ${subject} del proceso:`, error);
  if (error?.code === "invoice-pending-exists") return error.message;
  if (error?.code === "permission-denied") return `Firebase no autorizó ${subject}. Publica las reglas actualizadas de procesosClientes.`;
  if (error?.code === "unauthenticated") return "Tu sesión de Firebase venció. Inicia sesión de nuevo y vuelve a intentarlo.";
  if (["unavailable", "deadline-exceeded", "network-request-failed"].includes(error?.code)) return "Firebase no está disponible por ahora. Revisa tu conexión e inténtalo otra vez.";
  if (error?.code === "invalid-argument") return `Firebase rechazó un dato del proceso: ${error.message || "formato de dato no válido"}`;
  return `No se pudo ${subject}${error?.code ? ` (${error.code})` : ""}. El dato sigue en pantalla; vuelve a intentarlo.`;
}
function wizardContactDraftKey(processId) { return `intercol:process-contact:${processId}`; }
function getWizardContactDraft(processId) {
  try { return localStorage.getItem(wizardContactDraftKey(processId)) || ""; } catch { return ""; }
}
function getWizardInformationDraft(processId) {
  try { return JSON.parse(localStorage.getItem(`intercol:process-info:${processId}`) || "{}"); } catch { return {}; }
}
function findPendingCustomerInvoice(customerId) {
  const normalize = value => String(value || "").trim().toLocaleLowerCase("es").replace(/[\s.-]/g, "");
  const normalizedId = normalize(customerId);
  return normalizedId ? customerInvoiceRecords.find(record => record.revisado !== true && normalize(record.cedula) === normalizedId) || null : null;
}
function setWizardInformationDraft(processId, information) {
  try { localStorage.setItem(`intercol:process-info:${processId}`, JSON.stringify(information)); } catch { /* Firebase remains the durable store when browser storage is unavailable. */ }
}
function setWizardContactDraft(processId, value) {
  try {
    if (value) localStorage.setItem(wizardContactDraftKey(processId), value);
    else localStorage.removeItem(wizardContactDraftKey(processId));
  } catch { /* Firebase remains the durable store when browser storage is unavailable. */ }
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function timestampDate(value) { if (value?.toDate instanceof Function) return value.toDate(); const date = value instanceof Date ? value : value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
function formatDate(value) { const date = timestampDate(value); return date ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(date) : "Fecha pendiente"; }
function elapsed(value) {
  const date = timestampDate(value); if (!date) return "Calculando tiempo…";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), rest = minutes % 60;
  return [days ? `${days} d` : "", hours ? `${hours} h` : "", !days && rest ? `${rest} min` : ""].filter(Boolean).join(" ") || "Menos de 1 min";
}
function clientName(client) { return String(client.nombre || "Cliente sin nombre"); }
const clientStatusLabels = { sin_registrar: "Sin registrar", activo: "Activo", suspendido: "Suspendido", retirado: "Retirado", cancelado: "Cancelado" };
function clientStatus(client) { return clientStatusLabels[client.estadoCliente] || clientStatusLabels.sin_registrar; }
const profileVisuals = {
  "Nombre completo": ["👤", "identity"], "Cédula": ["🪪", "identity"], "Estado del servicio": ["●", "status"],
  "Plan": ["📡", "plan"], "Pago mensual": ["💵", "money"], "Fecha de pago": ["📅", "date"],
  "Fecha de corte": ["⏳", "warning"], "Generación de factura": ["🧾", "invoice"], "Zona": ["📍", "location"],
  "Número de contacto": ["📞", "contact"], "Medio de contacto": ["💬", "contact"], "Reajuste reciente": ["💰", "money"],
  "Registrado por": ["🧑‍💼", "identity"], "Cliente desde": ["🗓️", "date"]
};
function profileIcon(label) { return profileVisuals[label] || ["•", "identity"]; }
function processTypeLabel(type) { return processNames[type] || "Proceso"; }
function getProcessSteps(item) {
  if (item.tipo === "reconexion") return [...processStepTemplates.reconexion];
  return Array.isArray(item.pasos) && item.pasos.length ? item.pasos : processStepTemplates[item.tipo] || [];
}
function getCheckedProcessSteps(item) {
  const saved = new Set(Array.isArray(item.pasosVerificados) ? item.pasosVerificados.map(Number) : []);
  if (item.tipo !== "reconexion" || !Array.isArray(item.pasos)) return saved;
  const migrated = new Set();
  if (item.pasos.length === 11) {
    if (saved.has(1) && saved.has(2)) migrated.add(0);
    if (saved.has(3)) migrated.add(1);
    if (saved.has(4)) migrated.add(2);
    if (saved.has(8) && saved.has(9)) migrated.add(3);
    return migrated;
  }
  if (item.pasos.length === 5) {
    if (saved.has(1)) migrated.add(0);
    if (saved.has(2)) migrated.add(1);
    if (saved.has(3)) migrated.add(2);
    if (saved.has(4)) migrated.add(3);
    return migrated;
  }
  if (item.pasos.length === 4) return saved;
  return migrated;
}
function displayStatus() { $("#syncStatus").className = "sync-indicator ok"; $("#syncStatus").textContent = "Datos sincronizados"; }
function displayError(error, host) {
  console.error("No se pudo sincronizar Clientes:", error);
  $("#syncStatus").className = "sync-indicator error";
  $("#syncStatus").textContent = error?.code === "permission-denied" ? "Sin permiso" : "Sin conexión";
  if (host) host.innerHTML = `<p class="empty-state error-state">${error?.code === "permission-denied" ? "Firebase todavía no autoriza Clientes. Publica en el proyecto intercol-784d9 las reglas actuales del archivo firestore.rules." : "No se pudieron cargar los datos. Revisa tu conexión."}</p>`;
}
function filteredClients() {
  const term = $("#clientSearch").value.trim().toLocaleLowerCase("es");
  return clients.filter(client => !term || clientName(client).toLocaleLowerCase("es").includes(term) || String(client.cedula || "").toLocaleLowerCase("es").includes(term)).sort((a, b) => clientName(a).localeCompare(clientName(b), "es"));
}
function renderClientList() {
  const filtered = filteredClients();
  $("#clientCount").textContent = `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}`;
  clientsHost.replaceChildren();
  if (!filtered.length) { clientsHost.innerHTML = `<p class="empty-state">${clients.length ? "No hay coincidencias." : "Todavía no hay clientes registrados."}</p>`; return; }
  filtered.forEach(client => {
    const button = document.createElement("button");
    button.type = "button"; button.className = `client-list-item${client.id === selectedClientId ? " selected" : ""}`;
    button.innerHTML = `<strong>${escapeHtml(clientName(client))}</strong><span>Cédula: ${escapeHtml(client.cedula)}</span><small>${processes.filter(item => item.clienteId === client.id && item.estado === "en_curso").length} procesos abiertos</small>`;
    button.addEventListener("click", () => selectClient(client.id));
    clientsHost.append(button);
  });
}
function renderClientProfile(client, latestInformation) {
  const savedZone = client.zona || latestInformation.zonaReconexion || "";
  if (editingClientProfileId === client.id) {
    const zones = [...adjustmentZones];
    if (savedZone && !zones.some(zone => zone.nombre === savedZone)) zones.unshift({ nombre: savedZone, valor: Number(latestInformation.valorReajuste) || 0 });
    const zoneOptions = zones.map(zone => `<option value="${escapeHtml(zone.nombre)}" ${zone.nombre === savedZone ? "selected" : ""}>${escapeHtml(zone.nombre)}</option>`).join("");
    return `<form class="client-profile-editor" id="clientProfileForm"><label>Plan (opcional)<input name="plan" value="${escapeHtml(client.plan || "")}" placeholder="Nombre del plan"></label><label>Cuánto paga al mes<input name="valorMensual" type="number" min="0" step="100" value="${escapeHtml(client.valorMensual ?? "")}" placeholder="Valor en pesos"></label><label>Fecha de pago<input name="fechaPago" type="date" value="${escapeHtml(client.fechaPago || "")}"></label><label>Fecha de corte<input name="fechaCorte" type="date" value="${escapeHtml(client.fechaCorte || "")}"></label><label>Generación de factura<input name="fechaGeneracionFactura" type="date" value="${escapeHtml(client.fechaGeneracionFactura || "")}"></label><label>Zona<select name="zona"><option value="">Selecciona una zona</option>${zoneOptions}</select></label><div class="client-profile-editor-actions"><button class="profile-cancel-button" id="cancelClientProfile" type="button">Cancelar</button><button class="profile-save-button" type="submit">Guardar datos</button><span id="clientProfileStatus" role="status" aria-live="polite"></span></div></form>`;
  }
  const fields = [
    ["Plan", client.plan || "Sin registrar"],
    ["Pago mensual", client.valorMensual !== null && client.valorMensual !== undefined && client.valorMensual !== "" ? formatCurrency(client.valorMensual) : "Sin registrar"],
    ["Cobro de reconexión", client.valorReconexion ? formatCurrency(client.valorReconexion) : ""],
    ["Fecha de pago", client.diaPago ? `${client.diaPago} de cada mes` : (client.fechaPago || "Sin registrar")],
    ["Fecha de corte", client.fechaCorte || (client.diaCorte ? `${client.diaCorte} de cada mes` : "Sin registrar")],
    ["Generación de factura", client.fechaGeneracionFactura || ""],
    ["Zona", savedZone || "Sin registrar"],
    ["Número de contacto", latestInformation.numeroContacto],
    ["Medio de contacto", latestInformation.canalContacto],
    ["Reajuste reciente", latestInformation.valorReajuste ? formatCurrency(latestInformation.valorReajuste) : ""]
  ].filter(([, fieldValue]) => fieldValue);
  const visualField = (label, value) => { const [icon, tone] = profileIcon(label); return `<div class="client-profile-field" data-profile-type="${tone}"><span class="profile-field-label"><i aria-hidden="true">${icon}</i>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; };
  const [statusIcon] = profileIcon("Estado del servicio");
  return `<section class="client-profile-data" aria-label="Datos del cliente">${visualField("Nombre completo", clientName(client))}${visualField("Cédula", client.cedula)}<label class="client-profile-field client-status-inline" data-profile-type="status"><span class="profile-field-label"><i aria-hidden="true">${statusIcon}</i>Estado del servicio</span><select name="estadoCliente" data-client-status class="status-${escapeHtml(client.estadoCliente || "sin_registrar")}">${Object.entries(clientStatusLabels).map(([value, label]) => `<option value="${value}" ${client.estadoCliente === value || (!client.estadoCliente && value === "sin_registrar") ? "selected" : ""}>${label}</option>`).join("")}</select><small id="clientStatusSaveStatus" role="status" aria-live="polite"></small></label>${fields.map(([label, fieldValue]) => visualField(label, fieldValue)).join("")}${visualField("Registrado por", client.creadoPorNombre || "Asesor")}${visualField("Cliente desde", formatDate(client.creadoEn))}</section>`;
}
async function saveClientProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const status = $("#clientProfileStatus");
  const button = form.querySelector('[type="submit"]');
  const client = clients.find(item => item.id === selectedClientId);
  const monthlyValue = String(formData.get("valorMensual") || "").trim();
  const profile = {
    plan: String(formData.get("plan") || "").trim() || null,
    valorMensual: monthlyValue ? Number(monthlyValue) : null,
    fechaPago: String(formData.get("fechaPago") || "").trim() || null,
    fechaCorte: String(formData.get("fechaCorte") || "").trim() || null,
    fechaGeneracionFactura: String(formData.get("fechaGeneracionFactura") || "").trim() || null,
    zona: String(formData.get("zona") || "").trim() || null
  };
  if (!client) return;
  if (monthlyValue && (!Number.isFinite(profile.valorMensual) || profile.valorMensual < 0)) { status.textContent = "Escribe un valor mensual válido."; return; }
  if ([profile.diaPago, profile.diaCorte].some(day => day && (!/^\d+$/.test(day) || Number(day) < 1 || Number(day) > 31))) { status.textContent = "El día de pago y de corte deben estar entre 1 y 31."; return; }
  button.disabled = true; status.textContent = "Guardando ficha…";
  try {
    await window.parent.INTERCOL_FIREBASE.updateClientProfile(client.id, profile);
    clients = clients.map(item => item.id === client.id ? { ...item, ...profile } : item);
    editingClientProfileId = null;
    renderClientDetails();
  } catch (error) {
    console.error("No se pudo actualizar la ficha del cliente:", error);
    status.textContent = error?.code === "permission-denied" ? "Firebase no autorizó actualizar estos datos del cliente." : "No se pudieron guardar los datos. Revisa la conexión e inténtalo de nuevo.";
    button.disabled = false;
  }
}
function applyProfileMode() {
  $(".notifications").hidden = profileMode;
  $(".client-list-panel").hidden = profileMode;
  $(".clients-layout").classList.toggle("profile-mode", profileMode);
}
function processCard(item, showClient = false) {
  const open = item.estado !== "completado";
  const steps = getProcessSteps(item);
  const checked = getCheckedProcessSteps(item);
  const owner = item.iniciadoPorUid === currentUserUid;
  const canDelete = owner || currentUserIsAdmin;
  const currentStep = steps.findIndex((_, index) => !checked.has(index));
  const progress = steps.length ? `<section class="process-timeline" data-process-details="${escapeHtml(item.id)}" hidden aria-label="Pasos de ${escapeHtml(processTypeLabel(item.tipo))}"><div class="timeline-summary">${currentStep < 0 ? "Todos los pasos completados" : `Paso actual: ${currentStep + 1} de ${steps.length} · ${escapeHtml(steps[currentStep])}`}</div><ol>${steps.map((step, index) => { const done = checked.has(index); const current = index === currentStep; return `<li class="timeline-step ${done ? "is-done" : current ? "is-current" : "is-pending"}"><span class="timeline-marker" aria-hidden="true">${done ? "✓" : index + 1}</span><span class="timeline-step-copy"><strong>${escapeHtml(step)}</strong><small>${done ? "Completado" : current ? "Pendiente · paso actual" : "Pendiente"}</small></span></li>`; }).join("")}</ol><p class="process-save-status" role="status">${escapeHtml(processSaveErrors.get(item.id) || (owner ? "El avance se guarda al completar cada tarea." : `Solo ${item.iniciadoPorNombre || "quien inició el proceso"} puede continuarlo o editarlo.`))}</p></section>` : `<p class="empty-state">El checklist de este tipo de proceso aún no está configurado.</p>`;
  const continueButton = owner && open ? `<button class="continue-process-button" type="button" data-continue-process="${escapeHtml(item.id)}">Continuar</button>` : "";
  const deleteButton = canDelete ? `<button class="delete-process-button" type="button" data-delete-process="${escapeHtml(item.id)}">Eliminar proceso</button>` : "";
  const stepSummary = steps.length ? (currentStep < 0 ? `Todas las ${steps.length} tareas terminadas` : `Tarea ${currentStep + 1} de ${steps.length}: ${steps[currentStep]}`) : "Sin tareas configuradas";
  const detailsButton = steps.length ? `<button class="process-details-button" type="button" data-toggle-process="${escapeHtml(item.id)}" aria-expanded="false">Ver tareas</button>` : "";
  return `<article class="process-card process-kind-${escapeHtml(item.tipo)}" id="process-${escapeHtml(item.id)}"><div class="process-row"><div class="process-row-main"><div class="process-card-top"><div><strong>${escapeHtml(processTypeLabel(item.tipo))}</strong>${showClient ? `<span class="process-client-name">${escapeHtml(item.clienteNombre || "")}</span>` : ""}</div><span class="process-chip ${open ? "open" : "done"}">${open ? "En curso" : "Completado"}</span></div><div class="process-info"><span>Inició: ${escapeHtml(formatDate(item.iniciadoEn))}</span><span>Por: ${escapeHtml(item.iniciadoPorNombre || "Asesor")}</span><span>${open ? `Lleva ${escapeHtml(elapsed(item.iniciadoEn))}` : `Finalizó: ${escapeHtml(formatDate(item.completadoEn))}`}</span>${item.informacion?.numeroContacto ? `<span>Contacto: ${escapeHtml(item.informacion.numeroContacto)}</span>` : ""}</div>${processHistorySummary(item)}<p class="process-next-step">${escapeHtml(stepSummary)}</p></div><div class="process-card-actions">${detailsButton}${continueButton}${deleteButton}</div></div>${progress}</article>`;
}
function processHistorySummary(item) {
  const info = item.informacion || {};
  const values = [];
  if (item.tipo === "cambio-plan") values.push(`Plan: ${info.planAnterior || "Anterior sin registro"} → ${info.nuevoPlan || "Pendiente de registrar"}`, `Pago mensual: ${info.valorMensualAnterior == null ? "Sin registro" : formatCurrency(info.valorMensualAnterior)} → ${info.nuevoValorMensual == null ? "Pendiente" : formatCurrency(info.nuevoValorMensual)}`);
  if (item.tipo === "cambio-fecha-pago") values.push(`Día de pago: ${info.fechaPagoAnterior || (info.diaPagoAnterior ? `día ${info.diaPagoAnterior}` : "Anterior sin registro")} → ${info.nuevoDiaPago ? `día ${info.nuevoDiaPago}` : "Pendiente de registrar"}`);
  if (item.tipo === "reconexion" && (info.diaPago || info.fechaPago || info.nuevaFechaPago)) values.push(`Pago: ${info.fechaPagoAnterior || (info.diaPagoAnterior ? `día ${info.diaPagoAnterior}` : "Anterior sin registro")} → ${info.diaPago ? `día ${info.diaPago}` : (info.fechaPago || info.nuevaFechaPago)}`);
  if (item.tipo === "reconexion" && (info.fechaHoraRevisionFactura || info.fechaGeneracionFactura)) values.push(`Revisión de factura: ${info.fechaHoraRevisionFactura || "Sin programar"} · Generación: ${info.fechaGeneracionFactura || "Sin registrar"}`);
  return values.length ? `<div class="process-history-summary">${values.map(value => `<span>${escapeHtml(value)}</span>`).join("")}</div>` : "";
}
function processHistoryTable(list, emptyMessage) {
  if (!list.length) return `<p class="empty-state">${emptyMessage}</p>`;
  const sorted = [...list].sort((a, b) => (timestampDate(b.iniciadoEn)?.getTime() || 0) - (timestampDate(a.iniciadoEn)?.getTime() || 0));
  return `<div class="client-history-table-wrap"><table class="client-history-table"><thead><tr><th>Proceso</th><th>Fecha</th><th>Detalle</th><th>Estado</th><th>Responsable</th><th></th></tr></thead><tbody>${sorted.map(item => {
    const open = item.estado !== "completado";
    const detail = processHistorySummary(item) || escapeHtml(getProcessSteps(item).find((_, index) => !getCheckedProcessSteps(item).has(index)) || "Proceso completado");
    return `<tr><td><span class="history-kind history-kind-${escapeHtml(item.tipo)}">${escapeHtml(processTypeLabel(item.tipo))}</span></td><td>${escapeHtml(formatDate(item.iniciadoEn))}</td><td class="history-detail-cell">${detail}</td><td><span class="process-chip ${open ? "open" : "done"}">${open ? "En curso" : "Completado"}</span></td><td>${escapeHtml(item.iniciadoPorNombre || "Asesor")}</td><td><button class="history-row-button" type="button" data-toggle-history-row="${escapeHtml(item.id)}" aria-expanded="false">Ver</button></td></tr><tr class="history-detail-row" data-history-detail="${escapeHtml(item.id)}" hidden><td colspan="6">${processCard(item)}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}
function renderCustomerInvoiceHistory(client) {
  const customerId = String(client.cedula || "").trim().toLocaleLowerCase("es");
  const records = customerInvoiceRecords.filter(record => String(record.cedula || "").trim().toLocaleLowerCase("es") === customerId);
  const pending = records.filter(record => !record.revisado).sort((a, b) => (timestampDate(a.fechaNotificacion)?.getTime() || 0) - (timestampDate(b.fechaNotificacion)?.getTime() || 0));
  const reviewed = records.filter(record => record.revisado).sort((a, b) => (timestampDate(b.revisadoEn)?.getTime() || timestampDate(b.fechaNotificacion)?.getTime() || 0) - (timestampDate(a.revisadoEn)?.getTime() || timestampDate(a.fechaNotificacion)?.getTime() || 0));
  const selected = selectedInvoiceHistoryStatus === "reviewed" ? reviewed : pending;
  const statusLabel = selectedInvoiceHistoryStatus === "reviewed" ? "Verificada" : "Por verificar";
  const rows = selected.map(record => `<tr><td>${escapeHtml(formatDate(record.fechaNotificacion))}</td><td>${record.diaPago ? `Día ${escapeHtml(record.diaPago)} · aviso 10 días antes` : "Sin día de pago"}</td><td><span class="invoice-history-status ${record.revisado ? "is-reviewed" : "is-pending"}">${record.revisado ? "Verificada" : "Por verificar"}</span></td><td>${record.revisado ? escapeHtml(formatDate(record.revisadoEn)) : "Pendiente"}</td><td>${escapeHtml(record.revisadoPor || "—")}</td></tr>`).join("");
  return `<section class="client-history-section client-invoice-history"><div class="client-processes-heading"><div><span class="eyebrow">GENERACIÓN DE FACTURAS</span><h3>Verificaciones de ${escapeHtml(clientName(client))}</h3><p>Se muestran únicamente los registros de esta cédula.</p></div><span class="count-pill">${records.length} ${records.length === 1 ? "registro" : "registros"}</span></div>${customerInvoiceLoadError ? `<p class="empty-state error-state">${escapeHtml(customerInvoiceLoadError)}</p>` : `<div class="invoice-history-filters" role="group" aria-label="Estado de las verificaciones"><button type="button" class="invoice-history-filter ${selectedInvoiceHistoryStatus === "pending" ? "is-active" : ""}" data-invoice-status="pending" aria-pressed="${selectedInvoiceHistoryStatus === "pending"}">Por verificar <span>${pending.length}</span></button><button type="button" class="invoice-history-filter ${selectedInvoiceHistoryStatus === "reviewed" ? "is-active" : ""}" data-invoice-status="reviewed" aria-pressed="${selectedInvoiceHistoryStatus === "reviewed"}">Verificadas <span>${reviewed.length}</span></button></div><div class="client-history-table-wrap"><table class="client-history-table"><thead><tr><th>Fecha y hora para verificar</th><th>Programación de pago</th><th>Estado</th><th>Fecha verificada</th><th>Verificada por</th></tr></thead><tbody>${customerInvoiceLoading ? `<tr><td class="invoice-history-empty" colspan="5">Cargando verificaciones de facturas…</td></tr>` : rows || `<tr><td class="invoice-history-empty" colspan="5">${records.length ? `No hay facturas ${statusLabel.toLocaleLowerCase("es")} para este cliente.` : "Este cliente todavía no tiene verificaciones de facturas."}</td></tr>`}</tbody></table></div>`}</section>`;
}
function renderNotifications() {
  const filter = $("#noticeTypeFilter").value;
  const open = processes.filter(item => item.estado === "en_curso" && (filter === "all" || item.tipo === filter)).sort((a, b) => (timestampDate(a.iniciadoEn)?.getTime() || 0) - (timestampDate(b.iniciadoEn)?.getTime() || 0));
  $("#openProcessCount").textContent = `${open.length} abiertos`;
  notificationsHost.replaceChildren();
  if (!open.length) { notificationsHost.innerHTML = `<p class="empty-state">No hay procesos pendientes${filter === "all" ? "" : " para este tipo"}.</p>`; return; }
  open.forEach(item => {
    const article = document.createElement("article"); article.className = "notification-card";
    const owner = item.iniciadoPorUid === currentUserUid;
    article.innerHTML = `<div><strong>${escapeHtml(processTypeLabel(item.tipo))} · ${escapeHtml(item.clienteNombre || "Cliente")}</strong><span>Cédula: ${escapeHtml(item.clienteCedula || "—")} · Inició ${escapeHtml(formatDate(item.iniciadoEn))}</span><time>Lleva ${escapeHtml(elapsed(item.iniciadoEn))} abierto · ${escapeHtml(item.iniciadoPorNombre || "Asesor")}</time></div>${owner ? `<button type="button" data-resume-notification="${escapeHtml(item.id)}">Continuar</button>` : ""}`;
    article.querySelector("[data-resume-notification]")?.addEventListener("click", () => openProcessWizard(item.id));
    notificationsHost.append(article);
  });
}
function renderClientDetails() {
  const client = clients.find(item => item.id === selectedClientId);
  if (!client) {
    detailsHost.innerHTML = `<div class="client-placeholder"><span class="placeholder-icon">♙</span><h2>Ficha del cliente</h2><p>Selecciona un cliente para consultar sus procesos.</p></div>`;
    renderClientList(); applyProfileMode(); return;
  }
  const filterType = $("#clientProcessTypeFilter")?.value || "all";
  const filterStatus = $("#clientProcessStatusFilter")?.value || "all";
  const items = processes.filter(item => item.clienteId === client.id && (filterType === "all" || item.tipo === filterType) && (filterStatus === "all" || item.estado === filterStatus)).sort((a, b) => (timestampDate(b.iniciadoEn)?.getTime() || 0) - (timestampDate(a.iniciadoEn)?.getTime() || 0));
  const clientProcesses = processes.filter(item => item.clienteId === client.id);
  const latestInformation = clientProcesses.reduce((latest, item) => !latest || (timestampDate(item.actualizadoEn)?.getTime() || timestampDate(item.iniciadoEn)?.getTime() || 0) > (timestampDate(latest.actualizadoEn)?.getTime() || timestampDate(latest.iniciadoEn)?.getTime() || 0) ? item : latest, null)?.informacion || {};
  const reconnections = clientProcesses.filter(item => item.tipo === "reconexion");
  const plans = clientProcesses.filter(item => item.tipo === "cambio-plan");
  const paymentDates = clientProcesses.filter(item => item.tipo === "cambio-fecha-pago" || (item.tipo === "reconexion" && (item.informacion?.diaPago || item.informacion?.fechaPago || item.informacion?.nuevaFechaPago)));
  const clientIdForInvoices = String(client.cedula || "").trim().toLocaleLowerCase("es");
  const invoices = customerInvoiceRecords.filter(record => String(record.cedula || "").trim().toLocaleLowerCase("es") === clientIdForInvoices);
  const historyPanel = (heading, list, empty) => `<section class="client-history-section"><div class="client-processes-heading"><div><span class="eyebrow">HISTORIAL</span><h3>${heading}</h3></div><span class="count-pill">${list.length} ${list.length === 1 ? "registro" : "registros"}</span></div>${processHistoryTable(list, empty)}</section>`;
  const statusColor = client.estadoCliente || "sin_registrar";
  detailsHost.innerHTML = `<div class="client-detail"><header class="client-detail-heading"><div><button class="back-to-client-list" id="backToClientList" type="button">← Volver a clientes</button><span class="eyebrow">FICHA DEL CLIENTE</span><h2>${escapeHtml(clientName(client))}</h2><p>Cédula ${escapeHtml(client.cedula)}</p></div><div class="client-detail-actions"><span class="client-status-badge status-${escapeHtml(statusColor)}">${escapeHtml(clientStatus(client))}</span><button id="editClientProfile" class="profile-edit-button" type="button">${editingClientProfileId === client.id ? "Cerrar edición" : "Editar datos"}</button><button id="startAnotherProcess" type="button">＋ Iniciar proceso nuevo</button></div></header><nav class="client-history-tabs" role="tablist" aria-label="Historial del cliente">${[["resumen","Resumen",clientProcesses.length],["reconexiones","Reconexiones",reconnections.length],["planes","Cambios de plan",plans.length],["pagos","Fechas de pago",paymentDates.length],["facturas","Generación de facturas",invoices.length]].map(([id,label,count]) => `<button class="client-history-tab ${selectedClientHistoryTab === id ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedClientHistoryTab === id}" data-client-tab="${id}">${label}<span>${count}</span></button>`).join("")}</nav><div class="client-history-content" role="tabpanel">${selectedClientHistoryTab === "resumen" ? `${renderClientProfile(client, latestInformation)}<section class="client-processes"><div class="client-processes-heading"><div><span class="eyebrow">HISTORIAL</span><h3>Todos los procesos</h3></div><span class="count-pill">${items.length} ${items.length === 1 ? "proceso" : "procesos"}</span></div><div class="process-filter-row"><select id="clientProcessTypeFilter" aria-label="Filtrar por tipo"><option value="all">Todos los procesos</option><option value="reconexion">Reconexión</option><option value="cambio-fecha-pago">Cambio de fecha de pago</option><option value="cambio-plan">Cambio de plan</option></select><select id="clientProcessStatusFilter" aria-label="Filtrar por estado"><option value="all">Todos los estados</option><option value="en_curso">En curso</option><option value="completado">Completados</option></select></div>${processHistoryTable(items, "Este cliente todavía no tiene procesos con esos filtros.")}</section>` : selectedClientHistoryTab === "reconexiones" ? historyPanel("Reconexiones del cliente", reconnections, "Todavía no hay reconexiones registradas.") : selectedClientHistoryTab === "planes" ? historyPanel("Cambios de plan", plans, "Todavía no hay cambios de plan registrados.") : selectedClientHistoryTab === "pagos" ? historyPanel("Cambios en la fecha de pago", paymentDates, "Todavía no hay cambios de fecha de pago registrados.") : renderCustomerInvoiceHistory(client)}</div></div>`;
  if ($("#clientProcessTypeFilter")) $("#clientProcessTypeFilter").value = filterType;
  if ($("#clientProcessStatusFilter")) $("#clientProcessStatusFilter").value = filterStatus;
  $("#clientProcessTypeFilter")?.addEventListener("change", renderClientDetails); $("#clientProcessStatusFilter")?.addEventListener("change", renderClientDetails);
  detailsHost.querySelectorAll("[data-client-tab]").forEach(button => button.addEventListener("click", () => { selectedClientHistoryTab = button.dataset.clientTab; renderClientDetails(); }));
  detailsHost.querySelectorAll("[data-invoice-status]").forEach(button => button.addEventListener("click", () => { selectedInvoiceHistoryStatus = button.dataset.invoiceStatus; renderClientDetails(); }));
  detailsHost.querySelector("[data-client-status]")?.addEventListener("change", saveInlineClientStatus);
  detailsHost.querySelectorAll("[data-toggle-history-row]").forEach(button => button.addEventListener("click", () => {
    const row = detailsHost.querySelector(`[data-history-detail="${CSS.escape(button.dataset.toggleHistoryRow)}"]`);
    if (!row) return;
    row.hidden = !row.hidden;
    button.setAttribute("aria-expanded", String(!row.hidden));
    button.textContent = row.hidden ? "Ver" : "Ocultar";
  }));
  detailsHost.querySelectorAll("[data-continue-process]").forEach(button => button.addEventListener("click", () => openProcessWizard(button.dataset.continueProcess)));
  detailsHost.querySelectorAll("[data-delete-process]").forEach(button => button.addEventListener("click", () => deleteProcess(button.dataset.deleteProcess)));
  detailsHost.querySelectorAll("[data-toggle-process]").forEach(button => button.addEventListener("click", () => {
    const panel = detailsHost.querySelector(`[data-process-details="${CSS.escape(button.dataset.toggleProcess)}"]`);
    if (!panel) return;
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
    button.textContent = panel.hidden ? "Ver tareas" : "Ocultar tareas";
  }));
  $("#backToClientList").addEventListener("click", () => { selectedClientId = null; profileMode = false; renderClientDetails(); });
  $("#editClientProfile").addEventListener("click", () => { editingClientProfileId = editingClientProfileId === client.id ? null : client.id; renderClientDetails(); });
  $("#cancelClientProfile")?.addEventListener("click", () => { editingClientProfileId = null; renderClientDetails(); });
  $("#clientProfileForm")?.addEventListener("submit", saveClientProfile);
  $("#startAnotherProcess").addEventListener("click", () => window.parent.postMessage({ type: "INTERCOL_START_CLIENT_PROCESS", client: { ...client } }, "*"));
  renderClientList(); applyProfileMode();
}
async function saveInlineClientStatus(event) {
  const select = event.currentTarget;
  const client = clients.find(item => item.id === selectedClientId);
  const status = $("#clientStatusSaveStatus");
  if (!client) return;
  const estadoCliente = select.value;
  select.disabled = true;
  if (status) { status.classList.remove("is-error"); status.textContent = "Guardando…"; }
  try {
    await window.parent.INTERCOL_FIREBASE.updateClientProfile(client.id, { estadoCliente });
    clients = clients.map(item => item.id === client.id ? { ...item, estadoCliente } : item);
    renderClientDetails();
  } catch (error) {
    console.error("No se pudo guardar el estado del cliente:", error);
    select.disabled = false;
    select.value = client.estadoCliente || "sin_registrar";
    if (status) {
      status.classList.add("is-error");
      status.textContent = error?.code === "permission-denied"
        ? "Firebase rechazó el cambio. Publica las reglas actualizadas de firestore.rules para que el estado se pueda guardar."
        : `No se pudo guardar${error?.code ? ` (${error.code})` : ""}. Revisa la conexión e inténtalo de nuevo.`;
    }
  }
}
async function deleteProcess(processId) {
  const original = processes.find(item => item.id === processId);
  if (!original || (original.iniciadoPorUid !== currentUserUid && !currentUserIsAdmin)) return;
  const client = clients.find(item => item.id === original.clienteId);
  const label = processTypeLabel(original.tipo);
  if (!window.confirm(`¿Eliminar definitivamente el proceso de ${label} para ${clientName(client || { nombre: original.clienteNombre })}? Esta acción no se puede deshacer.`)) return;
  const previousProcesses = processes;
  processes = processes.filter(item => item.id !== processId);
  renderClientDetails(); renderNotifications();
  try {
    await window.parent.INTERCOL_FIREBASE.deleteClientProcess(processId);
  } catch (error) {
    processes = previousProcesses;
    processSaveErrors.set(processId, error?.code === "permission-denied" ? "Firebase no autorizó eliminar este proceso. Publica las reglas actualizadas de procesosClientes." : "No se pudo eliminar. Revisa la conexión e inténtalo de nuevo.");
    renderClientDetails(); renderNotifications();
  }
}
function openProcessWizard(processId, message = "", requestedStep = null) {
  const process = processes.find(item => item.id === processId);
  if (!process || process.iniciadoPorUid !== currentUserUid) return;
  let dialog = $("#processStepDialog");
  if (!dialog) {
    dialog = document.createElement("dialog"); dialog.id = "processStepDialog"; dialog.className = "process-step-dialog";
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => { const input = dialog.querySelector("[name=numeroContacto]"); if (input?.value.trim()) saveWizardContactNumber(dialog.dataset.processId, input.value).catch(() => {}); });
    document.body.append(dialog);
  }
  dialog.dataset.processId = processId;
  const steps = getProcessSteps(process);
  const checked = getCheckedProcessSteps(process);
  const currentStep = steps.findIndex((_, index) => !checked.has(index));
  const activeStep = requestedStep !== null && requestedStep >= 0 && requestedStep < steps.length ? requestedStep : currentStep;
  const client = clients.find(item => item.id === process.clienteId) || { nombre: process.clienteNombre, cedula: process.clienteCedula };
  const completed = currentStep < 0 || process.estado === "completado";
  const task = completed ? null : steps[activeStep];
  const help = processStepHelp[process.tipo]?.[activeStep] || "Completa esta tarea antes de continuar con el siguiente paso del proceso.";
  const information = { ...(process.informacion || {}), cedulaCliente: String(client.cedula || ""), clienteNombre: clientName(client), valorMensualCliente: client.valorMensual ?? 0, valorReconexion: client.valorReconexion ?? process.informacion?.valorReconexion ?? "", diaPago: process.informacion?.diaPago ?? client.diaPago ?? (process.informacion?.fechaPago ? Number(String(process.informacion.fechaPago).slice(-2)) : ""), ...getWizardInformationDraft(processId) };
  const fields = !completed && process.tipo === "reconexion" ? renderReconnectionStepFields(activeStep, information) : !completed ? renderClientProfileProcessFields(process, activeStep, information, client) : "";
  dialog.dataset.activeStep = String(activeStep);
  const completionMessage = process.tipo === "reconexion" ? "¡Listo! El cliente está completo." : `¡Listo! El proceso de ${processTypeLabel(process.tipo).toLocaleLowerCase("es")} está completo.`;
  const completionNote = information.notificacionFacturaOmitida ? "Ya había una revisión pendiente; no agregué otra a la lista." : `Se guardaron todas las tareas de ${processTypeLabel(process.tipo).toLocaleLowerCase("es")}.`;
  dialog.innerHTML = `<section class="process-wizard-card"><header><div><span class="eyebrow">${escapeHtml(processTypeLabel(process.tipo)).toLocaleUpperCase("es")}</span><h2>${escapeHtml(clientName(client))}</h2><p>Cédula ${escapeHtml(client.cedula || "—")}</p></div><button class="dialog-close" type="button" data-close-process-wizard aria-label="Cerrar">×</button></header><div class="wizard-progress"><span>Paso ${completed ? steps.length : activeStep + 1} de ${steps.length}</span><div>${steps.map((_, index) => `<i class="${checked.has(index) ? "is-done" : ""} ${index === activeStep && !completed ? "is-current" : ""}"></i>`).join("")}</div></div>${completed ? `<section class="wizard-complete"><span aria-hidden="true">✓</span><h3>${escapeHtml(completionMessage)}</h3><p>${escapeHtml(completionNote)}</p></section>` : `<section class="wizard-task"><span class="eyebrow">TAREA ${activeStep + 1}</span><h3>${escapeHtml(task)}</h3><p>${escapeHtml(help)}</p>${fields}</section>`}<p class="wizard-status ${message ? "is-error" : ""}" role="status">${escapeHtml(message)}</p><footer>${completed ? `<button class="primary-button" type="button" data-close-process-wizard>Terminar</button>` : `${activeStep > 0 ? `<button class="secondary-button wizard-previous" type="button" data-previous-process-step>← Tarea anterior</button>` : ""}<button class="primary-button" type="button" data-complete-process-step="${escapeHtml(process.id)}" data-step-index="${activeStep}">Marcar completada y ver siguiente tarea</button>`}</footer></section>`;
  dialog.querySelectorAll("[data-close-process-wizard]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.querySelectorAll("[data-process-info]").forEach(field => field.addEventListener("input", () => setWizardInformationDraft(processId, readWizardInformation(dialog))));
  dialog.querySelectorAll("[data-process-info]").forEach(field => field.addEventListener("input", () => updateReconnectionSummaries(dialog)));
  dialog.querySelectorAll("[data-process-info]").forEach(field => field.addEventListener("change", () => { setWizardInformationDraft(processId, readWizardInformation(dialog)); updateReconnectionSummaries(dialog); }));
  dialog.querySelector("[data-copy-annotation]")?.addEventListener("click", async () => { const annotation = dialog.querySelector(".wizard-annotation")?.value || ""; try { await navigator.clipboard.writeText(annotation); dialog.querySelector("[data-copy-annotation]").textContent = "Anotación copiada"; } catch { dialog.querySelector(".wizard-annotation")?.select(); } });
  updateReconnectionSummaries(dialog);
  dialog.querySelector("[data-previous-process-step]")?.addEventListener("click", () => goToPreviousProcessStep(processId, activeStep));
  dialog.querySelector("[name=numeroContacto]")?.addEventListener("change", event => saveWizardContactNumber(processId, event.currentTarget.value).catch(() => {}));
  dialog.querySelector("[data-complete-process-step]")?.addEventListener("click", completeWizardTask);
  if (!dialog.open) dialog.showModal();
}
function renderReconnectionStepFields(step, info) {
  if (step === 0) {
    const selectedFee = String(info.valorReconexion ?? "");
    return `<label class="wizard-contact-field" for="wizardReconnectionFee">Valor de reconexión<select id="wizardReconnectionFee" data-process-info name="valorReconexion" required><option value="">Selecciona cuánto se le cobra</option><option value="15000" ${selectedFee === "15000" ? "selected" : ""}>$15.000</option><option value="20000" ${selectedFee === "20000" ? "selected" : ""}>$20.000</option></select></label>`;
  }
  if (step === 1) {
    return `<a class="wizard-external-link wizard-invoices-link" href="https://wisphub.net/clientes/ver/${encodeURIComponent(clientCedulaForLink(info))}@cibercitywisp/#retab3" target="_blank" rel="noopener noreferrer">Abrir facturas pendientes en Wisphub ↗</a><label class="wizard-contact-field">¿Qué acción realizaste?<select data-process-info name="accionFactura" required><option value="">Selecciona la acción</option>${[["reajuste","Ajusté la factura con solo reajuste (+ comisión)"],["mes_reajuste","Ajusté la factura con mes + reajuste (sin comisión)"],["nueva_reajuste","Generé una factura nueva de reajuste (+ comisión)"]].map(([value,label])=>`<option value="${value}" ${info.accionFactura===value?"selected":""}>${label}</option>`).join("")}</select></label>`;
  }
  if (step === 2) { const savedDay = info.diaPago ?? (info.fechaPago ? Number(String(info.fechaPago).slice(-2)) : ""); return `<a class="wizard-external-link" href="https://wisphub.net/clientes/ver/${encodeURIComponent(clientCedulaForLink(info))}@cibercitywisp/#retab5" target="_blank" rel="noopener noreferrer">Abrir fecha de pago en Wisphub ↗</a><label class="wizard-contact-field">Día de pago que quedó en Wisphub (1 al 30)<input data-process-info name="diaPago" type="number" inputmode="numeric" min="1" max="30" step="1" value="${escapeHtml(savedDay)}" placeholder="Escribe un número del 1 al 30" required></label><p class="wizard-calculated-amount" data-payment-date-summary></p>`; }
  if (step === 3) {
    const annotationLink = `https://wisphub.net/clientes/ver/${encodeURIComponent(info.cedulaCliente || "")}@cibercitywisp/#set1`;
    const annotation = buildReconnectionAnnotation(info);
    const advisor = info.asesorReconexion || currentUserName || "";
    const existingReview = findPendingCustomerInvoice(info.cedulaCliente);
    const reviewField = existingReview ? `<p class="wizard-calculated-amount">Ya hay una revisión pendiente en la lista. No agregaré otra.</p>` : `<label class="wizard-contact-field">Fecha y hora para revisar la generación de factura<input data-process-info name="fechaHoraRevisionFactura" type="datetime-local" value="${escapeHtml(info.fechaHoraRevisionFactura || defaultReminderDate(info.fechaGeneracionFactura || info.fechaPago || info.diaPago))}"></label>`;
    return `<fieldset class="wizard-reconnection-payment"><legend>¿Qué paga?</legend><label class="wizard-check-confirm"><input data-process-info name="pagaMes" type="checkbox" value="true" ${info.pagaMes === "true" ? "checked" : ""}> Mes</label><label class="wizard-check-confirm"><input data-process-info name="pagaReajuste" type="checkbox" value="true" ${info.pagaReajuste === "true" ? "checked" : ""}> Reajuste</label></fieldset><div class="wizard-form-grid"><label class="wizard-contact-field">Técnico<input data-process-info name="tecnicoReconexion" value="${escapeHtml(info.tecnicoReconexion || "")}" placeholder="Nombre del técnico" required></label><label class="wizard-contact-field">Asesor<input data-process-info name="asesorReconexion" value="${escapeHtml(advisor)}" placeholder="Nombre del asesor" required></label></div><p class="wizard-calculated-amount">Fecha de pago: día ${escapeHtml(info.diaPago || "—")} de cada mes.</p><p class="wizard-calculated-amount">Texto listo para copiar:</p><textarea class="wizard-annotation" readonly rows="3">${escapeHtml(annotation)}</textarea><button type="button" class="secondary-button" data-copy-annotation>Copiar anotación</button><a class="wizard-external-link" href="${annotationLink}" target="_blank" rel="noopener noreferrer">Abrir anotaciones en Wisphub ↗</a>${reviewField}<label class="wizard-check-confirm"><input data-process-info name="anotacionLista" type="checkbox" value="true" ${info.anotacionLista === "true" ? "checked" : ""} required> Ya hice la anotación en Wisphub</label>`;
  }
  return "";
}
function clientCedulaForLink(info) { return info.cedulaCliente || ""; }
function buildReconnectionAnnotation(info) { const date = new Intl.DateTimeFormat("es-CO").format(new Date()); const action = info.accionFactura === "nueva_reajuste" ? "Se genera factura nueva" : "Se ajusta factura"; const paidParts = [info.pagaMes === "true" ? "mes" : "", info.pagaReajuste === "true" ? "reajuste" : ""].filter(Boolean).join(" + "); const technician = String(info.tecnicoReconexion || "[técnico]").trim(); const advisor = String(info.asesorReconexion || currentUserName || "[asesor]").trim(); const day = info.diaPago || "[día]"; return `${date} RECONEXION: ${action} cliente paga ${paidParts || "[mes o reajuste]"} a tecnico ${technician} queda con fecha de pago los ${day} de cada mes - ${advisor}`; }
function calculateReconnectionTotal(info = {}) {
  const reconnect = Number(info.valorReconexion) || 0;
  const adjustment = Number(info.valorReajuste) || 0;
  const commission = Number(info.comisionReconexion) || 0;
  const monthly = Number(info.valorMesFactura ?? info.valorMensualCliente) || 0;
  let invoiceTotal = 0;
  switch (info.accionFactura) {
    case "reajuste":
    case "nueva_reajuste": invoiceTotal = adjustment + commission; break;
    case "mes_reajuste": invoiceTotal = monthly + adjustment; break;
  }
  return reconnect + invoiceTotal;
}
function defaultReminderDate(paymentDateOrDay) {
  if (!paymentDateOrDay) return "";
  const raw = String(paymentDateOrDay);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T09:00`;
  const day = Number(paymentDateOrDay);
  if (!Number.isInteger(day) || day < 1 || day > 30) return "";
  const now = new Date();
  const atNine = date => { date.setHours(9, 0, 0, 0); return date; };
  let payment = new Date(now.getFullYear(), now.getMonth(), day, 12);
  if (payment <= now) payment = new Date(now.getFullYear(), now.getMonth() + 1, day, 12);
  let reminder = new Date(payment); reminder.setDate(reminder.getDate() - 10);
  if (reminder <= now) { payment = new Date(payment.getFullYear(), payment.getMonth() + 1, day, 12); reminder = new Date(payment); reminder.setDate(reminder.getDate() - 10); }
  atNine(reminder);
  const iso = `${reminder.getFullYear()}-${String(reminder.getMonth() + 1).padStart(2, "0")}-${String(reminder.getDate()).padStart(2, "0")}`;
  return `${iso}T09:00`;
}
function updateReconnectionSummaries(dialog) {
  const process = processes.find(item => item.id === dialog.dataset.processId);
  const information = { ...(process?.informacion || {}), ...readWizardInformation(dialog), valorMensualCliente: clients.find(item => item.id === process?.clienteId)?.valorMensual ?? 0 };
  const charge = dialog.querySelector("[data-invoice-total]"); if (charge) charge.textContent = formatCurrency(calculateReconnectionTotal(information));
  const annotation = dialog.querySelector(".wizard-annotation"); if (annotation) annotation.value = buildReconnectionAnnotation(information);
  if (dialog.querySelector("[data-reajuste-summary]")) updateReajusteSummary(dialog, dialog.querySelector('[name="valorReajuste"]')?.value);
  const day = dialog.querySelector('[name="diaPago"]')?.value;
  const summary = dialog.querySelector("[data-payment-date-summary]");
  if (summary) summary.textContent = day ? `Se guardará el día ${day} de cada mes en la ficha del cliente.` : "Escribe únicamente el día del mes, entre 1 y 30.";
}
function renderClientProfileProcessFields(process, step, info, client) {
  if (process.tipo === "cambio-plan") {
    if (step === 0) return `<p class="wizard-calculated-amount">Plan registrado actualmente: <strong>${escapeHtml(client.plan || "Sin registrar")}</strong></p>`;
    if (step === 1) return `<div class="wizard-form-grid"><label class="wizard-contact-field">Nuevo plan<input data-process-info name="nuevoPlan" value="${escapeHtml(info.nuevoPlan || "")}" placeholder="Escribe el nuevo plan" required></label><label class="wizard-contact-field">Nuevo valor mensual (opcional)<input data-process-info name="nuevoValorMensual" type="number" min="0" step="100" value="${escapeHtml(info.nuevoValorMensual || "")}" placeholder="Valor en pesos"></label></div>`;
  }
  if (process.tipo === "cambio-fecha-pago") {
    if (step === 0) return `<p class="wizard-calculated-amount">Día de pago registrado actualmente: <strong>${escapeHtml(client.diaPago ? `${client.diaPago} de cada mes` : "Sin registrar")}</strong></p>`;
    if (step === 1) return `<label class="wizard-contact-field">Nuevo día de pago<input data-process-info name="nuevoDiaPago" type="number" min="1" max="31" step="1" value="${escapeHtml(info.nuevoDiaPago || "")}" placeholder="Día del mes (1 a 31)" required></label>`;
  }
  return "";
}
function formatCurrency(value) { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value) || 0); }
function updateReajusteSummary(dialog, amount) {
  const summary = dialog.querySelector("[data-reajuste-summary]");
  const zone = dialog.querySelector("[name=zonaReconexion]")?.value;
  const commission = Number(dialog.querySelector('[name="comisionReconexion"]')?.value || 0);
  if (summary) summary.innerHTML = amount && zone ? `En ${escapeHtml(zone)}: reajuste <strong>${escapeHtml(formatCurrency(amount))}</strong> + comisión <strong>${escapeHtml(formatCurrency(commission))}</strong> = total <strong>${escapeHtml(formatCurrency(Number(amount)+commission))}</strong>.` : "Selecciona una zona para calcular reajuste, comisión y total.";
}
function readWizardInformation(dialog) {
  return Object.fromEntries([...dialog.querySelectorAll("[data-process-info]")].map(field => [field.name, field.type === "checkbox" ? String(field.checked) : field.value.trim()]));
}
async function saveWizardContactNumber(processId, value) {
  const number = String(value || "").trim();
  if (!processId || !number) return;
  processDetailSaveQueue = processDetailSaveQueue.catch(() => {}).then(async () => {
    const process = processes.find(item => item.id === processId);
    if (!process || process.informacion?.numeroContacto === number) return;
    const informacion = { ...(process.informacion || {}), numeroContacto: number };
    await window.parent.INTERCOL_FIREBASE.updateClientProcess(processId, { informacion });
    setWizardContactDraft(processId, "");
    processes = processes.map(item => item.id === processId ? { ...item, informacion } : item);
    processSaveErrors.delete(processId);
    renderClientDetails();
    const status = $(".wizard-status"); if (status) status.textContent = "Número guardado en los detalles de este proceso.";
  }).catch(error => {
    const message = processWriteErrorMessage(error, "guardar el número");
    processSaveErrors.set(processId, message);
    const status = $(".wizard-status"); if (status) { status.textContent = message; status.classList.add("is-error"); }
    throw error;
  });
  return processDetailSaveQueue;
}
async function goToPreviousProcessStep(processId, activeStep) {
  const process = processes.find(item => item.id === processId);
  if (!process || process.iniciadoPorUid !== currentUserUid || activeStep < 1) return;
  const steps = getProcessSteps(process);
  const checked = getCheckedProcessSteps(process);
  checked.delete(activeStep - 1);
  const pasosVerificados = [...checked].sort((a, b) => a - b);
  const button = $("[data-previous-process-step]");
  if (button) { button.disabled = true; button.textContent = "Volviendo…"; }
  try {
    await window.parent.INTERCOL_FIREBASE.updateClientProcess(processId, { pasos: steps, pasosVerificados, estado: "en_curso" });
    processes = processes.map(item => item.id === processId ? { ...item, pasos: steps, pasosVerificados, estado: "en_curso", completadoEn: null } : item);
    processSaveErrors.delete(processId);
    renderClientDetails(); renderNotifications();
    openProcessWizard(processId, "La tarea anterior quedó pendiente para revisarla.", activeStep - 1);
  } catch (error) {
    const message = processWriteErrorMessage(error, "volver a la tarea anterior");
    openProcessWizard(processId, message, activeStep);
  }
}
async function completeWizardTask(event) {
  const button = event.currentTarget;
  const processId = button.dataset.completeProcessStep;
  const index = Number(button.dataset.stepIndex);
  const process = processes.find(item => item.id === processId);
  if (!process || process.iniciadoPorUid !== currentUserUid) return;
  const steps = getProcessSteps(process);
  const checked = getCheckedProcessSteps(process);
  if (steps.findIndex((_, stepIndex) => !checked.has(stepIndex)) !== index) return;
  const dialog = $("#processStepDialog");
  const fields = [...dialog.querySelectorAll("[data-process-info]")];
  const missingField = fields.find(field => field.required && (field.type === "checkbox" ? !field.checked : !field.value.trim()));
  if (missingField) {
    const status = $(".wizard-status"); if (status) { status.textContent = "Completa los datos de esta tarea antes de continuar."; status.classList.add("is-error"); }
    missingField.focus(); return;
  }
  if (process.tipo === "reconexion" && index === 3 && !fields.some(field => ["pagaMes", "pagaReajuste"].includes(field.name) && field.checked)) {
    const status = $(".wizard-status"); if (status) { status.textContent = "Selecciona si el cliente paga Mes, Reajuste o ambos."; status.classList.add("is-error"); }
    dialog.querySelector('[name="pagaMes"]')?.focus(); return;
  }
  const contactInput = dialog.querySelector("[name=numeroContacto]");
  await processDetailSaveQueue.catch(() => {});
  const latest = processes.find(item => item.id === processId) || process;
  const informacion = { ...(latest.informacion || {}), ...getWizardInformationDraft(processId), ...readWizardInformation(dialog), valorMensualCliente: clients.find(item => item.id === process.clienteId)?.valorMensual ?? 0 };
  let profileChanges = null;
  if (process.tipo === "cambio-plan" && index === 2) {
    if (!String(informacion.nuevoPlan || "").trim()) { const status = $(".wizard-status"); if (status) { status.textContent = "Registra el nuevo plan en la tarea anterior para actualizar la ficha del cliente."; status.classList.add("is-error"); } return; }
    profileChanges = { plan: String(informacion.nuevoPlan).trim() };
    if (String(informacion.nuevoValorMensual || "").trim()) {
      const monthly = Number(informacion.nuevoValorMensual);
      if (!Number.isFinite(monthly) || monthly < 0) { const status = $(".wizard-status"); if (status) { status.textContent = "Escribe un valor mensual válido para actualizar la ficha."; status.classList.add("is-error"); } return; }
      profileChanges.valorMensual = monthly;
    }
  } else if (process.tipo === "cambio-fecha-pago" && index === 2) {
    const day = Number(informacion.nuevoDiaPago);
    if (!Number.isInteger(day) || day < 1 || day > 31) { const status = $(".wizard-status"); if (status) { status.textContent = "Registra el nuevo día de pago en la tarea anterior para actualizar la ficha."; status.classList.add("is-error"); } return; }
    profileChanges = { diaPago: day };
  } else if (process.tipo === "reconexion" && index === 0) {
    const fee = Number(informacion.valorReconexion);
    if (![15000, 20000].includes(fee)) { const status = $(".wizard-status"); if (status) { status.textContent = "Selecciona $15.000 o $20.000 para guardar el cobro de reconexión."; status.classList.add("is-error"); } return; }
    informacion.valorReconexion = fee;
    profileChanges = { valorReconexion: fee };
  } else if (process.tipo === "reconexion" && index === 1) {
    if (!["reajuste", "mes_reajuste", "nueva_reajuste"].includes(informacion.accionFactura)) { const status = $(".wizard-status"); if (status) { status.textContent = "Selecciona la acción que realizaste en la factura."; status.classList.add("is-error"); } return; }
    informacion.totalCobrar = calculateReconnectionTotal(informacion);
  } else if (process.tipo === "reconexion" && index === 2) {
    const day = Number(informacion.diaPago);
    if (!Number.isInteger(day) || day < 1 || day > 30) { const status = $(".wizard-status"); if (status) { status.textContent = "Escribe únicamente un número del 1 al 30."; status.classList.add("is-error"); } return; }
    informacion.diaPago = day;
    profileChanges = { diaPago: day };
  }
  checked.add(index);
  const pasosVerificados = [...checked].sort((a, b) => a - b);
  const estado = pasosVerificados.length === steps.length ? "completado" : "en_curso";
  button.disabled = true;
  button.textContent = "Guardando avance…";
  const status = $(".wizard-status");
  if (status) status.textContent = "Guardando tarea…";
  try {
    const firebase = window.parent.INTERCOL_FIREBASE;
    if (process.tipo === "reconexion" && index === 3 && !informacion.notificacionFacturaId) {
      delete informacion.notificacionFacturaOmitida;
      const existingReview = findPendingCustomerInvoice(process.clienteCedula);
      if (existingReview?.processId === processId) informacion.notificacionFacturaId = existingReview.id;
      else if (existingReview) informacion.notificacionFacturaOmitida = true;
      else {
        const reminder = String(informacion.fechaHoraRevisionFactura || "");
        if (!reminder || new Date(reminder).getTime() <= Date.now()) throw new Error("Elige una fecha y hora futura para agregar una revisión a la lista.");
        const advisorName = currentUserName || "Asesor";
        try {
          const created = await firebase.createPaymentNotification({ customerName: clientName(clients.find(item => item.id === process.clienteId) || { nombre: process.clienteNombre }), customerId: process.clienteCedula, notificationDate: reminder, paymentDay: Number(informacion.diaPago) || (informacion.fechaPago ? Number(informacion.fechaPago.slice(-2)) : null), advisorUid: currentUserUid, advisorName, processId });
          informacion.notificacionFacturaId = created.id;
        } catch (error) {
          if (error?.code !== "invoice-pending-exists") throw error;
          informacion.notificacionFacturaOmitida = true;
        }
      }
    }
    if (profileChanges && firebase.completeClientProfileStep) {
      await firebase.completeClientProfileStep({ clientId: process.clienteId, processId, profile: profileChanges, informacion, pasos: steps, pasosVerificados, estado });
      clients = clients.map(item => item.id === process.clienteId ? { ...item, ...profileChanges } : item);
    } else await firebase.updateClientProcess(processId, { ...(informacion ? { informacion } : {}), pasos: steps, pasosVerificados, estado });
    if (contactInput) setWizardContactDraft(processId, "");
    setWizardInformationDraft(processId, {});
    processes = processes.map(item => item.id === processId ? { ...item, ...(informacion ? { informacion } : {}), pasos: steps, pasosVerificados, estado, ...(estado === "completado" ? { completadoEn: new Date() } : {}) } : item);
    processSaveErrors.delete(processId);
    renderClientDetails(); renderNotifications();
    openProcessWizard(processId);
  } catch (error) {
    if (fields.length) setWizardInformationDraft(processId, { ...getWizardInformationDraft(processId), ...readWizardInformation(dialog) });
    if (contactInput?.value.trim()) setWizardContactDraft(processId, contactInput.value.trim());
    const message = processWriteErrorMessage(error, "guardar la tarea");
    processSaveErrors.set(processId, message);
    openProcessWizard(processId, message);
    renderClientDetails(); renderNotifications();
  }
}
function selectClient(id) { selectedClientId = id; selectedClientHistoryTab = "resumen"; selectedInvoiceHistoryStatus = "pending"; profileMode = true; renderClientDetails(); }
$("#clientSearch").addEventListener("input", renderClientList);
$("#noticeTypeFilter").addEventListener("change", renderNotifications);
window.addEventListener("message", event => {
  if (event.source !== window.parent) return;
  if (event.data?.type === "INTERCOL_THEME") {
    document.body.classList.toggle("dark", event.data.theme === "dark");
    if (event.data.variables) Object.entries(event.data.variables).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));
  }
  if (event.data?.type === "INTERCOL_AUTH_STATE") {
    const uid = String(event.data.user?.uid || "");
    if (!uid) {
    isAuthenticated = false; currentUserUid = ""; currentUserName = ""; currentUserIsAdmin = false; stopClientsSync?.(); stopProcessesSync?.(); stopCustomerInvoiceSync?.(); stopClientsSync = stopProcessesSync = stopCustomerInvoiceSync = null; clients = []; processes = []; customerInvoiceRecords = []; customerInvoiceLoadError = ""; customerInvoiceLoading = false; selectedClientId = null; profileMode = false;
      $("#syncStatus").textContent = "Inicia sesión para ver los clientes"; clientsHost.innerHTML = `<p class="empty-state">Inicia sesión para consultar las fichas y los procesos.</p>`; notificationsHost.innerHTML = `<p class="empty-state">Inicia sesión para consultar los procesos abiertos.</p>`; renderClientDetails(); return;
    }
    if (!isAuthenticated || currentUserUid !== uid) connectData(uid);
    currentUserName = String(event.data.profile?.asesor || event.data.profile?.nombre || "").trim();
    currentUserIsAdmin = event.data.isAdmin === true || String(event.data.profile?.rol || "").toLocaleLowerCase("es") === "administrador";
    renderClientDetails();
  }
  if (event.data?.type === "INTERCOL_OPEN_CLIENT") {
    selectedClientId = String(event.data.id || "");
    selectedClientHistoryTab = "resumen";
    selectedInvoiceHistoryStatus = "pending";
    profileMode = true;
    $("#clientSearch").value = "";
    renderClientList(); renderClientDetails();
    if (event.data.processType) {
      const typeLabel = processTypeLabel(event.data.processType);
      $("#clientProcessTypeFilter")?.setAttribute("title", `Proceso iniciado: ${typeLabel}`);
    }
  }
});
function connectData(uid) {
  stopClientsSync?.(); stopProcessesSync?.(); stopCustomerInvoiceSync?.(); stopAdjustmentZonesSync?.();
  const firebase = window.parent.INTERCOL_FIREBASE;
  if (!firebase?.subscribeClients || !firebase?.subscribeClientProcesses) { displayError(new Error("Firebase no está disponible"), clientsHost); return; }
  isAuthenticated = true; currentUserUid = uid;
  stopClientsSync = firebase.subscribeClients(items => { clients = items; displayStatus(); renderClientList(); renderClientDetails(); }, error => displayError(error, clientsHost));
  stopProcessesSync = firebase.subscribeClientProcesses(items => { processes = items; displayStatus(); renderNotifications(); renderClientList(); renderClientDetails(); }, error => displayError(error, notificationsHost));
  customerInvoiceRecords = []; customerInvoiceLoadError = ""; customerInvoiceLoading = true;
  stopCustomerInvoiceSync = firebase.subscribePaymentNotifications?.(uid, items => {
    customerInvoiceRecords = items;
    customerInvoiceLoadError = "";
    customerInvoiceLoading = false;
    renderClientDetails();
  }, error => {
    console.error("No se pudieron cargar las facturas del cliente:", error);
    customerInvoiceLoading = false;
    customerInvoiceLoadError = error?.code === "permission-denied" ? "No tienes permiso para consultar Generación de facturas." : "No se pudieron cargar las verificaciones de facturas.";
    renderClientDetails();
  }) || null;
  stopAdjustmentZonesSync = firebase.subscribeAdjustmentZones?.(zones => {
    if (Array.isArray(zones) && zones.length) adjustmentZones = zones.filter(zone => zone?.nombre && Number.isFinite(Number(zone.valor)) && Number(zone.valor) > 0);
    if (selectedClientId) renderClientDetails();
  }, error => console.error("No se pudo cargar el catálogo de zonas:", error)) || null;
}
setInterval(() => { renderNotifications(); if (selectedClientId) renderClientDetails(); }, 60000);
window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");
