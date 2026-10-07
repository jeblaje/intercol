const form = document.querySelector("#accessForm");
const status = document.querySelector("#status");
const advisorField = document.querySelector("#advisorField");
const title = document.querySelector("#formTitle");
const submit = document.querySelector("#submitButton");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#passwordToggle");
let mode = "login";
function setMode(next) {
  mode = next;
  const registering = mode === "register";
  advisorField.hidden = !registering;
  document.querySelector("#advisor").required = registering;
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  title.textContent = registering ? "Crear cuenta" : "Iniciar sesión";
  submit.textContent = registering ? "Registrarse" : "Iniciar sesión";
  status.textContent = ""; status.classList.remove("error");
  document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
}
document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
passwordToggle.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  passwordToggle.textContent = show ? "Ocultar" : "Mostrar";
  passwordToggle.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
  passwordToggle.setAttribute("aria-pressed", String(show));
});
function readableError(error) {
  const messages = { "auth/email-already-in-use": "Ese nombre de usuario ya está registrado.", "auth/invalid-credential": "El usuario o la contraseña no son correctos.", "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.", "auth/operation-not-allowed": "Activa el proveedor Correo electrónico/contraseña en Firebase Authentication.", "auth/configuration-not-found": "Firebase Authentication no está inicializado o no tiene proveedor activo. Entra a Firebase > Authentication > Comenzar y activa Correo electrónico/contraseña.", "auth/network-request-failed": "No hay conexión con Firebase. Revisa internet e inténtalo de nuevo.", "permission-denied": "Firebase no permite guardar el perfil. Revisa las reglas de la colección asesores." };
  return messages[error.code] || error.message || "No se pudo completar la operación.";
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const firebase = window.parent.INTERCOL_FIREBASE;
  if (!firebase) { status.textContent = "No se pudo conectar con Firebase. Recarga la página."; status.classList.add("error"); return; }
  submit.disabled = true; status.classList.remove("error"); status.textContent = "Conectando…";
  try {
    if (mode === "register") {
      await firebase.registerAdvisor({ advisor: form.elements.advisor.value.trim(), username: form.elements.username.value.trim(), password: form.elements.password.value });
      status.textContent = "Cuenta creada. Abriendo tus notificaciones…";
    } else {
      await firebase.signInAdvisor({ username: form.elements.username.value.trim(), password: form.elements.password.value });
      status.textContent = "Sesión iniciada. Abriendo tus notificaciones…";
    }
    window.parent.postMessage({ type: "INTERCOL_AUTH_COMPLETE" }, "*");
  } catch (error) { status.textContent = readableError(error); status.classList.add("error"); }
  finally { submit.disabled = false; }
});
window.addEventListener("message", event => {
  if (event.data?.type === "INTERCOL_THEME") { document.documentElement.dataset.theme = event.data.theme; Object.entries(event.data.variables || {}).forEach(([key, value]) => document.documentElement.style.setProperty(key, value)); }
});
window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");


