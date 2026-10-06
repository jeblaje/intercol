const form = document.querySelector("#debtorForm");
const output = document.querySelector("#debtorOutput");
const DRAFT_KEY = "intercol_enviar_moroso_draft_v1";
const fields = [
  ["name", "Nombre"],
  ["cedula", "Cédula"],
  ["phones", "Teléfono"],
  ["address", "Dirección"],
  ["neighborhood", "Barrio"],
  ["note", "Anotación"]
];

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(new FormData(form).entries())));
  } catch { /* Storage can be unavailable in private browsing. */ }
}

function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!saved) return;
    for (const [name, text] of Object.entries(saved)) {
      const field = form.elements[name];
      if (field) field.value = text;
    }
  } catch { /* Ignore invalid saved data and start with an empty form. */ }
}

function renderOutput() {
  const data = new FormData(form);
  output.value = fields
    .map(([name, label]) => {
      const value = data.get(name)?.toString().trim();
      return value ? `${label}: ${value}` : "";
    })
    .filter(Boolean)
    .join("\n");
  saveDraft();
  requestResize();
}

form.addEventListener("input", renderOutput);
document.querySelector("#clearDebtor").addEventListener("click", () => {
  form.reset();
  output.value = "";
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* Ignore unavailable storage. */ }
  document.querySelector("#formStatus").textContent = "Formulario limpiado.";
  requestResize();
});

document.querySelector("#copyDebtor").addEventListener("click", async () => {
  const status = document.querySelector("#copyStatus");
  if (!output.value) {
    status.textContent = "Completa al menos un campo para copiar.";
    return;
  }
  try {
    await navigator.clipboard.writeText(output.value);
    status.textContent = "Texto copiado.";
  } catch {
    output.focus();
    output.select();
    status.textContent = "Texto seleccionado; cópialo con Ctrl+C.";
  }
});

window.addEventListener("message", event => {
  if (event.data?.type !== "INTERCOL_THEME") return;
  Object.entries(event.data.variables || {}).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));
  document.documentElement.dataset.theme = event.data.theme || "light";
});

window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");
const requestResize = () => window.parent.postMessage({ type: "INTERCOL_SECTION_RESIZE", height: document.documentElement.scrollHeight }, "*");
new ResizeObserver(requestResize).observe(document.documentElement);
restoreDraft();
renderOutput();
window.addEventListener("load", requestResize);
