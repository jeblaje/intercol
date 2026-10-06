const THEME_KEY = "intercol_theme_v2";
const VIEW_KEY = "intercol_active_view_v1";
const TEMP_MESSAGES_KEY = "intercol_temporary_messages_v1";

const state = {
  sections: Array.isArray(window.INTERCOL_SECTIONS) ? window.INTERCOL_SECTIONS : [],
  activeView: "dashboard",
  activeSectionId: null,
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
  const list = $("#sectionList");
  const empty = $("#emptySections");
  list.innerHTML = "";
  empty.classList.toggle("hidden", state.sections.length > 0);

  state.sections.forEach((section, index) => {
    const item = document.createElement("button");
    const active = state.activeView === "section" && state.activeSectionId === section.id;

    item.type = "button";
    item.className = `nav-item section-nav-item ${active ? "active" : ""}`;
    item.innerHTML = `
      <span class="nav-icon">${escapeHtml(section.icon || String(index + 1))}</span>
      <span>${escapeHtml(section.name)}</span>
    `;
    item.addEventListener("click", () => openSection(section.id));
    list.appendChild(item);
  });
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
  try {
    const data = JSON.parse(localStorage.getItem(TEMP_MESSAGES_KEY) || "[]");
    return Array.isArray(data) ? data.filter((item) => item && typeof item.text === "string" && Number.isFinite(Date.parse(item.expiresAt))) : [];
  } catch { return []; }
}

function renderDashboardMessages() {
  const list = $("#dashboardMessageList");
  if (!list) return;
  const now = Date.now();
  const messages = readTemporaryMessages();
  const active = messages.filter((message) => Date.parse(message.expiresAt) > now);
  if (active.length !== messages.length) {
    try { localStorage.setItem(TEMP_MESSAGES_KEY, JSON.stringify(active)); } catch { /* Keep dashboard usable if storage is unavailable. */ }
  }
  $("#dashboardMessageCount").textContent = `${active.length} mensaje${active.length === 1 ? " vigente" : "s vigentes"}`;
  list.replaceChildren();
  if (!active.length) {
    const empty = document.createElement("p");
    empty.className = "dashboard-message-empty";
    empty.textContent = "No hay mensajes vigentes. Puedes crear uno desde Administrar.";
    list.appendChild(empty);
    return;
  }
  active.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt)).forEach((message) => {
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
        window.setTimeout(() => {
          copy.title = "Copiar mensaje";
          copy.setAttribute("aria-label", "Copiar mensaje");
          copy.classList.remove("copied");
        }, 1500);
      } catch {
        copy.title = "No se pudo copiar";
        copy.setAttribute("aria-label", "No se pudo copiar");
      }
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
  content.innerHTML = `
    <section class="hero">
      <div><span class="eyebrow">MÓDULOS INDEPENDIENTES</span><h2>Secciones de INTERCOL.</h2><p>Cada sección tiene su propio <strong>index.html</strong>, <strong>style.css</strong> y <strong>script.js</strong>. El dashboard solamente las carga.</p></div>
    </section>
    <section class="panel"><div class="panel-header"><div><h3>${state.sections.length} sección${state.sections.length === 1 ? "" : "es"}</h3><span>Selecciona una para abrirla</span></div></div><div class="panel-body quick-grid" id="sectionsGrid"></div></section>
  `;
  const grid = $("#sectionsGrid");
  grid.innerHTML = state.sections.length ? state.sections.map((section, index) => `
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
  const section = state.sections.find((item) => item.id === id);
  if (!section) return;
  state.activeSectionId = id;
  state.activeView = "section";
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
  if (frame && event.source === frame.contentWindow && event.data?.type === "INTERCOL_SECTION_RESIZE") {
    frame.style.height = `${Math.max(420, Number(event.data.height) || 0)}px`;
    return;
  }
  if (!event.data || event.data.type !== "INTERCOL_SECTION_READY") return;
  broadcastTheme();
});

window.addEventListener("storage", (event) => {
  if (event.key === TEMP_MESSAGES_KEY && state.activeView === "dashboard") renderDashboardMessages();
});

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





