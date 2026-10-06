const STORAGE_KEY = "intercol_temporary_messages_v1";
const form = document.querySelector("#messageForm");
const list = document.querySelector("#messageList");
const status = document.querySelector("#formStatus");
const cancelEdit = document.querySelector("#cancelEdit");
const saveButton = document.querySelector("#saveMessage");

function readMessages() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((item) => item && typeof item.text === "string" && Number.isFinite(Date.parse(item.expiresAt))) : [];
  } catch { return []; }
}
function saveMessages(messages) { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); }
function pruneExpired() {
  const current = readMessages();
  const active = current.filter((item) => Date.parse(item.expiresAt) > Date.now());
  if (active.length !== current.length) saveMessages(active);
  return active;
}
function formatDate(value) { return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }); }
function render() {
  const messages = pruneExpired().sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
  document.querySelector("#messageCount").textContent = `${messages.length} mensaje${messages.length === 1 ? " vigente" : "s vigentes"}`;
  list.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Todavía no hay mensajes. Crea uno con el formulario."; list.appendChild(empty);
  } else {
    messages.forEach((message) => {
      const card = document.createElement("article"); card.className = "message-card";
      const text = document.createElement("p"); text.textContent = message.text;
      if (message.advisor?.trim()) {
        const advisor = document.createElement("div"); advisor.className = "message-meta"; advisor.textContent = `Asesor: ${message.advisor.trim()}`; card.appendChild(advisor);
      }
      const expiry = document.createElement("div"); expiry.className = "message-meta"; expiry.textContent = `Vence: ${formatDate(message.expiresAt)}`;
      const actions = document.createElement("div"); actions.className = "message-actions";
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "secondary"; edit.textContent = "Editar"; edit.addEventListener("click", () => beginEdit(message));
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = "Eliminar"; remove.addEventListener("click", () => { saveMessages(readMessages().filter((item) => item.id !== message.id)); render(); });
      actions.append(edit, remove); card.append(text, expiry, actions); list.appendChild(card);
    });
  }
  requestAnimationFrame(() => window.parent?.postMessage({ type: "INTERCOL_SECTION_RESIZE", height: document.documentElement.scrollHeight }, "*"));
}
function beginEdit(message) {
  form.elements.id.value = message.id;
  form.elements.text.value = message.text;
  form.elements.advisor.value = message.advisor || "";
  form.elements.expiresAt.value = toLocalInput(new Date(message.expiresAt));
  saveButton.textContent = "Guardar cambios";
  cancelEdit.hidden = false;
  form.elements.text.focus();
  status.textContent = "Editando mensaje";
}
function toLocalInput(date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function resetForm() { form.reset(); form.elements.id.value = ""; saveButton.textContent = "Publicar mensaje"; cancelEdit.hidden = true; status.textContent = ""; }
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = form.elements.text.value.trim();
  const advisor = form.elements.advisor.value.trim();
  const expiry = new Date(form.elements.expiresAt.value);
  if (!text) { status.textContent = "Escribe el mensaje."; return; }
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) { status.textContent = "El vencimiento debe ser una fecha y hora futuras."; return; }
  const messages = readMessages();
  const id = form.elements.id.value;
  if (id) {
    const index = messages.findIndex((item) => item.id === id);
    if (index >= 0) messages[index] = { ...messages[index], text, advisor, expiresAt: expiry.toISOString(), updatedAt: new Date().toISOString() };
  } else messages.push({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, advisor, expiresAt: expiry.toISOString(), createdAt: new Date().toISOString() });
  saveMessages(messages); resetForm(); status.textContent = "Mensaje guardado."; render();
});
cancelEdit.addEventListener("click", resetForm);
window.addEventListener("storage", (event) => { if (event.key === STORAGE_KEY) render(); });
window.addEventListener("focus", render);
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
window.addEventListener("message", (event) => {
  if (event.data?.type === "INTERCOL_THEME") {
    document.documentElement.dataset.theme = event.data.theme;
    for (const [name, value] of Object.entries(event.data.variables || {})) document.documentElement.style.setProperty(name, value);
  }
});
window.parent?.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");
render();
setInterval(render, 15000);
