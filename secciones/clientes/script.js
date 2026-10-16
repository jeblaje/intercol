const $ = selector => document.querySelector(selector);
const clientsHost = $("#clientList");
const notificationsHost = $("#notificationList");
const detailsHost = $("#clientCardPanel");
const processNames = { reconexion: "Reconexión", "cambio-fecha-pago": "Cambio de fecha de pago", "cambio-plan": "Cambio de plan" };
const processStepTemplates = {
  reconexion: ["Confirmar cliente y forma de contacto", "Seleccionar zona y calcular cuánto cobrar", "Verificar y ajustar las facturas pendientes", "Cambiar la fecha de pago", "Preparar anotación y programar revisión de factura"],
  "cambio-fecha-pago": ["Confirmar cliente y fecha de pago actual", "Acordar la nueva fecha de pago", "Actualizar la fecha en la plataforma", "Confirmar el cambio con el cliente"],
  "cambio-plan": ["Confirmar cliente y plan actual", "Acordar el nuevo plan", "Actualizar el plan en la plataforma", "Confirmar el cambio con el cliente"]
};
const processStepHelp = {
  reconexion: [
    "Registra desde dónde se comunica el cliente, su número de contacto y si desea continuar. Si había una orden de retiro, confirma que desea continuar.",
    "Selecciona la zona. Se calcula el reajuste, la comisión de $1.500 y el total. Si llegó por chat, confirma la zona con el cliente.",
    "Abre el enlace de Wisphub, verifica las facturas y selecciona la acción que realizaste. El sistema calcula el valor según corresponda.",
    "Actualiza la fecha de pago en Wisphub y registra la fecha que quedó. El sistema calcula el corte dos días después y la generación diez días antes.",
    "Abre el enlace de anotaciones, copia el texto preparado y marca la tarea. Programa fecha y hora para revisar la generación; se guardará en Generación de facturas."
  ]
};
const legacyReconnectionSteps = ["Confirmar cliente y validar su cédula", "Verificar estado del servicio y motivo de suspensión", "Realizar la reconexión en la plataforma", "Confirmar con el cliente que el servicio funciona"];
let clients = [];
let processes = [];
let selectedClientId = null;
let profileMode = false;
let editingClientProfileId = null;
let isAuthenticated = false;
let currentUserUid = "";
let currentUserName = "";
let currentUserIsAdmin = false;
let stopClientsSync = null;
let stopProcessesSync = null;
let stopAdjustmentZonesSync = null;
let adjustmentZones = [{ nombre: "Zona general", valor: 15000 }, { nombre: "Zona especial", valor: 20000 }];
const processSaveErrors = new Map();
let processDetailSaveQueue = Promise.resolve();
function processWriteErrorMessage(error, subject) {
  console.error(`No se pudo ${subject} del proceso:`, error);
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
function processTypeLabel(type) { return processNames[type] || "Proceso"; }
function getProcessSteps(item) {
  if (item.tipo === "reconexion") {
    const steps = [...processStepTemplates.reconexion];
    steps[1] = item.informacion?.canalContacto === "Chat" ? "Consultar zona del cliente y calcular el cobro del chat" : "Confirmar zona y calcular el valor que debe cobrar";
    return steps;
  }
  return Array.isArray(item.pasos) && item.pasos.length ? item.pasos : processStepTemplates[item.tipo] || [];
}
function getCheckedProcessSteps(item) {
  const saved = new Set(Array.isArray(item.pasosVerificados) ? item.pasosVerificados.map(Number) : []);
  if (item.tipo !== "reconexion" || !Array.isArray(item.pasos) || item.pasos.length !== 11) return saved;
  const migrated = new Set();
  if (saved.has(0)) migrated.add(0);
  if (saved.has(2)) migrated.add(1);
  if (saved.has(1) || saved.has(3)) migrated.add(2);
  if (saved.has(4)) migrated.add(3);
  if (saved.has(8) && saved.has(9)) migrated.add(4);
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
    ["Fecha de pago", client.fechaPago || (client.diaPago ? `${client.diaPago} de cada mes` : "Sin registrar")],
    ["Fecha de corte", client.fechaCorte || (client.diaCorte ? `${client.diaCorte} de cada mes` : "Sin registrar")],
    ["Generación de factura", client.fechaGeneracionFactura || ""],
    ["Zona", savedZone || "Sin registrar"],
    ["Número de contacto", latestInformation.numeroContacto],
    ["Medio de contacto", latestInformation.canalContacto],
    ["Reajuste reciente", latestInformation.valorReajuste ? formatCurrency(latestInformation.valorReajuste) : ""]
  ].filter(([, fieldValue]) => fieldValue);
  return `<section class="client-profile-data" aria-label="Datos del cliente"><div class="client-profile-field"><span>Nombre completo</span><strong>${escapeHtml(clientName(client))}</strong></div><div class="client-profile-field"><span>Cédula</span><strong>${escapeHtml(client.cedula)}</strong></div>${fields.map(([label, fieldValue]) => `<div class="client-profile-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(fieldValue)}</strong></div>`).join("")}<div class="client-profile-field"><span>Registrado por</span><strong>${escapeHtml(client.creadoPorNombre || "Asesor")}</strong></div><div class="client-profile-field"><span>Cliente desde</span><strong>${escapeHtml(formatDate(client.creadoEn))}</strong></div></section>`;
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
  return `<article class="process-card" id="process-${escapeHtml(item.id)}"><div class="process-row"><div class="process-row-main"><div class="process-card-top"><div><strong>${escapeHtml(processTypeLabel(item.tipo))}</strong>${showClient ? `<span class="process-client-name">${escapeHtml(item.clienteNombre || "")}</span>` : ""}</div><span class="process-chip ${open ? "open" : "done"}">${open ? "En curso" : "Completado"}</span></div><div class="process-info"><span>Inició: ${escapeHtml(formatDate(item.iniciadoEn))}</span><span>Por: ${escapeHtml(item.iniciadoPorNombre || "Asesor")}</span><span>${open ? `Lleva ${escapeHtml(elapsed(item.iniciadoEn))}` : `Finalizó: ${escapeHtml(formatDate(item.completadoEn))}`}</span>${item.informacion?.numeroContacto ? `<span>Contacto: ${escapeHtml(item.informacion.numeroContacto)}</span>` : ""}</div><p class="process-next-step">${escapeHtml(stepSummary)}</p></div><div class="process-card-actions">${detailsButton}${continueButton}${deleteButton}</div></div>${progress}</article>`;
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
  detailsHost.innerHTML = `<div class="client-detail"><header class="client-detail-heading"><div><button class="back-to-client-list" id="backToClientList" type="button">← Volver a clientes</button><span class="eyebrow">FICHA DEL CLIENTE</span><h2>${escapeHtml(clientName(client))}</h2><p>Cédula ${escapeHtml(client.cedula)}</p></div><div class="client-detail-actions"><button id="editClientProfile" class="profile-edit-button" type="button">${editingClientProfileId === client.id ? "Cerrar edición" : "Editar datos"}</button><button id="startAnotherProcess" type="button">＋ Iniciar proceso nuevo</button></div></header>${renderClientProfile(client, latestInformation)}<section class="client-processes"><div class="client-processes-heading"><div><span class="eyebrow">HISTORIAL</span><h3>Procesos realizados y en curso</h3></div><span class="count-pill">${items.length} ${items.length === 1 ? "proceso" : "procesos"}</span></div><div class="process-filter-row"><select id="clientProcessTypeFilter" aria-label="Filtrar por tipo"><option value="all">Todos los procesos</option><option value="reconexion">Reconexión</option><option value="cambio-fecha-pago">Cambio de fecha de pago</option><option value="cambio-plan">Cambio de plan</option></select><select id="clientProcessStatusFilter" aria-label="Filtrar por estado"><option value="all">Todos los estados</option><option value="en_curso">En curso</option><option value="completado">Completados</option></select></div><div class="process-list">${items.length ? items.map(item => processCard(item)).join("") : `<p class="empty-state">Este cliente todavía no tiene procesos con esos filtros.</p>`}</div></section></div>`;
  $("#clientProcessTypeFilter").value = filterType; $("#clientProcessStatusFilter").value = filterStatus;
  $("#clientProcessTypeFilter").addEventListener("change", renderClientDetails); $("#clientProcessStatusFilter").addEventListener("change", renderClientDetails);
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
  $("#startAnotherProcess").addEventListener("click", () => window.parent.postMessage({ type: "INTERCOL_START_CLIENT_PROCESS", client: { id: client.id, nombre: client.nombre, cedula: client.cedula } }, "*"));
  renderClientList(); applyProfileMode();
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
  const information = { ...(process.informacion || {}), cedulaCliente: String(client.cedula || ""), clienteNombre: clientName(client), valorMensualCliente: client.valorMensual ?? 0, ...getWizardInformationDraft(processId) };
  const fields = !completed && process.tipo === "reconexion" ? renderReconnectionStepFields(activeStep, information) : !completed ? renderClientProfileProcessFields(process, activeStep, information, client) : "";
  dialog.dataset.activeStep = String(activeStep);
  dialog.innerHTML = `<section class="process-wizard-card"><header><div><span class="eyebrow">${escapeHtml(processTypeLabel(process.tipo)).toLocaleUpperCase("es")}</span><h2>${escapeHtml(clientName(client))}</h2><p>Cédula ${escapeHtml(client.cedula || "—")}</p></div><button class="dialog-close" type="button" data-close-process-wizard aria-label="Cerrar">×</button></header><div class="wizard-progress"><span>Paso ${completed ? steps.length : activeStep + 1} de ${steps.length}</span><div>${steps.map((_, index) => `<i class="${checked.has(index) ? "is-done" : ""} ${index === activeStep && !completed ? "is-current" : ""}"></i>`).join("")}</div></div>${completed ? `<section class="wizard-complete"><span aria-hidden="true">✓</span><h3>Proceso completado</h3><p>Se guardaron todas las tareas de ${escapeHtml(processTypeLabel(process.tipo).toLocaleLowerCase("es"))}.</p></section>` : `<section class="wizard-task"><span class="eyebrow">TAREA ${activeStep + 1}</span><h3>${escapeHtml(task)}</h3><p>${escapeHtml(help)}</p>${fields}</section>`}<p class="wizard-status ${message ? "is-error" : ""}" role="status">${escapeHtml(message)}</p><footer>${completed ? `<button class="primary-button" type="button" data-close-process-wizard>Terminar</button>` : `${activeStep > 0 ? `<button class="secondary-button wizard-previous" type="button" data-previous-process-step>← Tarea anterior</button>` : ""}<button class="primary-button" type="button" data-complete-process-step="${escapeHtml(process.id)}" data-step-index="${activeStep}">Marcar completada y ver siguiente tarea</button>`}</footer></section>`;
  dialog.querySelectorAll("[data-close-process-wizard]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("[name=zonaReconexion]")?.addEventListener("change", event => {
    const amountField = dialog.querySelector("[name=valorReajuste]");
    const selected = adjustmentZones.find(zone => zone.nombre === event.currentTarget.value);
    if (amountField) amountField.value = selected ? String(selected.valor) : "";
    updateReajusteSummary(dialog, amountField?.value);
    setWizardInformationDraft(processId, readWizardInformation(dialog));
  });
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
  if (step === 0) return `<div class="wizard-form-grid"><label class="wizard-contact-field" for="wizardContactNumber">Número de contacto del cliente<input id="wizardContactNumber" data-process-info name="numeroContacto" type="tel" inputmode="tel" autocomplete="tel" placeholder="Escribe el número de contacto" value="${escapeHtml(info.numeroContacto || "")}" required></label><label class="wizard-contact-field" for="wizardCanalContacto">¿Desde dónde se comunica el cliente?<select id="wizardCanalContacto" data-process-info name="canalContacto" required><option value="">Selecciona el medio de contacto</option>${["Chat", "Llamada", "Técnico", "Otro"].map(option => `<option value="${option}" ${info.canalContacto === option ? "selected" : ""}>${option}</option>`).join("")}</select></label></div>`;
  if (step === 1) {
    const zones = adjustmentZones.length ? adjustmentZones : [{ nombre: "Zona general", valor: 15000 }, { nombre: "Zona especial", valor: 20000 }];
    const selectedZone = info.zonaReconexion || "Zona general";
    const selectedZoneConfig = zones.find(zone => zone.nombre === selectedZone);
    const selectedAmount = info.valorReajuste ?? selectedZoneConfig?.valor ?? "";
    const hasSavedZone = selectedZone && !zones.some(zone => zone.nombre === selectedZone);
    const options = `${hasSavedZone ? `<option value="${escapeHtml(selectedZone)}" data-valor="${Number(selectedAmount) || 0}" selected>${escapeHtml(selectedZone)}</option>` : ""}${zones.map(zone => `<option value="${escapeHtml(zone.nombre)}" data-valor="${Number(zone.valor)}" ${selectedZone === zone.nombre ? "selected" : ""}>${escapeHtml(zone.nombre)}</option>`).join("")}`;
    const commission = info.comisionReconexion || "1500";
    return `<div class="wizard-form-grid"><label class="wizard-contact-field" for="wizardZonaReconexion">¿En qué zona vive el cliente?<select id="wizardZonaReconexion" data-process-info name="zonaReconexion" required>${options}</select></label><label class="wizard-contact-field">Comisión<input data-process-info name="comisionReconexion" type="number" min="0" step="500" value="${escapeHtml(commission)}" required></label><input type="hidden" data-process-info name="valorReajuste" value="${escapeHtml(selectedAmount)}"><p class="wizard-calculated-amount" data-reajuste-summary>${selectedAmount ? `En ${escapeHtml(selectedZone)}: reajuste <strong>${escapeHtml(formatCurrency(selectedAmount))}</strong> + comisión <strong>${escapeHtml(formatCurrency(commission))}</strong> = total <strong>${escapeHtml(formatCurrency(Number(selectedAmount)+Number(commission)))}</strong>.` : "Selecciona una zona para calcular reajuste, comisión y total."}</p></div>`;
  }
  if (step === 2) {
    return `<a class="wizard-external-link wizard-invoices-link" href="https://wisphub.net/clientes/ver/${encodeURIComponent(clientCedulaForLink(info))}@cibercitywisp/#retab3" target="_blank" rel="noopener noreferrer">Abrir facturas pendientes en Wisphub ↗</a><label class="wizard-contact-field">¿Qué acción realizaste?<select data-process-info name="accionFactura" required><option value="">Selecciona la acción</option>${[["reajuste","Ajusté la factura con solo reajuste (+ comisión)"],["mes_reajuste","Ajusté la factura con mes + reajuste (sin comisión)"],["nueva_reajuste","Generé una factura nueva de reajuste (+ comisión)"]].map(([value,label])=>`<option value="${value}" ${info.accionFactura===value?"selected":""}>${label}</option>`).join("")}</select></label>`;
  }
  if (step === 3) return `<label class="wizard-contact-field">Fecha de pago que quedó en Wisphub<input data-process-info name="fechaPago" type="date" value="${escapeHtml(info.fechaPago || "")}" required></label><p class="wizard-calculated-amount" data-payment-date-summary></p>`;
  if (step === 4) {
    const annotationLink = `https://wisphub.net/clientes/ver/${encodeURIComponent(info.cedulaCliente || "")}@cibercitywisp/#set1`;
    const annotation = buildReconnectionAnnotation(info);
    return `<p class="wizard-calculated-amount">Anotación lista para copiar:</p><textarea class="wizard-annotation" readonly rows="3">${escapeHtml(annotation)}</textarea><button type="button" class="secondary-button" data-copy-annotation>Copiar anotación</button><a class="wizard-external-link" href="${annotationLink}" target="_blank" rel="noopener noreferrer">Abrir anotaciones en Wisphub ↗</a><label class="wizard-contact-field">Fecha y hora para revisar la generación de factura<input data-process-info name="fechaHoraRevisionFactura" type="datetime-local" value="${escapeHtml(info.fechaHoraRevisionFactura || defaultReminderDate(info.fechaGeneracionFactura || info.fechaPago))}" required></label><label class="wizard-check-confirm"><input data-process-info name="anotacionLista" type="checkbox" value="true" ${info.anotacionLista === "true" ? "checked" : ""} required> Ya hice la anotación en Wisphub</label>`;
  }
  return "";
}
function clientCedulaForLink(info) { return info.cedulaCliente || ""; }
function buildReconnectionAnnotation(info) { const date = new Intl.DateTimeFormat("es-CO").format(new Date()); const total = formatCurrency(info.totalCobrar ?? calculateReconnectionTotal(info)); const d = info.fechaPago ? new Date(`${info.fechaPago}T12:00:00`) : null; const day = d && Number.isFinite(d.getTime()) ? d.getDate() : ""; const contact = info.canalContacto ? ` Contacto por ${info.canalContacto}.` : ""; const zone = info.zonaReconexion ? ` Zona ${info.zonaReconexion}.` : ""; const label={reajuste:"reajuste + comisión",mes_reajuste:"mes + reajuste",nueva_reajuste:"factura nueva de reajuste + comisión"}[info.accionFactura]; const action = label ? ` Acción sobre factura: ${label}.` : ""; return `${date} RECONEXIÓN: ${clientName(clients.find(client => client.cedula === info.cedulaCliente) || {nombre: info.clienteNombre})}.${contact}${zone} Total cobrado: ${total}.${action}${day ? ` Queda con fecha de pago el día ${day} de cada mes.` : ""}`; }
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
function defaultReminderDate(paymentDate) { if (!paymentDate) return ""; return `${paymentDate}T09:00`; }
function updateReconnectionSummaries(dialog) {
  const process = processes.find(item => item.id === dialog.dataset.processId);
  const information = { ...(process?.informacion || {}), ...readWizardInformation(dialog), valorMensualCliente: clients.find(item => item.id === process?.clienteId)?.valorMensual ?? 0 };
  const charge = dialog.querySelector("[data-invoice-total]"); if (charge) charge.textContent = formatCurrency(calculateReconnectionTotal(information));
  if (dialog.querySelector("[data-reajuste-summary]")) updateReajusteSummary(dialog, dialog.querySelector('[name="valorReajuste"]')?.value);
  const date = dialog.querySelector('[name="fechaPago"]')?.value;
  const summary = dialog.querySelector("[data-payment-date-summary]");
  if (summary) { const payment = date ? new Date(`${date}T12:00:00`) : null; if (!payment || !Number.isFinite(payment.getTime())) summary.textContent = "Al guardar la fecha se calcularán automáticamente corte (2 días después) y generación (10 días antes)."; else { const cut = new Date(payment); cut.setDate(cut.getDate()+2); const gen = new Date(payment); gen.setDate(gen.getDate()-10); summary.textContent = `Fecha de corte: ${cut.toLocaleDateString("en-CA")} · Generación de factura: ${gen.toLocaleDateString("en-CA")}`; } }
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
  const missingField = fields.find(field => field.type === "checkbox" ? !field.checked : !field.value.trim());
  if (missingField) {
    const status = $(".wizard-status"); if (status) { status.textContent = "Completa los datos de esta tarea antes de continuar."; status.classList.add("is-error"); }
    missingField.focus(); return;
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
  } else if (process.tipo === "reconexion" && index === 1 && String(informacion.zonaReconexion || "").trim()) {
    const commission = Number(informacion.comisionReconexion);
    if (!Number.isFinite(commission) || commission < 0) { const status = $(".wizard-status"); if (status) { status.textContent = "Escribe una comisión válida."; status.classList.add("is-error"); } return; }
    informacion.comisionReconexion = commission;
    profileChanges = { zona: String(informacion.zonaReconexion).trim() };
  } else if (process.tipo === "reconexion" && index === 2) {
    if (!["reajuste", "mes_reajuste", "nueva_reajuste"].includes(informacion.accionFactura)) { const status = $(".wizard-status"); if (status) { status.textContent = "Selecciona la acción que realizaste en la factura."; status.classList.add("is-error"); } return; }
    informacion.totalCobrar = calculateReconnectionTotal(informacion);
  } else if (process.tipo === "reconexion" && index === 3) {
    const payment = new Date(`${informacion.fechaPago}T12:00:00`);
    if (!Number.isFinite(payment.getTime())) { const status = $(".wizard-status"); if (status) { status.textContent = "Selecciona una fecha de pago válida."; status.classList.add("is-error"); } return; }
    const cutoff = new Date(payment); cutoff.setDate(cutoff.getDate() + 2);
    const generation = new Date(payment); generation.setDate(generation.getDate() - 10);
    const isoDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    profileChanges = { fechaPago: informacion.fechaPago, fechaCorte: isoDay(cutoff), fechaGeneracionFactura: isoDay(generation), diaPago: payment.getDate(), diaCorte: cutoff.getDate() };
    informacion.fechaCorte = profileChanges.fechaCorte;
    informacion.fechaGeneracionFactura = profileChanges.fechaGeneracionFactura;
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
    if (process.tipo === "reconexion" && index === 4 && !informacion.notificacionFacturaId) {
      const reminder = String(informacion.fechaHoraRevisionFactura || "");
      if (!reminder || new Date(reminder).getTime() <= Date.now()) throw new Error("Elige una fecha y hora futura para recibir el aviso de revisión de factura.");
      const advisorName = currentUserName || "Asesor";
      const created = await firebase.createPaymentNotification({ customerName: clientName(clients.find(item => item.id === process.clienteId) || { nombre: process.clienteNombre }), customerId: process.clienteCedula, notificationDate: reminder, paymentDay: informacion.fechaPago ? Number(informacion.fechaPago.slice(-2)) : null, advisorUid: currentUserUid, advisorName, processId });
      informacion.notificacionFacturaId = created.id;
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
function selectClient(id) { selectedClientId = id; profileMode = true; renderClientDetails(); }
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
      isAuthenticated = false; currentUserUid = ""; currentUserName = ""; currentUserIsAdmin = false; stopClientsSync?.(); stopProcessesSync?.(); stopClientsSync = stopProcessesSync = null; clients = []; processes = []; selectedClientId = null; profileMode = false;
      $("#syncStatus").textContent = "Inicia sesión para ver los clientes"; clientsHost.innerHTML = `<p class="empty-state">Inicia sesión para consultar las fichas y los procesos.</p>`; notificationsHost.innerHTML = `<p class="empty-state">Inicia sesión para consultar los procesos abiertos.</p>`; renderClientDetails(); return;
    }
    if (!isAuthenticated || currentUserUid !== uid) connectData(uid);
    currentUserName = String(event.data.profile?.asesor || event.data.profile?.nombre || "").trim();
    currentUserIsAdmin = event.data.isAdmin === true || String(event.data.profile?.rol || "").toLocaleLowerCase("es") === "administrador";
    renderClientDetails();
  }
  if (event.data?.type === "INTERCOL_OPEN_CLIENT") {
    selectedClientId = String(event.data.id || "");
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
  stopClientsSync?.(); stopProcessesSync?.(); stopAdjustmentZonesSync?.();
  const firebase = window.parent.INTERCOL_FIREBASE;
  if (!firebase?.subscribeClients || !firebase?.subscribeClientProcesses) { displayError(new Error("Firebase no está disponible"), clientsHost); return; }
  isAuthenticated = true; currentUserUid = uid;
  stopClientsSync = firebase.subscribeClients(items => { clients = items; displayStatus(); renderClientList(); renderClientDetails(); }, error => displayError(error, clientsHost));
  stopProcessesSync = firebase.subscribeClientProcesses(items => { processes = items; displayStatus(); renderNotifications(); renderClientList(); renderClientDetails(); }, error => displayError(error, notificationsHost));
  stopAdjustmentZonesSync = firebase.subscribeAdjustmentZones?.(zones => {
    if (Array.isArray(zones) && zones.length) adjustmentZones = zones.filter(zone => zone?.nombre && Number.isFinite(Number(zone.valor)) && Number(zone.valor) > 0);
    if (selectedClientId) renderClientDetails();
  }, error => console.error("No se pudo cargar el catálogo de zonas:", error)) || null;
}
setInterval(() => { renderNotifications(); if (selectedClientId) renderClientDetails(); }, 60000);
window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");
