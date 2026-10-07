import {
  createTemporaryMessage,
  deleteTemporaryMessage,
  subscribeTemporaryMessages,
  updateTemporaryMessage
} from "../../admin/firebase-config.js";

const form = document.querySelector("#messageForm");
const list = document.querySelector("#messageList");
const status = document.querySelector("#formStatus");
const cancelEdit = document.querySelector("#cancelEdit");
const saveButton = document.querySelector("#saveMessage");
let messages = [];
let hasSnapshot = false;
let loadError = "";

function formatDate(value) {
  return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}
function toLocalInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function resetForm() {
  form.reset();
  form.elements.id.value = "";
  saveButton.textContent = "Publicar mensaje";
  cancelEdit.hidden = true;
  status.textContent = "";
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
function describeError(error, fallback) {
  console.error(error);
  if (error?.code === "permission-denied") return "Firestore rechazó el cambio. Revisa las reglas de acceso de smsTemp.";
  if (error?.code === "unavailable") return "Firebase no está disponible. Comprueba tu conexión.";
  return fallback;
}
function render() {
  const active = messages.filter(message => Date.parse(message.expiresAt) > Date.now())
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
  document.querySelector("#messageCount").textContent = `${active.length} mensaje${active.length === 1 ? " vigente" : "s vigentes"}`;
  list.replaceChildren();
  if (!active.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = loadError || (hasSnapshot ? "Todavía no hay mensajes vigentes. Crea uno con el formulario." : "Conectando con Firebase…");
    list.appendChild(empty);
  } else {
    active.forEach(message => {
      const card = document.createElement("article");
      card.className = "message-card";
      const text = document.createElement("p");
      text.textContent = message.text;
      if (message.advisor?.trim()) {
        const advisor = document.createElement("div");
        advisor.className = "message-meta";
        advisor.textContent = `Asesor: ${message.advisor.trim()}`;
        card.appendChild(advisor);
      }
      const expiry = document.createElement("div");
      expiry.className = "message-meta";
      expiry.textContent = `Vence: ${formatDate(message.expiresAt)}`;
      const actions = document.createElement("div");
      actions.className = "message-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary";
      edit.textContent = "Editar";
      edit.addEventListener("click", () => beginEdit(message));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "Eliminar";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          await deleteTemporaryMessage(message.id);
          status.textContent = "Mensaje eliminado.";
        } catch (error) {
          status.textContent = describeError(error, "No se pudo eliminar el mensaje.");
          remove.disabled = false;
        }
      });
      actions.append(edit, remove);
      card.append(text, expiry, actions);
      list.appendChild(card);
    });
  }
  requestAnimationFrame(() => window.parent?.postMessage({ type: "INTERCOL_SECTION_RESIZE", height: document.documentElement.scrollHeight }, "*"));
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const text = form.elements.text.value.trim();
  const advisor = form.elements.advisor.value.trim();
  const expiry = new Date(form.elements.expiresAt.value);
  if (!text) { status.textContent = "Escribe el mensaje."; return; }
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
    status.textContent = "El vencimiento debe ser una fecha y hora futuras.";
    return;
  }
  saveButton.disabled = true;
  try {
    const id = form.elements.id.value;
    const record = { text, advisor, expiresAt: expiry.toISOString() };
    if (id) await updateTemporaryMessage(id, record);
    else await createTemporaryMessage(record);
    resetForm();
    status.textContent = id ? "Mensaje actualizado." : "Mensaje publicado para todos los usuarios.";
  } catch (error) {
    status.textContent = describeError(error, "No se pudo guardar el mensaje.");
  } finally {
    saveButton.disabled = false;
  }
});
cancelEdit.addEventListener("click", resetForm);
window.addEventListener("message", event => {
  if (event.data?.type !== "INTERCOL_THEME") return;
  document.documentElement.dataset.theme = event.data.theme;
  for (const [name, value] of Object.entries(event.data.variables || {})) document.documentElement.style.setProperty(name, value);
});
window.parent?.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");

subscribeTemporaryMessages(nextMessages => {
  messages = nextMessages;
  hasSnapshot = true;
  loadError = "";
  render();
}, error => {
  hasSnapshot = true;
  loadError = error?.code === "permission-denied"
    ? "Firestore no permite leer esta colección. Revisa sus reglas de acceso."
    : "No se pudieron cargar los mensajes. Comprueba la conexión con Firebase.";
  console.error("No se pudieron cargar mensajes temporales:", error);
  render();
});
setInterval(render, 15000);
