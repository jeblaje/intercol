const $ = selector => document.querySelector(selector);
const clientsHost = $("#clientList");
const notificationsHost = $("#notificationList");
const detailsHost = $("#clientCardPanel");
const processNames = { reconexion: "Reconexión", "cambio-fecha-pago": "Cambio de fecha de pago", "cambio-plan": "Cambio de plan" };
const processStepTemplates = {
  reconexion: ["Confirmar cliente y forma de contacto", "Revisar facturas pendientes, pagos o abonos", "Consultar zona y calcular el reajuste", "Generar o ajustar la factura", "Actualizar fecha de pago o fecha de espera", "Registrar el técnico que atendió el caso", "Verificar si hubo cambio de plan", "Verificar el ticket de reconexión", "Dejar la anotación del proceso", "Programar revisión de la próxima factura", "Realizar la reconexión y confirmar el servicio"],
  "cambio-fecha-pago": ["Confirmar cliente y fecha de pago actual", "Acordar la nueva fecha de pago", "Actualizar la fecha en la plataforma", "Confirmar el cambio con el cliente"],
  "cambio-plan": ["Confirmar cliente y plan actual", "Acordar el nuevo plan", "Actualizar el plan en la plataforma", "Confirmar el cambio con el cliente"]
};
const processStepHelp = {
  reconexion: [
    "Registra desde dónde se comunica el cliente, su número de contacto y si desea continuar. Si había una orden de retiro, confirma que desea continuar.",
    "Revisa cuántas facturas están pendientes, cuáles pagó el cliente y si hizo un abono. Distingue si debe el mes, el reajuste o ambos.",
    "Escribe la zona o barrio del cliente y selecciona la tarifa de reajuste que corresponde: $15.000 o $20.000. El sistema te mostrará el valor a cobrar.",
    "Si hay varias facturas pendientes, ajusta una con el mes más el reajuste y elimina las duplicadas. Si queda una factura solo para el reajuste, suma la comisión de $1.500. Si el cliente pagó el mes o abonó, registra el saldo pendiente y el acuerdo de pago.",
    "Cambia la fecha de pago en la plataforma. Si el cliente pagará el reajuste después, deja registrada la fecha hasta la que queda en espera.",
    "Si hubo una visita u orden de retiro, deja el nombre del técnico que atendió el caso. Si no aplica, marca esta tarea como completada sin técnico.",
    "Confirma si el cliente cambió de plan y registra el plan actual cuando corresponda.",
    "Comprueba que el ticket de reconexión exista y esté actualizado.",
    "Anota el canal de contacto, técnico (si aplica), facturas ajustadas, valores y acuerdos de pago.",
    "Registra cuándo se debe generar o revisar la próxima factura para hacer seguimiento.",
    "Haz la reconexión en la plataforma y confirma con el cliente que el servicio funciona correctamente."
  ]
};
const legacyReconnectionSteps = ["Confirmar cliente y validar su cédula", "Verificar estado del servicio y motivo de suspensión", "Realizar la reconexión en la plataforma", "Confirmar con el cliente que el servicio funciona"];
let clients = [];
let processes = [];
let selectedClientId = null;
let profileMode = false;
let isAuthenticated = false;
let currentUserUid = "";
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
  if (item.tipo === "reconexion" && (!Array.isArray(item.pasosVerificados) || item.pasosVerificados.length === 0) && Array.isArray(item.pasos) && item.pasos.length === legacyReconnectionSteps.length && item.pasos.every((step, index) => step === legacyReconnectionSteps[index])) return processStepTemplates.reconexion;
  return Array.isArray(item.pasos) && item.pasos.length ? item.pasos : processStepTemplates[item.tipo] || [];
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
function applyProfileMode() {
  $(".notifications").hidden = profileMode;
  $(".client-list-panel").hidden = profileMode;
  $(".clients-layout").classList.toggle("profile-mode", profileMode);
}
function processCard(item, showClient = false) {
  const open = item.estado !== "completado";
  const steps = getProcessSteps(item);
  const checked = new Set(Array.isArray(item.pasosVerificados) ? item.pasosVerificados.map(Number) : []);
  const owner = item.iniciadoPorUid === currentUserUid;
  const canDelete = owner || currentUserIsAdmin;
  const currentStep = steps.findIndex((_, index) => !checked.has(index));
  const progress = steps.length ? `<section class="process-timeline" aria-label="Pasos de ${escapeHtml(processTypeLabel(item.tipo))}"><div class="timeline-summary">${currentStep < 0 ? "Todos los pasos completados" : `Paso actual: ${currentStep + 1} de ${steps.length} · ${escapeHtml(steps[currentStep])}`}</div><ol>${steps.map((step, index) => { const done = checked.has(index); const current = index === currentStep; return `<li class="timeline-step ${done ? "is-done" : current ? "is-current" : "is-pending"}"><span class="timeline-marker" aria-hidden="true">${done ? "✓" : index + 1}</span><span class="timeline-step-copy"><strong>${escapeHtml(step)}</strong><small>${done ? "Completado" : current ? "Pendiente · paso actual" : "Pendiente"}</small></span></li>`; }).join("")}</ol><p class="process-save-status" role="status">${escapeHtml(processSaveErrors.get(item.id) || (owner ? "El avance se guarda al completar cada tarea." : `Solo ${item.iniciadoPorNombre || "quien inició el proceso"} puede continuarlo o editarlo.`))}</p></section>` : `<p class="empty-state">El checklist de este tipo de proceso aún no está configurado.</p>`;
  const continueButton = owner && open ? `<button class="continue-process-button" type="button" data-continue-process="${escapeHtml(item.id)}">Continuar</button>` : "";
  const deleteButton = canDelete ? `<button class="delete-process-button" type="button" data-delete-process="${escapeHtml(item.id)}">Eliminar proceso</button>` : "";
  return `<article class="process-card" id="process-${escapeHtml(item.id)}"><div class="process-card-top"><div><strong>${escapeHtml(processTypeLabel(item.tipo))}</strong>${showClient ? `<span class="process-client-name">${escapeHtml(item.clienteNombre || "")}</span>` : ""}</div><span class="process-chip ${open ? "open" : "done"}">${open ? "En curso" : "Completado"}</span></div><div class="process-info"><span>Inició: ${escapeHtml(formatDate(item.iniciadoEn))}</span><span>Por: ${escapeHtml(item.iniciadoPorNombre || "Asesor")}</span><span>${open ? `Lleva ${escapeHtml(elapsed(item.iniciadoEn))}` : `Finalizó: ${escapeHtml(formatDate(item.completadoEn))}`}</span>${item.informacion?.numeroContacto ? `<span>Contacto: ${escapeHtml(item.informacion.numeroContacto)}</span>` : ""}</div>${progress}<div class="process-card-actions">${continueButton}${deleteButton}</div></article>`;
}
function renderNotifications() {
  const filter = $("#noticeTypeFilter").value;
  const open = processes.filter(item => item.estado === "en_curso" && (filter === "all" || item.tipo === filter)).sort((a, b) => (timestampDate(a.iniciadoEn)?.getTime() || 0) - (timestampDate(b.iniciadoEn)?.getTime() || 0));
  $("#openProcessCount").textContent = `${open.length} abiertos`;
  notificationsHost.replaceChildren();
  if (!open.length) { notificationsHost.innerHTML = `<p class="empty-state">No hay procesos pendientes${filter === "all" ? "" : " para este tipo"}.</p>`; return; }
  open.forEach(item => {
    const article = document.createElement("article"); article.className = "notification-card";
    article.innerHTML = `<div><strong>${escapeHtml(processTypeLabel(item.tipo))} · ${escapeHtml(item.clienteNombre || "Cliente")}</strong><span>Cédula: ${escapeHtml(item.clienteCedula || "—")} · Inició ${escapeHtml(formatDate(item.iniciadoEn))}</span><time>Lleva ${escapeHtml(elapsed(item.iniciadoEn))} abierto · ${escapeHtml(item.iniciadoPorNombre || "Asesor")}</time></div><button type="button">Ver ficha</button>`;
    article.querySelector("button").addEventListener("click", () => { selectClient(item.clienteId); window.scrollTo({ top: document.querySelector(".clients-layout").offsetTop, behavior: "smooth" }); });
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
  detailsHost.innerHTML = `<div class="client-detail"><header class="client-detail-heading"><div><button class="back-to-client-list" id="backToClientList" type="button">← Volver a clientes</button><span class="eyebrow">FICHA DEL CLIENTE</span><h2>${escapeHtml(clientName(client))}</h2><p>Cédula ${escapeHtml(client.cedula)}</p></div><button id="startAnotherProcess" type="button">＋ Iniciar proceso nuevo</button></header><div class="client-meta"><span>Registrado por: ${escapeHtml(client.creadoPorNombre || "Asesor")}</span><span>Creado: ${escapeHtml(formatDate(client.creadoEn))}</span></div><section class="client-processes"><h3>Procesos del cliente</h3><div class="process-filter-row"><select id="clientProcessTypeFilter" aria-label="Filtrar por tipo"><option value="all">Todos los procesos</option><option value="reconexion">Reconexión</option><option value="cambio-fecha-pago">Cambio de fecha de pago</option><option value="cambio-plan">Cambio de plan</option></select><select id="clientProcessStatusFilter" aria-label="Filtrar por estado"><option value="all">Todos los estados</option><option value="en_curso">En curso</option><option value="completado">Completados</option></select></div><div class="process-list">${items.length ? items.map(item => processCard(item)).join("") : `<p class="empty-state">Este cliente todavía no tiene procesos con esos filtros.</p>`}</div></section></div>`;
  $("#clientProcessTypeFilter").value = filterType; $("#clientProcessStatusFilter").value = filterStatus;
  $("#clientProcessTypeFilter").addEventListener("change", renderClientDetails); $("#clientProcessStatusFilter").addEventListener("change", renderClientDetails);
  detailsHost.querySelectorAll("[data-continue-process]").forEach(button => button.addEventListener("click", () => openProcessWizard(button.dataset.continueProcess)));
  detailsHost.querySelectorAll("[data-delete-process]").forEach(button => button.addEventListener("click", () => deleteProcess(button.dataset.deleteProcess)));
  $("#backToClientList").addEventListener("click", () => { selectedClientId = null; profileMode = false; renderClientDetails(); });
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
  const checked = new Set(Array.isArray(process.pasosVerificados) ? process.pasosVerificados.map(Number) : []);
  const currentStep = steps.findIndex((_, index) => !checked.has(index));
  const activeStep = requestedStep !== null && requestedStep >= 0 && requestedStep < steps.length ? requestedStep : currentStep;
  const client = clients.find(item => item.id === process.clienteId) || { nombre: process.clienteNombre, cedula: process.clienteCedula };
  const completed = currentStep < 0 || process.estado === "completado";
  const task = completed ? null : steps[activeStep];
  const help = processStepHelp[process.tipo]?.[activeStep] || "Completa esta tarea antes de continuar con el siguiente paso del proceso.";
  const information = { ...(process.informacion || {}), ...getWizardInformationDraft(processId) };
  const fields = !completed && process.tipo === "reconexion" ? renderReconnectionStepFields(activeStep, information) : "";
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
  dialog.querySelectorAll("[data-process-info]").forEach(field => field.addEventListener("change", () => setWizardInformationDraft(processId, readWizardInformation(dialog))));
  dialog.querySelector("[data-previous-process-step]")?.addEventListener("click", () => goToPreviousProcessStep(processId, activeStep));
  dialog.querySelector("[name=numeroContacto]")?.addEventListener("change", event => saveWizardContactNumber(processId, event.currentTarget.value).catch(() => {}));
  dialog.querySelector("[data-complete-process-step]")?.addEventListener("click", completeWizardTask);
  if (!dialog.open) dialog.showModal();
}
function renderReconnectionStepFields(step, info) {
  if (step === 0) return `<div class="wizard-form-grid"><label class="wizard-contact-field" for="wizardContactNumber">Número de contacto del cliente<input id="wizardContactNumber" data-process-info name="numeroContacto" type="tel" inputmode="tel" autocomplete="tel" placeholder="Escribe el número de contacto" value="${escapeHtml(info.numeroContacto || "")}" required></label><label class="wizard-contact-field" for="wizardCanalContacto">¿Desde dónde se comunica el cliente?<select id="wizardCanalContacto" data-process-info name="canalContacto" required><option value="">Selecciona el medio de contacto</option>${["Chat", "Llamada", "Técnico", "Otro"].map(option => `<option value="${option}" ${info.canalContacto === option ? "selected" : ""}>${option}</option>`).join("")}</select></label></div>`;
  if (step === 2) {
    const zones = adjustmentZones.length ? adjustmentZones : [{ nombre: "Zona general", valor: 15000 }, { nombre: "Zona especial", valor: 20000 }];
    const hasSavedZone = info.zonaReconexion && !zones.some(zone => zone.nombre === info.zonaReconexion);
    const options = `${hasSavedZone ? `<option value="${escapeHtml(info.zonaReconexion)}" data-valor="${Number(info.valorReajuste) || 0}" selected>${escapeHtml(info.zonaReconexion)}</option>` : ""}${zones.map(zone => `<option value="${escapeHtml(zone.nombre)}" data-valor="${Number(zone.valor)}" ${info.zonaReconexion === zone.nombre ? "selected" : ""}>${escapeHtml(zone.nombre)}</option>`).join("")}`;
    return `<div class="wizard-form-grid"><label class="wizard-contact-field" for="wizardZonaReconexion">¿En qué zona vive el cliente?<select id="wizardZonaReconexion" data-process-info name="zonaReconexion" required><option value="">Selecciona la zona del cliente</option>${options}</select></label><input type="hidden" data-process-info name="valorReajuste" value="${escapeHtml(info.valorReajuste || "")}"><p class="wizard-calculated-amount" data-reajuste-summary>${info.valorReajuste ? `En ${escapeHtml(info.zonaReconexion || "esta zona")} debes cobrar <strong>${escapeHtml(formatCurrency(info.valorReajuste))}</strong> de reajuste.` : "Selecciona una zona para calcular el reajuste."}</p></div>`;
  }
  return "";
}
function formatCurrency(value) { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value) || 0); }
function updateReajusteSummary(dialog, amount) {
  const summary = dialog.querySelector("[data-reajuste-summary]");
  const zone = dialog.querySelector("[name=zonaReconexion]")?.value;
  if (summary) summary.innerHTML = amount && zone ? `En ${escapeHtml(zone)} debes cobrar <strong>${escapeHtml(formatCurrency(amount))}</strong> de reajuste.` : "Selecciona una zona para calcular el reajuste.";
}
function readWizardInformation(dialog) {
  return Object.fromEntries([...dialog.querySelectorAll("[data-process-info]")].map(field => [field.name, field.value.trim()]));
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
  const checked = new Set(Array.isArray(process.pasosVerificados) ? process.pasosVerificados.map(Number) : []);
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
  const checked = new Set(Array.isArray(process.pasosVerificados) ? process.pasosVerificados.map(Number) : []);
  if (steps.findIndex((_, stepIndex) => !checked.has(stepIndex)) !== index) return;
  const dialog = $("#processStepDialog");
  const fields = [...dialog.querySelectorAll("[data-process-info]")];
  const missingField = fields.find(field => !field.value.trim());
  if (missingField) {
    const status = $(".wizard-status"); if (status) { status.textContent = "Completa los datos de esta tarea antes de continuar."; status.classList.add("is-error"); }
    missingField.focus(); return;
  }
  const contactInput = dialog.querySelector("[name=numeroContacto]");
  await processDetailSaveQueue.catch(() => {});
  const latest = processes.find(item => item.id === processId) || process;
  const informacion = { ...(latest.informacion || {}), ...getWizardInformationDraft(processId), ...readWizardInformation(dialog) };
  checked.add(index);
  const pasosVerificados = [...checked].sort((a, b) => a - b);
  const estado = pasosVerificados.length === steps.length ? "completado" : "en_curso";
  button.disabled = true;
  button.textContent = "Guardando avance…";
  const status = $(".wizard-status");
  if (status) status.textContent = "Guardando tarea…";
  try {
    await window.parent.INTERCOL_FIREBASE.updateClientProcess(processId, { ...(informacion ? { informacion } : {}), pasos: steps, pasosVerificados, estado });
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
      isAuthenticated = false; currentUserUid = ""; currentUserIsAdmin = false; stopClientsSync?.(); stopProcessesSync?.(); stopClientsSync = stopProcessesSync = null; clients = []; processes = []; selectedClientId = null; profileMode = false;
      $("#syncStatus").textContent = "Inicia sesión para ver los clientes"; clientsHost.innerHTML = `<p class="empty-state">Inicia sesión para consultar las fichas y los procesos.</p>`; notificationsHost.innerHTML = `<p class="empty-state">Inicia sesión para consultar los procesos abiertos.</p>`; renderClientDetails(); return;
    }
    if (!isAuthenticated || currentUserUid !== uid) connectData(uid);
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
    if (Array.isArray(zones) && zones.length) adjustmentZones = zones.filter(zone => zone?.nombre && [15000, 20000].includes(Number(zone.valor)));
  }, error => console.error("No se pudo cargar el catálogo de zonas:", error)) || null;
}
setInterval(() => { renderNotifications(); if (selectedClientId) renderClientDetails(); }, 60000);
window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");
