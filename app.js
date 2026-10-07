const THEME_KEY = "intercol_theme_v2";
const VIEW_KEY = "intercol_active_view_v1";


const state = {
  sections: Array.isArray(window.INTERCOL_SECTIONS) ? window.INTERCOL_SECTIONS : [],
  activeView: "dashboard",
  activeSectionId: null,
  temporaryMessages: [],
  temporaryMessagesError: "",
  currentUser: null,
  advisorProfile: null,
  pendingSectionId: null,
  pendingInvoiceId: null,
  pendingInvoiceDraft: null,
  invoiceNotifications: [],
  invoiceToastStartedAt: new Map(),
  theme: loadTheme()
};

const $ = (selector) => document.querySelector(selector);
const content = $("#content");

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function saveCurrentView() {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ view: state.activeView, sectionId: state.activeSectionId }));
  } catch { /* Keep navigation usable if browser storage is unavailable. */ }
}

function loadCurrentView() {
  try {
    return JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
  } catch {
    return null;
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $("#themePillIcon").textContent = state.theme === "dark" ? "☀" : "☾";
  $("#themePillText").textContent = state.theme === "dark" ? "Claro" : "Oscuro";
  $("#themeToggle").textContent = state.theme === "dark" ? "☀" : "☾";
  localStorage.setItem(THEME_KEY, state.theme);
  broadcastTheme();
}

function themePayload() {
  const styles = getComputedStyle(document.documentElement);
  const names = ["--bg", "--surface", "--surface-2", "--surface-3", "--text", "--muted", "--border", "--primary", "--primary-2", "--primary-soft", "--danger"];
  return Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(name).trim()]));
}

function broadcastTheme() {
  const frame = $("#sectionFrame");
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage({ type: "INTERCOL_THEME", theme: state.theme, variables: themePayload() }, "*");
}

function renderSidebar() {
  const publicList = $("#sectionList");
  const protectedList = $("#protectedSectionList");
  const empty = $("#emptySections");
  publicList.replaceChildren();
  protectedList.replaceChildren();
  const visibleSections = state.sections.filter(section => !section.hideFromLists && section.id !== "acceso");
  const publicSections = visibleSections.filter(section => !section.requiresAuth);
  const protectedSections = visibleSections.filter(section => section.requiresAuth);
  empty.classList.toggle("hidden", publicSections.length > 0);
  const appendSection = (section, list, index) => {
    const item = document.createElement("button");
    const active = state.activeView === "section" && state.activeSectionId === section.id;
    item.type = "button";
    item.className = `nav-item section-nav-item ${active ? "active" : ""}`;
    item.innerHTML = `<span class="nav-icon">${escapeHtml(section.icon || String(index + 1))}</span><span>${escapeHtml(section.name)}</span>`;
    item.addEventListener("click", () => openSection(section.id));
    list.appendChild(item);
  };
  publicSections.forEach((section, index) => appendSection(section, publicList, index));
  protectedSections.forEach((section, index) => appendSection(section, protectedList, index));
  const account = $("#accountArea");
  if (account) {
    account.replaceChildren();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "account-nav-button" + (state.currentUser ? " is-signed-in" : "");
    if (state.currentUser) {
      const advisorName = state.advisorProfile?.asesor || state.currentUser.displayName || "Cuenta";
      const username = state.advisorProfile?.usuario || state.currentUser.email?.split("@")[0] || "";
      button.innerHTML = `<span class="account-avatar">${escapeHtml(advisorName.slice(0, 2).toUpperCase())}</span><span class="account-copy"><strong>${escapeHtml(advisorName)}</strong><small>Cerrar sesión · ${escapeHtml(username)}</small></span>`;
      button.addEventListener("click", async () => { try { await window.INTERCOL_FIREBASE?.signOutAdvisor(); } catch (error) { console.error(error); } });
      button.title = "Cerrar sesión";
    } else {
      button.innerHTML = '<span class="account-avatar">♙</span><span class="account-copy"><strong>Iniciar sesión</strong><small>o registrarse</small></span>';
      button.addEventListener("click", () => openSection("acceso"));
    }
    account.appendChild(button);
  }
}

function setView(view) {
  state.activeView = view;
  state.activeSectionId = null;
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));

  if (view === "dashboard") {
    $("#pageEyebrow").textContent = "ESPACIO DE TRABAJO";
    $("#pageTitle").textContent = "Dashboard";
    renderDashboard();
  } else if (view === "sections") {
    $("#pageEyebrow").textContent = "MÓDULOS";
    $("#pageTitle").textContent = "Secciones";
    renderSections();
  } else {
    $("#pageEyebrow").textContent = "PREFERENCIAS";
    $("#pageTitle").textContent = "Configuración";
    renderSettings();
  }
  renderSidebar();
  saveCurrentView();
}

function renderDashboard() {
  content.innerHTML = `
    <section class="dashboard-split" aria-label="Panel del dashboard">
      <div class="dashboard-blank" aria-label="Espacio de trabajo"></div>
      <section class="panel dashboard-messages">
        <div class="panel-header"><div><h3>Mensajes temporales</h3><span id="dashboardMessageCount">Mensajes que siguen vigentes</span></div><button class="secondary-button" id="manageTemporaryMessages" type="button">Administrar</button></div>
        <div class="dashboard-message-list" id="dashboardMessageList" aria-live="polite"></div>
      </section>
    </section>
  `;
  $("#manageTemporaryMessages").addEventListener("click", () => openSection("mensajes-temporales"));
  renderDashboardMessages();
}

function readTemporaryMessages() {
  return state.temporaryMessages;
}

function renderDashboardMessages() {
  const list = $("#dashboardMessageList");
  if (!list) return;
  const now = Date.now();
  const active = readTemporaryMessages().filter(message => Date.parse(message.expiresAt) > now);
  $("#dashboardMessageCount").textContent = `${active.length} mensaje${active.length === 1 ? " vigente" : "s vigentes"}`;
  list.replaceChildren();
  if (!active.length) {
    const empty = document.createElement("p");
    empty.className = "dashboard-message-empty";
    empty.textContent = state.temporaryMessagesError || "No hay mensajes vigentes. Puedes crear uno desde Administrar.";
    list.appendChild(empty);
    return;
  }
  active.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt)).forEach(message => {
    const card = document.createElement("article");
    card.className = "dashboard-message";
    const messageHeader = document.createElement("div");
    messageHeader.className = "dashboard-message-header";
    const body = document.createElement("p");
    body.textContent = message.text;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "dashboard-copy-button";
    copy.title = "Copiar mensaje";
    copy.setAttribute("aria-label", "Copiar mensaje");
    copy.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg>';
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(message.text);
        copy.title = "Mensaje copiado";
        copy.setAttribute("aria-label", "Mensaje copiado");
        copy.classList.add("copied");
        window.setTimeout(() => { copy.title = "Copiar mensaje"; copy.setAttribute("aria-label", "Copiar mensaje"); copy.classList.remove("copied"); }, 1500);
      } catch { copy.title = "No se pudo copiar"; copy.setAttribute("aria-label", "No se pudo copiar"); }
    });
    const expiry = document.createElement("time");
    expiry.dateTime = message.expiresAt;
    expiry.textContent = `Vence: ${new Date(message.expiresAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}`;
    messageHeader.append(body, copy);
    card.append(messageHeader);
    if (message.advisor?.trim()) {
      const advisor = document.createElement("div");
      advisor.className = "dashboard-message-advisor";
      advisor.textContent = `Asesor: ${message.advisor.trim()}`;
      card.append(advisor);
    }
    card.append(expiry);
    list.appendChild(card);
  });
}
function renderSections() {
  const availableSections = state.sections.filter(section => !section.hideFromLists && !section.requiresAuth);
  content.innerHTML = `
    <section class="hero">
      <div><span class="eyebrow">MÓDULOS INDEPENDIENTES</span><h2>Secciones de INTERCOL.</h2><p>Cada sección tiene su propio <strong>index.html</strong>, <strong>style.css</strong> y <strong>script.js</strong>. El dashboard solamente las carga.</p></div>
    </section>
    <section class="panel"><div class="panel-header"><div><h3>${availableSections.length} sección${availableSections.length === 1 ? "" : "es"}</h3><span>Selecciona una para abrirla</span></div></div><div class="panel-body quick-grid" id="sectionsGrid"></div></section>
  `;
  const grid = $("#sectionsGrid");
  grid.innerHTML = availableSections.length ? availableSections.map((section, index) => `
    <button class="quick-action" data-open-section="${escapeHtml(section.id)}"><span class="quick-icon">${escapeHtml(section.icon || String(index + 1))}</span><span><strong>${escapeHtml(section.name)}</strong><span>${escapeHtml(section.description || "Sin descripción")}</span></span></button>
  `).join("") : `<div class="placeholder" style="grid-column:1/-1"><div><strong>No hay secciones.</strong><p>Agrega una entrada en secciones/registry.js.</p></div></div>`;
  grid.querySelectorAll("[data-open-section]").forEach((button) => button.addEventListener("click", () => openSection(button.dataset.openSection)));
}

function renderSettings() {
  content.innerHTML = `
    <section class="hero"><div><span class="eyebrow">PREFERENCIAS</span><h2>Configuración global.</h2><p>El tema se controla desde el dashboard y se comunica a las secciones abiertas. Así cada herramienta puede conservar su diseño propio sin perder coherencia visual.</p></div></section>
    <section class="panel"><div class="panel-header"><div><h3>Apariencia</h3><span>Aplicada al dashboard y a las secciones</span></div></div><div class="panel-body settings-list">
      <div class="setting-row"><div><strong>Tema oscuro</strong><p>Cambia colores, superficies y textos de toda la experiencia.</p></div><button class="toggle ${state.theme === "dark" ? "on" : ""}" id="settingsTheme" aria-label="Alternar tema"></button></div>
      <div class="setting-row"><div><strong>Arquitectura por secciones</strong><p>El dashboard no contiene el HTML interno de las herramientas.</p></div><span class="session-badge">Activo</span></div>
    </div></section>
  `;
  $("#settingsTheme").addEventListener("click", toggleTheme);
}

function openSection(id) {
  let section = state.sections.find((item) => item.id === id);
  if (!section) return;
  if (section.requiresAuth && (!state.currentUser || !state.advisorProfile)) {
    state.pendingSectionId = id;
    section = state.sections.find(item => item.id === "acceso");
  }
  state.activeSectionId = section.id;
  state.activeView = "section";
  id = section.id;
  saveCurrentView();
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.remove("active"));
  $("#pageEyebrow").textContent = "SECCIÓN";
  $("#pageTitle").textContent = section.name;
  content.innerHTML = `
    <div class="section-toolbar">
      <div><span class="eyebrow">MÓDULO INDEPENDIENTE</span><p>${escapeHtml(section.description || "Sección INTERCOL")}</p></div>
      <button class="secondary-button" id="backToSections">← Secciones</button>
    </div>
    <div class="section-frame-wrap"><iframe id="sectionFrame" title="${escapeHtml(section.name)}" src="${escapeAttribute(section.path)}" allow="clipboard-write"></iframe></div>
  `;
  $("#backToSections").addEventListener("click", () => setView("sections"));
  const frame = $("#sectionFrame");
  frame.addEventListener("load", () => {
    broadcastTheme();
    frame.contentWindow.postMessage({ type: "INTERCOL_AUTH_STATE", user: state.currentUser ? { uid: state.currentUser.uid } : null, profile: state.advisorProfile }, "*");
    if (state.activeSectionId === "notificaciones-pago" && state.pendingInvoiceId) {
      frame.contentWindow.postMessage({ type: "INTERCOL_OPEN_INVOICE", id: state.pendingInvoiceId }, "*");
      state.pendingInvoiceId = null;
    }
    if (state.activeSectionId === "notificaciones-pago" && state.pendingInvoiceDraft) {
      frame.contentWindow.postMessage({ type: "INTERCOL_PREFILL_INVOICE", ...state.pendingInvoiceDraft }, "*");
      state.pendingInvoiceDraft = null;
    }
    frame.contentWindow.scrollTo(0, 0);
  });
  window.scrollTo(0, 0);
  renderSidebar();
  if (window.innerWidth <= 980) $("#sidebar").classList.remove("open");
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  if (state.activeView === "section") {
    broadcastTheme();
  } else {
    setView(state.activeView);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

window.addEventListener("message", (event) => {
  const frame = $("#sectionFrame");
  if (frame && event.source === frame.contentWindow && event.data?.type === "INTERCOL_REQUEST_NOTIFICATIONS") {
    const sendPermission = permission => frame.contentWindow.postMessage({ type: "INTERCOL_NOTIFICATIONS_PERMISSION", permission }, "*");
    if (!("Notification" in window)) sendPermission("unsupported");
    else Notification.requestPermission().then(permission => {
      sendPermission(permission);
      if (permission === "granted") fireInvoiceBrowserAlerts();
    }).catch(() => sendPermission("denied"));
    return;
  }
  if (frame && event.source === frame.contentWindow && event.data?.type === "INTERCOL_SECTION_RESIZE") {
    frame.style.height = `${Math.max(420, Number(event.data.height) || 0)}px`;
    return;
  }
  if (event.source !== frame?.contentWindow) return;
  if (event.data?.type === "INTERCOL_OPEN_INVOICE_FROM_UTILITIES") {
    const { customerName, customerId, paymentDay } = event.data;
    const reminderDate = nextInvoiceReminderDate(paymentDay);
    if (!reminderDate) {
      frame.contentWindow.postMessage({ type: "INTERCOL_INVOICE_CREATE_RESULT", ok: false, message: "El día de pago debe estar entre 1 y 31." }, "*");
      return;
    }
    state.pendingInvoiceDraft = {
      customerName: String(customerName || "").trim(),
      customerId: String(customerId || "").trim(),
      notificationDate: reminderDate.value,
      paymentDay: Number(paymentDay),
      paymentDate: reminderDate.paymentDate
    };
    if (!state.currentUser || !state.advisorProfile) {
      state.pendingSectionId = "notificaciones-pago";
      openSection("acceso");
      return;
    }
    openSection("notificaciones-pago");
    return;
  }
  if (event.data?.type === "INTERCOL_SECTION_READY") {
    broadcastTheme();
    frame.contentWindow.postMessage({ type: "INTERCOL_AUTH_STATE", user: state.currentUser ? { uid: state.currentUser.uid } : null, profile: state.advisorProfile }, "*");
    if (state.activeSectionId === "notificaciones-pago" && state.pendingInvoiceId) {
      frame.contentWindow.postMessage({ type: "INTERCOL_OPEN_INVOICE", id: state.pendingInvoiceId }, "*");
      state.pendingInvoiceId = null;
    }
    if (state.activeSectionId === "notificaciones-pago" && state.pendingInvoiceDraft) {
      frame.contentWindow.postMessage({ type: "INTERCOL_PREFILL_INVOICE", ...state.pendingInvoiceDraft }, "*");
      state.pendingInvoiceDraft = null;
    }
  }
  if (event.data?.type === "INTERCOL_CHECK_INVOICE_ALERTS") fireInvoiceBrowserAlerts();
  if (event.data?.type === "INTERCOL_AUTH_COMPLETE") refreshAdvisorState();
});

function nextInvoiceReminderDate(paymentDay) {
  const day = Number(paymentDay);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const now = new Date();
  for (let offset = 0; offset < 15; offset += 1) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() + offset, 1, 9, 0, 0, 0);
    const paymentDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(day, new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()), 9, 0, 0, 0);
    const reminderDate = new Date(paymentDate);
    reminderDate.setDate(reminderDate.getDate() - 10);
    if (reminderDate > now) {
      const value = new Date(reminderDate.getTime() - reminderDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const paymentDateValue = new Date(paymentDate.getTime() - paymentDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      return { value, paymentDate: paymentDateValue };
    }
  }
  return null;
}

let stopInvoiceNotificationSync = null;
let invoiceNotificationUid = null;
function invoiceReminderTimestamp(value) {
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) + "T09:00" : value;
  return new Date(dateValue).getTime();
}
function invoiceAlertStorageKey(record) { return "intercol_factura_alerta_" + state.currentUser?.uid + "_" + record.id + "_" + record.notificationDate; }
function dueInvoiceNotifications() {
  const now = Date.now();
  return state.invoiceNotifications.filter(record => !record.reviewed && invoiceReminderTimestamp(record.notificationDate) <= now);
}
function formatInvoiceReminder(value) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) + "T09:00" : value;
  return new Date(normalized).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}
function openInvoiceVerification(id) {
  state.pendingInvoiceId = id;
  openSection("notificaciones-pago");
}
function renderInvoiceAlertHost() {
  const host = $("#invoiceAlertHost");
  if (!host) return;
  host.replaceChildren();
  const now = Date.now();
  dueInvoiceNotifications().filter(record => {
    const key = invoiceAlertStorageKey(record);
    if (!state.invoiceToastStartedAt.has(key)) state.invoiceToastStartedAt.set(key, now);
    return now - state.invoiceToastStartedAt.get(key) < 60000;
  }).forEach(record => {
    const card = document.createElement("article");
    card.className = "invoice-alert-card";
    const heading = document.createElement("strong");
    heading.textContent = "Verifica la generación de esta factura";
    const details = document.createElement("p");
    details.textContent = record.customerName + " · Cédula " + record.customerId + " · " + formatInvoiceReminder(record.notificationDate);
    const actions = document.createElement("div");
    actions.className = "invoice-alert-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "invoice-alert-open";
    open.textContent = "Abrir para verificar";
    open.addEventListener("click", () => openInvoiceVerification(record.id));
    const invoice = document.createElement("a");
    invoice.className = "invoice-alert-link";
    invoice.textContent = "Revisar factura";
    invoice.href = "http://wisphub.net/clientes/ver/" + encodeURIComponent(record.customerId) + "@cibercitywisp/#retab3";
    invoice.target = "_blank";
    invoice.rel = "noopener noreferrer";
    actions.append(open, invoice);
    card.append(heading, details, actions);
    host.append(card);
  });
}
function fireInvoiceBrowserAlerts() {
  renderInvoiceAlertHost();
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  dueInvoiceNotifications().forEach(record => {
    const key = invoiceAlertStorageKey(record);
    if (localStorage.getItem(key) === "sent") return;
    const notification = new Notification("Verificar generación de factura", {
      body: "Comprueba si se generó la factura de " + record.customerName + " (cédula " + record.customerId + ").",
      tag: "factura-" + record.id,
      requireInteraction: false
    });
    notification.onclick = () => {
      window.focus();
      openInvoiceVerification(record.id);
      notification.close();
    };
    localStorage.setItem(key, "sent");
  });
}
function startInvoiceNotificationSync() {
  const firebase = window.INTERCOL_FIREBASE;
  const uid = state.currentUser?.uid;
  if (invoiceNotificationUid === uid && stopInvoiceNotificationSync) return;
  if (stopInvoiceNotificationSync) { stopInvoiceNotificationSync(); stopInvoiceNotificationSync = null; }
  invoiceNotificationUid = uid || null;
  state.invoiceNotifications = [];
  if (!uid || !state.advisorProfile || !firebase) { renderInvoiceAlertHost(); return; }
  stopInvoiceNotificationSync = firebase.subscribePaymentNotifications(uid, items => {
    state.invoiceNotifications = items.map(item => ({ id: item.id, customerName: String(item.nombre || ""), customerId: String(item.cedula || ""), notificationDate: String(item.fechaNotificacion || ""), reviewed: Boolean(item.revisado) }));
    fireInvoiceBrowserAlerts();
  }, error => console.error("No se pudieron revisar las alertas de facturas:", error));
}
setInterval(fireInvoiceBrowserAlerts, 15000);
let stopAuthSync = null;
async function handleAdvisorAuth(user) {
  const firebase = window.INTERCOL_FIREBASE;
  state.currentUser = user || null;
  state.advisorProfile = null;
  if (user) {
    try { state.advisorProfile = await firebase.getAdvisorProfile(user.uid); }
    catch (error) { console.error("No se pudo cargar el perfil del asesor:", error); }
  }
  renderSidebar();
  startInvoiceNotificationSync();
  const active = state.sections.find(item => item.id === state.activeSectionId);
  if (active?.requiresAuth && (!state.currentUser || !state.advisorProfile)) openSection("acceso");
  else if (state.currentUser && state.advisorProfile && (state.pendingSectionId || state.activeSectionId === "acceso")) {
    const destination = state.pendingSectionId || "notificaciones-pago";
    state.pendingSectionId = null;
    openSection(destination);
  } else if (state.activeView === "section") {
    $("#sectionFrame")?.contentWindow?.postMessage({ type: "INTERCOL_AUTH_STATE", user: user ? { uid: user.uid } : null, profile: state.advisorProfile }, "*");
  }
}
function refreshAdvisorState() {
  const firebase = window.INTERCOL_FIREBASE;
  if (!firebase) return;
  if (!stopAuthSync) stopAuthSync = firebase.observeAuth(user => handleAdvisorAuth(user));
  else handleAdvisorAuth(firebase.auth.currentUser);
}
window.addEventListener("intercol-firebase-ready", refreshAdvisorState);
refreshAdvisorState();
let stopTemporaryMessageSync = null;
function startTemporaryMessageSync() {
  const firebase = window.INTERCOL_FIREBASE;
  if (!firebase || stopTemporaryMessageSync) return;
  stopTemporaryMessageSync = firebase.subscribeTemporaryMessages(messages => {
    state.temporaryMessages = messages;
    state.temporaryMessagesError = "";
    if (state.activeView === "dashboard") renderDashboardMessages();
  }, error => {
    console.error("No se pudieron sincronizar los mensajes de Firestore:", error);
    state.temporaryMessagesError = error.code === "permission-denied"
      ? "Firestore no permite leer mensajes. Revisa las reglas de acceso de smsTemp."
      : "No se pudieron cargar los mensajes. Comprueba la conexión con Firebase.";
    if (state.activeView === "dashboard") renderDashboardMessages();
  });
}
window.addEventListener("intercol-firebase-ready", startTemporaryMessageSync);
startTemporaryMessageSync();

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#themeToggle").addEventListener("click", toggleTheme);
$("#themePill").addEventListener("click", toggleTheme);
$("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

applyTheme();
setInterval(() => { if (state.activeView === "dashboard") renderDashboardMessages(); }, 15000);
renderSidebar();
const savedView = loadCurrentView();
if (savedView?.view === "section" && state.sections.some((section) => section.id === savedView.sectionId)) {
  openSection(savedView.sectionId);
} else if (["dashboard", "sections", "settings"].includes(savedView?.view)) {
  setView(savedView.view);
} else {
  setView("dashboard");
}

















