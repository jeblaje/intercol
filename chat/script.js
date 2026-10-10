const gate = document.querySelector("#chatAccessGate");
const chatShell = document.querySelector("#chatShell");

function showGate(title, message, showLogin = false) {
  gate.innerHTML = `<span class="gate-mark">I</span><span class="gate-kicker">INTERCOL · CHAT</span><h1>${title}</h1><p>${message}</p>${showLogin ? '<a class="gate-link" href="../#acceso">Iniciar sesión en INTERCOL</a>' : '<a class="gate-link" href="../">Volver a INTERCOL</a>'}`;
  gate.hidden = false;
  chatShell.hidden = true;
}

async function checkChatAccess(firebase, user) {
  if (!user) { showGate("Inicia sesión para continuar", "El chat está disponible para las cuentas con permiso.", true); return; }
  try {
    const profile = await firebase.getAdvisorProfile(user.uid);
    if (!profile) { showGate("No encontramos tu perfil", "Inicia sesión con una cuenta registrada en INTERCOL."); return; }
    const roleId = profile.rol || "asesor";
    const isSystemAdmin = user.uid === "INJQ1NtkRwRbxfLN2XCwF22flyu2" || String(user.email || "").toLowerCase() === "jeblaje@intercol-784d9.firebaseapp.com";
    const role = await firebase.getAdvisorRolePermissions(roleId);
    const permission = role?.permisos?.chat?.acceder;
    const defaultAdvisorAccess = roleId === "asesor" && typeof permission !== "boolean";
    if (!isSystemAdmin && permission !== true && !defaultAdvisorAccess) { showGate("No tienes acceso al chat", "Pídele al administrador que habilite el permiso de Chat para tu rol."); return; }
    gate.hidden = true;
    chatShell.hidden = false;
  } catch (error) {
    console.error("No se pudo verificar el permiso de chat:", error);
    showGate("No se pudo verificar el acceso", "Revisa tu conexión e inténtalo de nuevo.");
  }
}

function bootChat() {
  const firebase = window.INTERCOL_FIREBASE;
  if (!firebase) { showGate("Chat no disponible", "No se pudo conectar con Firebase."); return; }
  firebase.observeAuth(user => checkChatAccess(firebase, user));
}

if (window.INTERCOL_FIREBASE) bootChat();
else window.addEventListener("intercol-firebase-ready", bootChat, { once: true });
