const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const projectRoot = path.resolve(__dirname, "..");
const expectedProjectId = "intercol-784d9";

function readSecret(promptText) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Ejecuta esta herramienta en una ventana interactiva de PowerShell para ocultar la contraseña al escribirla.");
  }
  return new Promise((resolve, reject) => {
    let value = "";
    stdout.write(promptText);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const finish = (error, result) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      error ? reject(error) : resolve(result);
    };
    const onData = chunk => {
      for (const char of chunk) {
        if (char === "\u0003") return finish(new Error("Operación cancelada."));
        if (char === "\r" || char === "\n") return finish(null, value);
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath) throw new Error("Define GOOGLE_APPLICATION_CREDENTIALS con la ruta al JSON de la cuenta de servicio.");
  const resolvedCredentialPath = path.resolve(credentialPath);
  const relativeCredentialPath = path.relative(projectRoot, resolvedCredentialPath);
  if (relativeCredentialPath === "" || (!relativeCredentialPath.startsWith("..") && !path.isAbsolute(relativeCredentialPath))) {
    throw new Error("Por seguridad, guarda el JSON de la cuenta de servicio fuera de la carpeta del proyecto.");
  }
  if (!fs.existsSync(resolvedCredentialPath)) throw new Error("No se encontró el JSON en la ruta indicada.");
  const serviceAccount = JSON.parse(fs.readFileSync(resolvedCredentialPath, "utf8"));
  if (serviceAccount.project_id !== expectedProjectId) throw new Error(`La cuenta de servicio no pertenece al proyecto ${expectedProjectId}.`);

  initializeApp({ credential: cert(serviceAccount), projectId: expectedProjectId });
  const auth = getAuth();
  const db = getFirestore();
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const uid = (await rl.question("UID del asesor: ")).trim();
  const newEmail = (await rl.question("Nuevo correo: ")).trim().toLowerCase();
  rl.close();
  if (!uid || uid.length > 128) throw new Error("Escribe un UID válido.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error("Escribe un correo válido.");

  const profileRef = db.collection("asesores").doc(uid);
  const profileSnapshot = await profileRef.get();
  if (!profileSnapshot.exists) throw new Error("No existe un perfil en asesores para ese UID; no se modificó la cuenta.");
  const profile = profileSnapshot.data();
  const user = await auth.getUser(uid);
  console.log(`\nAsesor: ${profile.asesor || profile.usuario || uid}`);
  console.log(`UID: ${uid}`);
  console.log(`Correo actual: ${user.email || "sin correo"}`);
  console.log(`Correo nuevo: ${newEmail}`);
  console.log("La dirección nueva quedará sin verificar. El cambio de correo no envía un mensaje automáticamente.");

  const password = await readSecret("Nueva contraseña (mínimo 6 caracteres): ");
  const confirmation = await readSecret("Repite la nueva contraseña: ");
  if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
  if (password !== confirmation) throw new Error("Las contraseñas no coinciden.");
  const confirmRl = readline.createInterface({ input: stdin, output: stdout });
  const confirmationText = (await confirmRl.question("\nPara aplicar el cambio, escribe CAMBIAR: ")).trim();
  confirmRl.close();
  if (confirmationText !== "CAMBIAR") throw new Error("No se confirmó el cambio; no se modificó la cuenta.");

  const emailChanged = String(user.email || "").toLowerCase() !== newEmail;
  const updates = { password, ...(emailChanged ? { email: newEmail, emailVerified: false } : {}) };
  const updatedUser = await auth.updateUser(uid, updates);
  const batch = db.batch();
  batch.set(profileRef, {
    email: newEmail,
    correoRecuperacion: newEmail,
    correoActualizadoEn: FieldValue.serverTimestamp()
  }, { merge: true });
  const username = String(profile.usuario || "").trim().toLowerCase();
  if (/^[a-z0-9._-]{3,30}$/.test(username)) {
    batch.set(db.collection("loginAliases").doc(username), {
      uid,
      usuario: username,
      email: newEmail,
      actualizadoEn: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
  console.log(`\nCuenta actualizada. Correo de acceso: ${updatedUser.email}`);
  console.log(`Usuario para iniciar sesión: ${username || "el correo nuevo"}`);
}

main().catch(error => {
  console.error(`\nNo se pudo completar la recuperación: ${error.message || error}`);
  process.exitCode = 1;
});