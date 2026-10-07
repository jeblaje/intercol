// Configuración e inicialización de Firebase para INTERCOL.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
export const firebaseConfig = { apiKey: "AIzaSyDK0tK8yptJYD8R6f0VkoiyW2Lekl9KKAQ", authDomain: "intercol-784d9.firebaseapp.com", projectId: "intercol-784d9", storageBucket: "intercol-784d9.firebasestorage.app", messagingSenderId: "380146455867", appId: "1:380146455867:web:2d3b17e736f16ce88a931e" };
export const firebaseApp = initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
const temporaryMessages = collection(firestore, "smsTemp");
const paymentNotifications = collection(firestore, "notificacionesPago");
const verifiedBoxes = collection(firestore, "cajasVerificadas");
const publicSupportConfig = doc(firestore, "configuracionPublica", "equipos");
function usernameEmail(username) {
  const normalized = String(username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(normalized)) throw new Error("El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.");
  return `${normalized}@intercol-784d9.firebaseapp.com`;
}
async function saveAdvisorProfile(user, advisorName, username) {
  const profileRef = doc(firestore, "asesores", user.uid);
  const existing = await getDoc(profileRef);
  if (!existing.exists()) {
    await setDoc(profileRef, { uid: user.uid, asesor: advisorName.trim() || user.displayName || username, usuario: username.trim().toLowerCase(), rol: "asesor", creadoEn: serverTimestamp() });
  }
}
export async function registerAdvisor({ advisor, username, password }) {
  const email = usernameEmail(username);
  const credential = auth.currentUser?.email === email
    ? { user: auth.currentUser }
    : await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: advisor.trim() });
  await saveAdvisorProfile(credential.user, advisor, username);
  return credential.user;
}
export async function signInAdvisor({ username, password }) {
  const credential = await signInWithEmailAndPassword(auth, usernameEmail(username), password);
  await saveAdvisorProfile(credential.user, credential.user.displayName || username, username);
  return credential;
}
export function signOutAdvisor() { return signOut(auth); }
export async function getAdvisorProfile(uid) { const snapshot = await getDoc(doc(firestore, "asesores", uid)); return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null; }
export async function listAdvisorProfiles() { const snapshot = await getDocs(collection(firestore, "asesores")); return snapshot.docs.map(item => ({ id: item.id, ...item.data() })); }
export async function getAdvisorSectionPermissions(uid) { const snapshot = await getDoc(doc(firestore, "permisosAsesores", uid)); return snapshot.exists() ? snapshot.data() : null; }
export async function listAdvisorSectionPermissions() { const snapshot = await getDocs(collection(firestore, "permisosAsesores")); return snapshot.docs.map(item => ({ id: item.id, ...item.data() })); }
export function saveAdvisorSectionPermissions(uid, role, permissions, updatedBy) { return setDoc(doc(firestore, "permisosAsesores", uid), { asesorUid: uid, rol: role, permisos: permissions, actualizadoPor: updatedBy, actualizadoEn: serverTimestamp() }); }
export async function getAdvisorRolePermissions(roleId = "asesor") { const snapshot = await getDoc(doc(firestore, "rolesAsesores", roleId)); return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null; }
export async function listAdvisorRoles() { const snapshot = await getDocs(collection(firestore, "rolesAsesores")); return snapshot.docs.map(item => ({ id: item.id, ...item.data() })); }
export async function ensureAdvisorRole(roleId, name, permissions, updatedBy) { const roleRef = doc(firestore, "rolesAsesores", roleId); const snapshot = await getDoc(roleRef); if (snapshot.exists()) return { id: snapshot.id, ...snapshot.data() }; const role = { nombre: name, permisos: permissions, creadoPor: updatedBy, actualizadoEn: serverTimestamp() }; await setDoc(roleRef, role); return { id: roleId, ...role }; }
export function saveAdvisorRole(roleId, name, permissions, updatedBy) { return setDoc(doc(firestore, "rolesAsesores", roleId), { nombre: name, permisos: permissions, actualizadoPor: updatedBy, actualizadoEn: serverTimestamp() }, { merge: true }); }
export function deleteAdvisorRole(roleId) { return deleteDoc(doc(firestore, "rolesAsesores", roleId)); }
export function assignAdvisorRole(uid, roleId, updatedBy) { return updateDoc(doc(firestore, "asesores", uid), { rol: roleId, rolActualizadoPor: updatedBy, rolActualizadoEn: serverTimestamp() }); }
export function observeAuth(callback) { return onAuthStateChanged(auth, callback); }
export function subscribePaymentNotifications(uid, onChange, onError) { return onSnapshot(query(paymentNotifications, where("asesorUid", "==", uid)), snapshot => onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), onError); }
export function createPaymentNotification({ customerName, customerId, notificationDate, advisorUid, advisorName, paymentDay = null }) { return addDoc(paymentNotifications, { nombre: customerName, cedula: customerId, fechaNotificacion: notificationDate, ...(paymentDay ? { diaPago: paymentDay } : {}), asesorUid: advisorUid, asesor: advisorName, revisado: false, revisadoEn: null, revisadoPor: null, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }); }
export function updatePaymentNotification(id, { customerName, customerId, notificationDate }) { return updateDoc(doc(firestore, "notificacionesPago", id), { nombre: customerName, cedula: customerId, fechaNotificacion: notificationDate, actualizadoEn: serverTimestamp() }); }
export function setPaymentNotificationReviewed(id, reviewed, advisorName) { return updateDoc(doc(firestore, "notificacionesPago", id), { revisado: reviewed, revisadoEn: reviewed ? Timestamp.now() : null, revisadoPor: reviewed ? advisorName : null, actualizadoEn: serverTimestamp() }); }
export function deletePaymentNotification(id) { return deleteDoc(doc(firestore, "notificacionesPago", id)); }
function normalizeTemporaryMessage(snapshot) {
  const fields = snapshot.data(); const rawDate = fields.date ?? fields.expiresAt; const expiry = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate); const text = fields.data ?? fields.text;
  if (typeof text !== "string" || !Number.isFinite(expiry.getTime())) return null;
  return { id: snapshot.id, text, advisor: String(fields.asesor ?? fields.advisor ?? ""), expiresAt: expiry.toISOString() };
}
export function subscribeTemporaryMessages(onChange, onError) { return onSnapshot(temporaryMessages, snapshot => onChange(snapshot.docs.map(normalizeTemporaryMessage).filter(Boolean)), onError); }
export function createTemporaryMessage({ text, advisor, expiresAt }) { return addDoc(temporaryMessages, { data: text, asesor: advisor, date: Timestamp.fromDate(new Date(expiresAt)), createdAt: serverTimestamp() }); }
export function updateTemporaryMessage(id, { text, advisor, expiresAt }) { return updateDoc(doc(firestore, "smsTemp", id), { data: text, asesor: advisor, date: Timestamp.fromDate(new Date(expiresAt)), updatedAt: serverTimestamp() }); }
export function deleteTemporaryMessage(id) { return deleteDoc(doc(firestore, "smsTemp", id)); }
export function createVerifiedBox(data) {
  // La ficha se arma dentro de un iframe. Reconstruye el arreglo y sus objetos
  // en el contexto principal para que Firestore no reciba arrays de otro realm.
  const cedulas = Array.from(data.cedulas || [], user => ({
    cedula: String(user.cedula ?? ""),
    puertoTecnico: Number(user.puertoTecnico),
    puertoReal: Number(user.puertoReal),
    comentario: String(user.comentario ?? ""),
    fondoNaranja: Boolean(user.fondoNaranja)
  }));
  const record = {
    fecha: String(data.fecha ?? ""),
    tipoCaja: String(data.tipoCaja ?? ""),
    numeroCaja: String(data.numeroCaja ?? ""),
    direccion: String(data.direccion ?? ""),
    tecnico: String(data.tecnico ?? ""),
    asesor: String(data.asesor ?? ""),
    link: String(data.link ?? ""),
    asesorUid: String(data.asesorUid ?? ""),
    creadoPor: String(data.creadoPor ?? ""),
    usuarioRegistrado: String(data.usuarioRegistrado ?? ""),
    cedulas,
    creadoEn: serverTimestamp()
  };
  return addDoc(verifiedBoxes, record);
}
export function subscribeVerifiedBoxes(onChange, onError) { return onSnapshot(verifiedBoxes, snapshot => onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), onError); }
export function subscribePublicSupportConfig(onChange, onError) { return onSnapshot(publicSupportConfig, snapshot => onChange(snapshot.exists() ? snapshot.data() : null), onError); }
export function savePublicSupportConfig(value) {
  const groups = items => Array.from(items || [], item => String(item ?? "").trim()).filter(Boolean).slice(0, 100);
  return setDoc(publicSupportConfig, {
    soporte: {
      arriba: groups(value.soporte?.arriba),
      abajo: groups(value.soporte?.abajo),
      sanJuan: groups(value.soporte?.sanJuan),
      riohacha: groups(value.soporte?.riohacha)
    },
    ventas: {
      valledupar: groups(value.ventas?.valledupar),
      pueblos: groups(value.ventas?.pueblos)
    },
    actualizadoEn: serverTimestamp()
  });
}
window.INTERCOL_FIREBASE = { app: firebaseApp, db: firestore, auth, observeAuth, getAdvisorProfile, listAdvisorProfiles, getAdvisorSectionPermissions, listAdvisorSectionPermissions, saveAdvisorSectionPermissions, getAdvisorRolePermissions, listAdvisorRoles, ensureAdvisorRole, saveAdvisorRole, deleteAdvisorRole, assignAdvisorRole, registerAdvisor, signInAdvisor, signOutAdvisor, subscribeTemporaryMessages, createTemporaryMessage, updateTemporaryMessage, deleteTemporaryMessage, subscribePaymentNotifications, createPaymentNotification, updatePaymentNotification, setPaymentNotificationReviewed, deletePaymentNotification, createVerifiedBox, subscribeVerifiedBoxes, subscribePublicSupportConfig, savePublicSupportConfig };
window.dispatchEvent(new Event("intercol-firebase-ready"));

