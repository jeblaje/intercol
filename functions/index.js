const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp();
const db = getFirestore();
const ADMIN_UID = "INJQ1NtkRwRbxfLN2XCwF22flyu2";
const ADMIN_EMAILS = ["jeblaje@gmail.com", "jeblaje@intercol-784d9.firebaseapp.com"];

function requireSystemAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  const isAdmin = request.auth.uid === ADMIN_UID
    || ADMIN_EMAILS.includes(String(request.auth.token.email || "").toLowerCase());
  if (!isAdmin) throw new HttpsError("permission-denied", "Solo la cuenta administradora puede gestionar accesos.");
}

exports.listAdvisorAccounts = onCall({ region: "us-central1" }, async request => {
  requireSystemAdmin(request);
  const uids = Array.isArray(request.data?.uids)
    ? [...new Set(request.data.uids.filter(uid => typeof uid === "string" && uid.length > 0 && uid.length <= 128))].slice(0, 1000)
    : [];
  const accounts = await Promise.all(uids.map(async uid => {
    try {
      const user = await getAuth().getUser(uid);
      return { uid, email: user.email || "", emailVerified: Boolean(user.emailVerified) };
    } catch (error) {
      if (error.code === "auth/user-not-found") return { uid, email: "", emailVerified: false };
      throw error;
    }
  }));
  return { accounts };
});

exports.updateAdvisorAccount = onCall({ region: "us-central1" }, async request => {
  requireSystemAdmin(request);
  const uid = typeof request.data?.uid === "string" ? request.data.uid.trim() : "";
  const email = typeof request.data?.email === "string" ? request.data.email.trim().toLowerCase() : "";
  const password = typeof request.data?.password === "string" ? request.data.password : "";
  if (!uid || uid.length > 128) throw new HttpsError("invalid-argument", "Selecciona una cuenta válida.");
  if (!email && !password) throw new HttpsError("invalid-argument", "Indica un correo o una contraseña nueva.");
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new HttpsError("invalid-argument", "Escribe un correo electrónico válido.");
  }
  if (password && (password.length < 6 || password.length > 4096)) {
    throw new HttpsError("invalid-argument", "La contraseña debe tener al menos 6 caracteres.");
  }

  const auth = getAuth();
  const existingUser = await auth.getUser(uid);
  const updates = {};
  if (email && email !== String(existingUser.email || "").toLowerCase()) {
    updates.email = email;
    updates.emailVerified = false;
  }
  if (password) updates.password = password;
  if (Object.keys(updates).length === 0) throw new HttpsError("invalid-argument", "No hay cambios para guardar.");
  const updatedUser = await auth.updateUser(uid, updates);

  if (updates.email) {
    const profileRef = db.collection("asesores").doc(uid);
    const profile = await profileRef.get();
    const username = String(profile.data()?.usuario || "").trim().toLowerCase();
    const batch = db.batch();
    batch.set(profileRef, { email: updates.email, correoRecuperacion: updates.email, correoActualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
    if (/^[a-z0-9._-]{3,30}$/.test(username)) {
      batch.set(db.collection("loginAliases").doc(username), {
        uid,
        usuario: username,
        email: updates.email,
        actualizadoEn: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
  }

  return { uid, email: updatedUser.email || "", emailVerified: Boolean(updatedUser.emailVerified), passwordUpdated: Boolean(password) };
});