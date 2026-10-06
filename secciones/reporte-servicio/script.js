const form = document.querySelector("#reportForm");
const output = document.querySelector("#reportOutput");
const portChoices = document.querySelector("#portChoices");
const copyStatus = document.querySelector("#copyStatus");
const REPORT_DRAFT_KEY = "intercol_reporte_servicio_draft_v1";
let selectedPort = 1;
let selectedSplitterOrdinal = 1;

const value = name => new FormData(form).get(name)?.toString().trim() || "";
const optionalLine = (label, content) => content ? `${label}: ${content}` : "";

function saveReportDraft() {
  try {
    const values = {};
    form.querySelectorAll("input,textarea,select").forEach(field => {
      if (!field.name) return;
      if (field.type === "radio") {
        if (field.checked) values[field.name] = field.value;
      } else if (field.type === "checkbox") values[field.name] = field.checked;
      else values[field.name] = field.value;
    });
    localStorage.setItem(REPORT_DRAFT_KEY, JSON.stringify({ values, selectedPort, selectedSplitterOrdinal }));
  } catch { /* local storage can be unavailable in private browsing */ }
}

function restoreReportDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(REPORT_DRAFT_KEY) || "null");
    if (!draft) return;
    for (const [name, savedValue] of Object.entries(draft.values || {})) {
      const fields = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      fields.forEach(field => {
        if (field.type === "radio") field.checked = field.value === savedValue;
        else if (field.type === "checkbox") field.checked = Boolean(savedValue);
        else field.value = savedValue;
      });
    }
    selectedPort = Number(draft.selectedPort) || 1;
    selectedSplitterOrdinal = Number(draft.selectedSplitterOrdinal) || 1;
  } catch { /* Ignore an invalid saved draft and start a fresh form. */ }
}

function isHighPower() {
  return value("reportType") === "Caja con potencia alta";
}

function syncMode() {
  const highPower = isHighPower();
  const splitterFields = document.querySelector("#splitterFields");
  const highPowerFields = document.querySelector("#highPowerFields");
  splitterFields.hidden = highPower;
  highPowerFields.hidden = !highPower;
  splitterFields.querySelectorAll("input,textarea,select,button").forEach(control => { control.disabled = highPower; });
  highPowerFields.querySelectorAll("input,textarea,select,button").forEach(control => { control.disabled = !highPower; });
}

function renderPorts(containerId = "portChoices", highPower = false) {
  const count = highPower ? 16 : value("boxType") === "X16" ? 16 : 8;
  if (selectedPort > count) selectedPort = 1;
  const container = document.querySelector(`#${containerId}`);
  container.innerHTML = Array.from({ length: count }, (_, i) => `<button type="button" class="select-button ${selectedPort === i + 1 ? "selected" : ""}" data-port="${i + 1}" aria-pressed="${selectedPort === i + 1}">${i + 1}</button>`).join("");
  container.querySelectorAll("[data-port]").forEach(button => button.addEventListener("click", () => {
    selectedPort = Number(button.dataset.port);
    renderPorts(containerId, highPower);
    renderReport();
  }));
}

function renderChoiceButtons(containerId, values, selected, name, onChoose) {
  const container = document.querySelector(`#${containerId}`);
  container.innerHTML = values.map(([value, label]) => `<button type="button" class="select-button ${selected === value ? "selected" : ""}" data-choice="${value}" aria-pressed="${selected === value}">${label}</button>`).join("");
  container.querySelectorAll("[data-choice]").forEach(button => button.addEventListener("click", () => {
    form.elements[name].value = button.dataset.choice;
    onChoose(button.dataset.choice);
    renderChoiceButtons(containerId, values, button.dataset.choice, name, onChoose);
    renderReport();
  }));
}

function renderControls() {
  const boxType = value("boxType") || "X8";
  renderChoiceButtons("boxTypeChoices", [["X8", "X8"], ["X16", "X16"]], boxType, "boxType", () => {
    selectedPort = 1;
    renderPorts();
  });
  renderChoiceButtons("splitterCountChoices", Array.from({ length: 5 }, (_, i) => [String(i), String(i)]), value("splittersExisting") || "0", "splittersExisting", existing => {
    selectedSplitterOrdinal = Math.min(Number(existing) + 1, 5);
    form.elements.splitterOrdinalChoice.value = String(selectedSplitterOrdinal);
    renderChoiceButtons("splitterOrdinalChoices", Array.from({ length: 5 }, (_, i) => [String(i + 1), `${i + 1}°`]), String(selectedSplitterOrdinal), "splitterOrdinalChoice", rank => { selectedSplitterOrdinal = Number(rank); });
  });
  renderChoiceButtons("splitterOrdinalChoices", Array.from({ length: 5 }, (_, i) => [String(i + 1), `${i + 1}°`]), String(selectedSplitterOrdinal), "splitterOrdinalChoice", rank => { selectedSplitterOrdinal = Number(rank); });
  renderChoiceButtons("paidChoices", [["Sí", "Sí"], ["No", "No"]], value("paid") || "Sí", "paid", () => {});
  renderChoiceButtons("highSplitterCountChoices", Array.from({ length: 5 }, (_, i) => [String(i), String(i)]), value("highSplittersExisting") || "0", "highSplittersExisting", existing => {
    const next = Math.min(Number(existing) + 1, 5);
    form.elements.highSplitterOrdinalChoice.value = String(next);
    renderChoiceButtons("highSplitterOrdinalChoices", Array.from({ length: 5 }, (_, i) => [String(i + 1), `${i + 1}°`]), String(next), "highSplitterOrdinalChoice", () => {});
  });
  renderChoiceButtons("highSplitterOrdinalChoices", Array.from({ length: 5 }, (_, i) => [String(i + 1), `${i + 1}°`]), value("highSplitterOrdinalChoice") || "1", "highSplitterOrdinalChoice", () => {});
  renderPorts("highPortChoices", true);
}

function renderReport() {
  if (isHighPower()) {
    const highExisting = Number(value("highSplittersExisting")) || 0;
    const highLines = [
      optionalLine("Cliente", value("highCustomerName")),
      optionalLine("Cédula", value("highCedula")),
      optionalLine("Dirección", value("highAddress")),
      optionalLine("Barrio", value("highNeighborhood")),
      optionalLine("Red", value("network")),
      optionalLine("Clave", value("networkKey")),
      optionalLine("Ticket", value("ticket")),
      optionalLine("Pago", value("paid")),
      optionalLine("¿A quién pagó?", value("paidTo")),
      optionalLine("Técnico", value("highTechnician")),
      optionalLine("Link", value("highLink")),
      optionalLine("Anotación", value("highAnnotation")),
      `Splitters existentes en la caja antes de este: ${highExisting}`,
      `Splitter que se va a colocar: ${ordinal(Number(value("highSplitterOrdinalChoice")) || highExisting + 1)}`,
      `Puerto donde se coloca el splitter: ${selectedPort}`,
      optionalLine("Asesor", value("highAdvisor"))
    ].filter(Boolean);
    output.value = highLines.join("\n");
    saveReportDraft();
    requestResize();
    return;
  }
  const type = value("reportType");
  const existing = Number(value("splittersExisting")) || 0;
  const lines = [
    `${type === "Splitter autorizado" ? "Autorizó el splitter" : "Quién reporta la caja ponchada"}: ${value("reporter")}`,
    `N° de caja: ${value("boxNumber")}`,
    `Tipo de caja: ${value("boxType")}`,
    `Usuario de referencia (CC): ${value("cedula")}`,
    `Nombre: ${value("customerName")}`,
    `Dirección: ${value("address")}`,
    `Barrio: ${value("neighborhood")}`,
    `Puerto donde se coloca el splitter: ${selectedPort}`,
    optionalLine("Potencia del cliente antes del splitter", value("powerBefore")),
    optionalLine("Potencia del cliente después del splitter", value("powerAfter")),
    `Asesor: ${value("advisor")}`,
    `Técnico: ${value("technician")}`,
    `Splitters existentes en la caja antes de este: ${existing}`,
    optionalLine("Splitter que se va a colocar", ordinal(Number(value("splitterOrdinalChoice")) || existing + 1)),
    optionalLine("Link", value("onuLink")),
    ...value("photoLinks").split(/\n+/).map((link, index) => link.trim() ? `${index === 0 ? "Fotos de potencia" : "Foto adicional"}: ${link.trim()}` : ""),
    optionalLine("Observaciones", value("comments"))
  ].filter(Boolean);
  output.value = lines.join("\n");
  saveReportDraft();
  requestResize();
}

function ordinal(number) {
  const names = ["", "Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto", "Séptimo", "Octavo"];
  return names[number] || `${number}°`;
}

document.querySelector("#copyReport").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    copyStatus.textContent = "Reporte copiado. Pégalo en el chat o formulario de destino.";
  } catch {
    output.focus();
    output.select();
    copyStatus.textContent = "Seleccioné el reporte; cópialo con Ctrl+C.";
  }
});

document.querySelector("#clearReport").addEventListener("click", () => {
  form.reset();
  selectedPort = 1;
  selectedSplitterOrdinal = 1;
  syncMode();
  renderPorts();
  renderControls();
  renderReport();
  copyStatus.textContent = "Formulario limpiado.";
  try { localStorage.removeItem(REPORT_DRAFT_KEY); } catch { /* Ignore unavailable local storage. */ }
});

form.addEventListener("input", renderReport);
form.addEventListener("change", event => {
  if (event.target.name === "reportType") {
    selectedPort = 1;
    syncMode();
    renderPorts();
    renderPorts("highPortChoices", true);
    renderControls();
  }
  if (event.target.name === "boxType") renderPorts();
  renderReport();
});

window.addEventListener("message", event => {
  if (event.data?.type !== "INTERCOL_THEME") return;
  Object.entries(event.data.variables || {}).forEach(([name, color]) => document.documentElement.style.setProperty(name, color));
  document.documentElement.dataset.theme = event.data.theme || "light";
});
window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");
const requestResize = () => window.parent.postMessage({ type: "INTERCOL_SECTION_RESIZE", height: document.documentElement.scrollHeight }, "*");
new ResizeObserver(requestResize).observe(document.documentElement);
restoreReportDraft();
syncMode();
renderPorts();
renderControls();
renderReport();
window.addEventListener("load", requestResize);
