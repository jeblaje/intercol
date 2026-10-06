const THEME_KEY = "intercol_theme_v2";
const VIEW_KEY = "intercol_active_view_v1";

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
    <section class="hero">
      <div>
        <span class="eyebrow">PANEL CENTRAL</span>
        <h2>Un dashboard. Todas tus secciones.</h2>
        <p>INTERCOL funciona como un shell único. El menú, el tema y la estructura general viven aquí; cada herramienta vive de forma independiente dentro de <strong>/secciones</strong>.</p>
      </div>
    </section>
    <section class="stats-grid">
      <article class="stat-card"><span class="stat-label">Secciones disponibles</span><div class="stat-value">${state.sections.length}</div><span class="stat-help">Cargadas desde /secciones/registry.js</span></article>
      <article class="stat-card"><span class="stat-label">Tema global</span><div class="stat-value">${state.theme === "dark" ? "Oscuro" : "Claro"}</div><span class="stat-help">También se envía a las secciones</span></article>
      <article class="stat-card"><span class="stat-label">Arquitectura</span><div class="stat-value">1 shell</div><span class="stat-help">Sin duplicar sidebar ni dashboard</span></article>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h3>Secciones</h3><span>Herramientas independientes dentro del mismo entorno</span></div></div>
      <div class="panel-body quick-grid" id="dashboardSections"></div>
    </section>
  `;

  const grid = $("#dashboardSections");
  if (!state.sections.length) {
    grid.innerHTML = `<div class="placeholder" style="grid-column:1/-1"><div><strong>No hay secciones registradas.</strong><p>Crea una carpeta dentro de /secciones y registra su ruta en registry.js.</p></div></div>`;
    return;
  }

  grid.innerHTML = state.sections.map((section, index) => `
    <button class="quick-action" data-open-section="${escapeHtml(section.id)}">
      <span class="quick-icon">${escapeHtml(section.icon || String(index + 1))}</span>
      <span><strong>${escapeHtml(section.name)}</strong><span>${escapeHtml(section.description || "Sección INTERCOL")}</span></span>
    </button>
  `).join("");
  grid.querySelectorAll("[data-open-section]").forEach((button) => button.addEventListener("click", () => openSection(button.dataset.openSection)));
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
    <div class="section-frame-wrap"><iframe id="sectionFrame" title="${escapeHtml(section.name)}" src="${escapeAttribute(section.path)}"></iframe></div>
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

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#themeToggle").addEventListener("click", toggleTheme);
$("#themePill").addEventListener("click", toggleTheme);
$("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

applyTheme();
renderSidebar();
const savedView = loadCurrentView();
if (savedView?.view === "section" && state.sections.some((section) => section.id === savedView.sectionId)) {
  openSection(savedView.sectionId);
} else if (["dashboard", "sections", "settings"].includes(savedView?.view)) {
  setView(savedView.view);
} else {
  setView("dashboard");
}





