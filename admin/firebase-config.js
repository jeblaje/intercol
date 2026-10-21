// Configuración e inicialización de Firebase para INTERCOL.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, verifyBeforeUpdateEmail, updatePassword, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, setDoc, writeBatch, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
export const firebaseConfig = { apiKey: "AIzaSyDK0tK8yptJYD8R6f0VkoiyW2Lekl9KKAQ", authDomain: "intercol-784d9.firebaseapp.com", projectId: "intercol-784d9", storageBucket: "intercol-784d9.firebasestorage.app", messagingSenderId: "380146455867", appId: "1:380146455867:web:2d3b17e736f16ce88a931e" };
export const firebaseApp = initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
const temporaryMessages = collection(firestore, "smsTemp");
const paymentNotifications = collection(firestore, "notificacionesPago");
const normalizeCustomerId = value => String(value ?? "").trim().toLocaleLowerCase("es").replace(/[\s.-]/g, "");
const retiredRecords = collection(firestore, "retirados");
const tvRetirementRecords = collection(firestore, "retirosTv");
const verifiedBoxes = collection(firestore, "cajasVerificadas");
const boxNeighborhoods = collection(firestore, "barriosCajas");
const boxZones = collection(firestore, "zonasCajas");
const clients = collection(firestore, "clientes");
const clientProcesses = collection(firestore, "procesosClientes");
const chatDirectory = collection(firestore, "chatDirectorio");
const chatConversations = collection(firestore, "conversacionesChat");
const cleanBoxNumberValue = value => {
  const original = String(value ?? "").trim();
  const numeric = original.replace(/[^0-9-]/g, "");
  return numeric || original;
};
const normalizeBoxLocation = value => String(value ?? "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
const formatBoxLocation = value => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("es");
const boxLocationId = value => normalizeBoxLocation(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "sin-nombre";
function addBoxLocationToBatch(batch, collectionName, value) {
  const nombre = formatBoxLocation(value);
  if (!nombre) return;
  batch.set(doc(firestore, collectionName, boxLocationId(nombre)), {
    nombre,
    nombreNormalizado: normalizeBoxLocation(nombre),
    actualizadoEn: serverTimestamp()
  }, { merge: true });
}
const publicSupportConfig = doc(firestore, "configuracionPublica", "equipos");
const adjustmentZonesConfig = doc(firestore, "configuracionPublica", "zonasReajuste");
function usernameEmail(username) {
  const normalized = String(username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(normalized)) throw new Error("El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.");
  return `${normalized}@intercol-784d9.firebaseapp.com`;
}
async function saveAdvisorProfile(user, advisorName, username, recoveryEmail = "") {
  const profileRef = doc(firestore, "asesores", user.uid);
  const existing = await getDoc(profileRef);
  const isSyntheticEmail = String(user.email || "").toLowerCase().endsWith("@intercol-784d9.firebaseapp.com");
  const verifiedEmail = !isSyntheticEmail ? String(user.email || recoveryEmail || "").trim().toLowerCase() : "";
  if (!existing.exists()) {
    await setDoc(profileRef, { uid: user.uid, asesor: advisorName.trim() || user.displayName || username, usuario: username.trim().toLowerCase(), rol: "asesor", ...(verifiedEmail ? { email: verifiedEmail, correoRecuperacion: verifiedEmail } : {}), creadoEn: serverTimestamp() });
  } else if (verifiedEmail && (existing.data().email !== verifiedEmail || existing.data().correoRecuperacion !== verifiedEmail)) {
    // Firebase Auth applies the new address only after its verification link is opened.
    // Sync the profile on the next sign-in, when Auth reports the verified address.
    await setDoc(profileRef, { email: verifiedEmail, correoRecuperacion: verifiedEmail }, { merge: true });
  }
  try {
    const latest = await getDoc(profileRef);
    if (latest.exists()) await ensureChatAdvisorProfile(user.uid, latest.data());
  } catch (error) {
    // Chat access or its Firestore rules may not be published yet; sign-in must still work.
    console.warn("No se pudo sincronizar el directorio de asesores para Chat:", error);
  }
  if (verifiedEmail) await saveUsernameLoginAlias(username || existing.data()?.usuario, user, verifiedEmail);
}
function normalizeUsername(username) { return String(username || "").trim().toLowerCase(); }
function saveUsernameLoginAlias(username, user, email) {
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9._-]{3,30}$/.test(normalized) || !email) return Promise.resolve();
  return setDoc(doc(firestore, "loginAliases", normalized), { uid: user.uid, usuario: normalized, email: String(email).trim().toLowerCase(), actualizadoEn: serverTimestamp() }, { merge: true });
}
export async function registerAdvisor({ advisor, username, email, password }) {
  email = String(email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Ingresa un correo electrónico válido para recuperar tu cuenta.");
  const credential = auth.currentUser?.email === email
    ? { user: auth.currentUser }
    : await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: advisor.trim() });
  await saveAdvisorProfile(credential.user, advisor, username, email);
  return credential.user;
}
export async function signInAdvisor({ username, password }) {
  const identifier = String(username).trim();
  let loginEmail = identifier.toLowerCase();
  if (!identifier.includes("@")) {
    const normalized = normalizeUsername(identifier);
    const alias = await getDoc(doc(firestore, "loginAliases", normalized));
    loginEmail = alias.exists() ? String(alias.data().email || "").trim().toLowerCase() : usernameEmail(identifier);
  }
  const credential = await signInWithEmailAndPassword(auth, loginEmail, password);
  const profile = await getAdvisorProfile(credential.user.uid);
  const storedUsername = profile?.usuario || identifier;
  await saveAdvisorProfile(credential.user, credential.user.displayName || storedUsername, storedUsername, credential.user.email || "");
  return credential;
}
export function sendAdvisorPasswordReset(email) { const address = String(email || "").trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Escribe el correo real asociado a tu cuenta."); return sendPasswordResetEmail(auth, address); }
export async function setAdvisorRecoveryEmail(email) {
  const user = auth.currentUser; const address = String(email || "").trim().toLowerCase();
  if (!user) throw new Error("Inicia sesión para actualizar el correo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Escribe un correo electrónico válido.");
  if (user.email === address) {
    await setDoc(doc(firestore, "asesores", user.uid), { email: address, correoRecuperacion: address }, { merge: true });
    const profile = await getAdvisorProfile(user.uid);
    await saveUsernameLoginAlias(profile?.usuario, user, address);
    return { email: address, verificationRequired: false };
  }
  await verifyBeforeUpdateEmail(user, address);
  const profile = await getAdvisorProfile(user.uid);
  await saveUsernameLoginAlias(profile?.usuario, user, address);
  return { email: address, verificationRequired: true };
}
export async function changeAdvisorPassword({ currentPassword, newPassword }) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error("Inicia sesión nuevamente para cambiar la contraseña.");
  if (String(newPassword || "").length < 6) throw new Error("La contraseña nueva debe tener al menos 6 caracteres.");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
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
function chatDate(value) { return value?.toDate ? value.toDate() : value ? new Date(value) : null; }
function normalizeChatConversation(item) {
  const data = item.data();
  return { id: item.id, ...data, lastMessageAtMs: chatDate(data.lastMessageAt)?.getTime() || 0 };
}
function normalizeChatMessage(item) {
  const data = item.data();
  return { id: item.id, ...data, createdAtMs: chatDate(data.createdAt)?.getTime() || 0, readAtMs: chatDate(data.readAt)?.getTime() || 0 };
}
export async function ensureChatAdvisorProfile(uid, profile) {
  if (!uid || auth.currentUser?.uid !== uid || !profile) throw new Error("Inicia sesión como asesor para abrir el chat.");
  const name = String(profile.asesor || profile.usuario || auth.currentUser.displayName || "Asesor").trim().slice(0, 100);
  const username = String(profile.usuario || "").trim().slice(0, 40);
  const ref = doc(chatDirectory, uid);
  await setDoc(ref, { uid, nombre: name, usuario: username, online: true, lastSeenAt: serverTimestamp(), typingConversationId: "", typingUntil: null, updatedAt: serverTimestamp() }, { merge: true });
}
export async function seedChatDirectoryForExistingAdvisors() {
  const user = auth.currentUser;
  if (!user) return [];
  // Firestore rules decide whether this account can consult registered advisor profiles.
  // Privileged managers get the real profiles; other advisors fall back to the sanitized directory.
  const profiles = await listAdvisorProfiles();
  let existingSnapshot = { docs: [] };
  try { existingSnapshot = await getDocs(chatDirectory); } catch (error) { console.warn("No se pudo leer todavía el directorio compartido; se mostrarán los perfiles reales disponibles para esta cuenta:", error); }
  const known = new Set(existingSnapshot.docs.map(item => item.id));
  const missing = profiles.filter(profile => !known.has(profile.id));
  for (let start = 0; start < missing.length; start += 450) {
    const batch = writeBatch(firestore);
    missing.slice(start, start + 450).forEach(profile => {
      const name = String(profile.asesor || profile.usuario || "Asesor").trim().slice(0, 100);
      batch.set(doc(chatDirectory, profile.id), { uid: profile.id, nombre: name, usuario: String(profile.usuario || "").trim().slice(0, 40), online: false, lastSeenAt: serverTimestamp(), typingConversationId: "", typingUntil: null, updatedAt: serverTimestamp() });
    });
    try { await batch.commit(); }
    catch (error) { console.warn("No se pudieron sincronizar los perfiles con el directorio compartido. Publica firestore.rules para habilitar el chat entre asesores:", error); }
  }
  return profiles.map(profile => ({ uid: profile.id, id: profile.id, nombre: String(profile.asesor || profile.usuario || "Asesor"), usuario: String(profile.usuario || ""), online: false, lastSeenAt: null, typingConversationId: "", typingUntil: null }));
}
export function subscribeChatDirectory(onChange, onError) {
  return onSnapshot(chatDirectory, snapshot => onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), onError);
}
export function subscribeChatConversations(uid, onChange, onError) {
  return onSnapshot(query(chatConversations, where("participantUids", "array-contains", uid)), snapshot => onChange(snapshot.docs.map(normalizeChatConversation).sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs)), onError);
}
export function subscribeChatMessages(conversationId, onChange, onError) {
  return onSnapshot(query(collection(firestore, "conversacionesChat", conversationId, "mensajes"), orderBy("createdAt", "desc"), limit(150)), snapshot => onChange(snapshot.docs.map(normalizeChatMessage).reverse()), onError);
}
export function createChatConversationAndSend({ otherUid, senderUid, senderName, recipientName, text }) {
  const participantUids = [senderUid, otherUid].sort();
  const conversationId = participantUids.join("_");
  const conversationRef = doc(chatConversations, conversationId);
  const messageRef = doc(collection(conversationRef, "mensajes"));
  const cleanText = String(text || "").trim().slice(0, 4000);
  if (!cleanText || !otherUid || senderUid !== auth.currentUser?.uid) throw new Error("Escribe un mensaje válido.");
  const batch = writeBatch(firestore);
  batch.set(conversationRef, { participantUids, participantNames: { [senderUid]: senderName, [otherUid]: recipientName }, updatedAt: serverTimestamp(), lastMessageText: cleanText, lastMessageSenderUid: senderUid, lastMessageSenderName: senderName, lastMessageAt: serverTimestamp() }, { merge: true });
  batch.set(messageRef, { senderUid, senderName, recipientUid: otherUid, text: cleanText, createdAt: serverTimestamp(), readAt: null });
  return batch.commit();
}
export async function markChatConversationRead(conversationId, uid) {
  if (!conversationId || uid !== auth.currentUser?.uid) return;
  const conversationRef = doc(chatConversations, conversationId);
  const messageRef = collection(conversationRef, "mensajes");
  const unread = await getDocs(query(messageRef, where("recipientUid", "==", uid), where("readAt", "==", null), limit(450)));
  const batch = writeBatch(firestore);
  unread.docs.forEach(item => batch.update(item.ref, { readAt: serverTimestamp() }));
  batch.update(conversationRef, { [`lastReadAtByUid.${uid}`]: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
}
export function updateChatAdvisorPresence(uid, online = true) {
  if (uid !== auth.currentUser?.uid) return Promise.resolve();
  return updateDoc(doc(chatDirectory, uid), { online: Boolean(online), lastSeenAt: serverTimestamp(), ...(!online ? { typingConversationId: "", typingUntil: null } : {}), updatedAt: serverTimestamp() });
}
export function updateChatTyping(uid, conversationId = "") {
  if (uid !== auth.currentUser?.uid) return Promise.resolve();
  return updateDoc(doc(chatDirectory, uid), { typingConversationId: String(conversationId || ""), typingUntil: conversationId ? Timestamp.fromMillis(Date.now() + 7000) : null, lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export function subscribePaymentNotifications(uid, onChange, onError) { return onSnapshot(query(paymentNotifications, where("asesorUid", "==", uid)), snapshot => onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), onError); }
function pendingInvoiceExistsError() { const error = new Error("Ya hay una revisión pendiente para esta cédula. Verifícala antes de agregar otra."); error.code = "invoice-pending-exists"; return error; }
async function assertNoPendingInvoice(advisorUid, customerId, exceptId = "") {
  const normalizedId = normalizeCustomerId(customerId);
  if (!normalizedId) return;
  const snapshot = await getDocs(query(paymentNotifications, where("asesorUid", "==", advisorUid)));
  const duplicate = snapshot.docs.find(item => item.id !== exceptId
    && item.data().revisado !== true
    && normalizeCustomerId(item.data().cedula) === normalizedId);
  if (duplicate) throw pendingInvoiceExistsError();
}
export async function createPaymentNotification({ customerName, customerId, notificationDate, advisorUid, advisorName, paymentDay = null, processId = "" }) {
  await assertNoPendingInvoice(advisorUid, customerId);
  const data = { nombre: customerName, cedula: customerId, fechaNotificacion: notificationDate, ...(paymentDay ? { diaPago: paymentDay } : {}), ...(processId ? { processId: String(processId) } : {}), asesorUid: advisorUid, asesor: advisorName, revisado: false, revisadoEn: null, revisadoPor: null, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() };
  if (!processId) return addDoc(paymentNotifications, data);
  const id = `reconexion_${String(processId).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  await setDoc(doc(firestore, "notificacionesPago", id), data);
  return { id };
}
export function subscribeRetiredRecords(uid, onChange, onError) { return onSnapshot(query(retiredRecords, where("asesorUid", "==", uid)), snapshot => onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), onError); }
export function createRetiredRecord(data) { return addDoc(retiredRecords, { ...data, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }); }
export function updateRetiredRecord(id, data) { return updateDoc(doc(firestore, "retirados", id), { ...data, actualizadoEn: serverTimestamp() }); }
export function deleteRetiredRecord(id) { return deleteDoc(doc(firestore, "retirados", id)); }
export function subscribeTvRetirementRecords(uid, onChange, onError) { return onSnapshot(query(tvRetirementRecords, where("asesorCreadorUid", "==", uid)), snapshot => onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), onError); }
export function createTvRetirementRecord(data) { return addDoc(tvRetirementRecords, { ...data, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }); }
export function updateTvRetirementRecord(id, data) { return updateDoc(doc(firestore, "retirosTv", id), { ...data, actualizadoEn: serverTimestamp() }); }
export function deleteTvRetirementRecord(id) { return deleteDoc(doc(firestore, "retirosTv", id)); }
export async function updatePaymentNotification(id, { customerName, customerId, notificationDate }) {
  const existing = await getDoc(doc(firestore, "notificacionesPago", id));
  if (existing.exists() && existing.data().revisado !== true) await assertNoPendingInvoice(existing.data().asesorUid, customerId, id);
  return updateDoc(doc(firestore, "notificacionesPago", id), { nombre: customerName, cedula: customerId, fechaNotificacion: notificationDate, actualizadoEn: serverTimestamp() });
}
export async function setPaymentNotificationReviewed(id, reviewed, advisorName) {
  const recordRef = doc(firestore, "notificacionesPago", id);
  if (!reviewed) {
    const existing = await getDoc(recordRef);
    if (existing.exists()) await assertNoPendingInvoice(existing.data().asesorUid, existing.data().cedula, id);
  }
  return updateDoc(recordRef, { revisado: reviewed, revisadoEn: reviewed ? Timestamp.now() : null, revisadoPor: reviewed ? advisorName : null, actualizadoEn: serverTimestamp() });
}
export function deletePaymentNotification(id) { return deleteDoc(doc(firestore, "notificacionesPago", id)); }
function normalizeTemporaryMessage(snapshot) {
  const fields = snapshot.data(); const rawDate = fields.date ?? fields.expiresAt; const expiry = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate); const rawCreatedAt = fields.createdAt; const createdAt = rawCreatedAt?.toDate ? rawCreatedAt.toDate() : rawCreatedAt ? new Date(rawCreatedAt) : null; const text = fields.data ?? fields.text;
  if (typeof text !== "string" || !Number.isFinite(expiry.getTime())) return null;
  return { id: snapshot.id, title: String(fields.title ?? ""), text, advisor: String(fields.asesor ?? fields.advisor ?? ""), expiresAt: expiry.toISOString(), createdAt: createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : "" };
}
export function subscribeTemporaryMessages(onChange, onError) { return onSnapshot(temporaryMessages, snapshot => onChange(snapshot.docs.map(normalizeTemporaryMessage).filter(Boolean)), onError); }
export function createTemporaryMessage({ title, text, advisor, expiresAt }) { return addDoc(temporaryMessages, { title: String(title || ""), data: text, asesor: advisor, date: Timestamp.fromDate(new Date(expiresAt)), createdAt: serverTimestamp() }); }
export function updateTemporaryMessage(id, { title, text, advisor, expiresAt }) { return updateDoc(doc(firestore, "smsTemp", id), { title: String(title || ""), data: text, asesor: advisor, date: Timestamp.fromDate(new Date(expiresAt)), updatedAt: serverTimestamp() }); }
export function deleteTemporaryMessage(id) { return deleteDoc(doc(firestore, "smsTemp", id)); }
export async function createVerifiedBox(data) {
  // La ficha se arma dentro de un iframe. Reconstruye el arreglo y sus objetos
  // en el contexto principal para que Firestore no reciba arrays de otro realm.
  const cedulas = Array.from(data.cedulas || [], user => ({
    cedula: String(user.cedula ?? ""),
    puertoTecnico: Number(user.puertoTecnico),
    puertoReal: Number(user.puertoReal),
    comentario: String(user.comentario ?? ""),
    fondoNaranja: Boolean(user.fondoNaranja),
    accionPuerto: String(user.accionPuerto ?? ""),
    estadoServicio: String(user.estadoServicio ?? "active"),
    suspendidoDesde: String(user.suspendidoDesde ?? "")
  }));
  const record = {
    fecha: String(data.fecha ?? ""),
    tipoCaja: String(data.tipoCaja ?? ""),
    numeroCaja: cleanBoxNumberValue(data.numeroCaja),
    direccion: String(data.direccion ?? ""),
    barrio: formatBoxLocation(data.barrio),
    zona: formatBoxLocation(data.zona),
    notasVerificacion: String(data.notasVerificacion ?? "").trim(),
    ...(data.cajaOrigenId ? { cajaOrigenId: String(data.cajaOrigenId) } : {}),
    tecnico: String(data.tecnico ?? ""),
    asesor: String(data.asesor ?? ""),
    link: String(data.link ?? ""),
    asesorUid: String(data.asesorUid ?? ""),
    creadoPor: String(data.creadoPor ?? ""),
    usuarioRegistrado: String(data.usuarioRegistrado ?? ""),
    cedulas,
    creadoEn: serverTimestamp()
  };
  // Older published Firestore rules only allow the original verification
  // fields on create. Create that compatible base record first, then enrich it
  // with fields introduced later (box type/location/notes) as a best-effort
  // update. This keeps an outdated create allowlist from blocking the record.
  const boxRef = doc(verifiedBoxes);
  const {
    tipoCaja,
    barrio,
    zona,
    notasVerificacion,
    cajaOrigenId,
    ...baseRecord
  } = record;
  await setDoc(boxRef, baseRecord);

  const enrichment = {
    tipoCaja,
    barrio,
    zona,
    ...(notasVerificacion ? { notasVerificacion } : {}),
    ...(cajaOrigenId ? { cajaOrigenId } : {})
  };
  const detailsSync = updateDoc(boxRef, enrichment).then(() => true).catch(error => {
    console.warn("La caja se guardó, pero faltó sincronizar tipo, barrio, zona o comentario. Publica las reglas actualizadas de Firestore:", error);
    return false;
  });

  const catalog = writeBatch(firestore);
  addBoxLocationToBatch(catalog, "barriosCajas", record.barrio);
  addBoxLocationToBatch(catalog, "zonasCajas", record.zona);
  const locationCatalogSync = catalog.commit().then(() => true).catch(error => {
    console.warn("La verificación se guardó, pero no se pudieron actualizar los catálogos de barrio/zona:", error);
    return false;
  });
  return { id: boxRef.id, saved: true, detailsSync, locationCatalogSync };
}
export function updateVerifiedBox(id, data) {
  const cedulas = Array.from(data.cedulas || [], user => ({
    cedula: String(user.cedula ?? ""),
    puertoTecnico: Number(user.puertoTecnico),
    puertoReal: Number(user.puertoReal),
    comentario: String(user.comentario ?? ""),
    fondoNaranja: Boolean(user.fondoNaranja),
    accionPuerto: String(user.accionPuerto ?? ""),
    estadoServicio: String(user.estadoServicio ?? "active"),
    suspendidoDesde: String(user.suspendidoDesde ?? "")
  }));
  const record = {
    fecha: String(data.fecha ?? ""),
    tipoCaja: String(data.tipoCaja ?? ""),
    numeroCaja: cleanBoxNumberValue(data.numeroCaja),
    direccion: String(data.direccion ?? ""),
    barrio: formatBoxLocation(data.barrio),
    zona: formatBoxLocation(data.zona),
    notasVerificacion: String(data.notasVerificacion ?? "").trim(),
    tecnico: String(data.tecnico ?? ""),
    asesor: String(data.asesor ?? ""),
    link: String(data.link ?? ""),
    cedulas,
    actualizadoEn: serverTimestamp()
  };
  return updateDoc(doc(firestore, "cajasVerificadas", id), record).then(async () => {
    // Save the box first: missing catalog permissions must not discard its edits.
    const catalog = writeBatch(firestore);
    addBoxLocationToBatch(catalog, "barriosCajas", record.barrio);
    addBoxLocationToBatch(catalog, "zonasCajas", record.zona);
    try {
      await catalog.commit();
      return { locationCatalogSaved: true };
    } catch (error) {
      console.warn("La caja se guardó, pero no se pudieron actualizar los catálogos de barrio/zona:", error);
      return { locationCatalogSaved: false, locationCatalogErrorCode: error?.code || "unknown" };
    }
  });
}
export function updateVerifiedBoxPorts(id, users) {
  const cedulas = Array.from(users || [], user => ({
    cedula: String(user.cedula ?? ""),
    puertoTecnico: Number(user.puertoTecnico),
    puertoReal: Number(user.puertoReal),
    comentario: String(user.comentario ?? ""),
    fondoNaranja: Boolean(user.fondoNaranja),
    accionPuerto: String(user.accionPuerto ?? ""),
    estadoServicio: String(user.estadoServicio ?? "active"),
    suspendidoDesde: String(user.suspendidoDesde ?? "")
  }));
  return updateDoc(doc(firestore, "cajasVerificadas", id), { cedulas, actualizadoEn: serverTimestamp() });
}
export function deleteVerifiedBox(id) { return deleteDoc(doc(firestore, "cajasVerificadas", id)); }
export function subscribeVerifiedBoxes(onChange, onError) { return onSnapshot(verifiedBoxes, snapshot => onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), onError); }
export function subscribeBoxLocationOptions(kind, onChange, onError) {
  const source = kind === "barrio" ? boxNeighborhoods : kind === "zona" ? boxZones : null;
  if (!source) throw new Error("Catálogo de ubicación desconocido.");
  return onSnapshot(source, snapshot => {
    const values = new Map();
    snapshot.docs.forEach(item => {
      const name = formatBoxLocation(item.data().nombre);
      const key = normalizeBoxLocation(name);
      if (name && !values.has(key)) values.set(key, name);
    });
    onChange([...values.values()].sort((a, b) => a.localeCompare(b, "es")));
  }, onError);
}
export function findClientByCedula(value) {
  const normalized = normalizeCustomerId(value);
  if (!normalized) return Promise.resolve(null);
  return getDocs(query(clients, where("cedulaNormalizada", "==", normalized))).then(snapshot => {
    const item = snapshot.docs[0];
    return item ? { id: item.id, ...item.data() } : null;
  });
}
export function createClient({ nombre, cedula, user }) {
  const cleanName = String(nombre || "").trim();
  const cleanId = String(cedula || "").trim();
  if (!cleanName || !cleanId) return Promise.reject(new Error("Escribe el nombre y la cédula del cliente."));
  return addDoc(clients, { nombre: cleanName, cedula: cleanId, cedulaNormalizada: normalizeCustomerId(cleanId), plan: null, valorMensual: null, valorReconexion: null, diaPago: null, diaCorte: null, fechaPago: null, fechaCorte: null, fechaGeneracionFactura: null, zona: null, creadoPorUid: user?.uid || "", creadoPorNombre: String(user?.nombre || ""), creadoEn: Timestamp.now(), actualizadoEn: serverTimestamp() });
}
export function subscribeClients(onChange, onError) { return onSnapshot(clients, snapshot => onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), onError); }
function cleanClientProfile(data = {}) {
  const cleanDay = value => {
    if (value === "" || value === null || value === undefined) return null;
    const day = Number(value);
    return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
  };
  const profile = {};
  if (Object.hasOwn(data, "estadoCliente")) profile.estadoCliente = ["sin_registrar", "activo", "suspendido", "retirado", "cancelado"].includes(String(data.estadoCliente || "")) ? String(data.estadoCliente) : "sin_registrar";
  if (Object.hasOwn(data, "plan")) profile.plan = String(data.plan || "").trim() || null;
  if (Object.hasOwn(data, "valorMensual")) {
    const monthly = data.valorMensual === "" || data.valorMensual === null || data.valorMensual === undefined ? null : Number(data.valorMensual);
    profile.valorMensual = Number.isFinite(monthly) && monthly >= 0 ? monthly : null;
  }
  if (Object.hasOwn(data, "valorReconexion")) {
    const reconnectFee = data.valorReconexion === "" || data.valorReconexion === null || data.valorReconexion === undefined ? null : Number(data.valorReconexion);
    profile.valorReconexion = [15000, 20000].includes(reconnectFee) ? reconnectFee : null;
  }
  if (Object.hasOwn(data, "diaPago")) profile.diaPago = cleanDay(data.diaPago);
  if (Object.hasOwn(data, "diaCorte")) profile.diaCorte = cleanDay(data.diaCorte);
  for (const key of ["fechaPago", "fechaCorte", "fechaGeneracionFactura"]) if (Object.hasOwn(data, key)) { const value = String(data[key] || "").trim(); profile[key] = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; }
  if (Object.hasOwn(data, "zona")) profile.zona = String(data.zona || "").trim() || null;
  return profile;
}
export function updateClientProfile(id, profile) {
  return updateDoc(doc(firestore, "clientes", id), { ...cleanClientProfile(profile), actualizadoEn: serverTimestamp() });
}
export function subscribeClientProcesses(onChange, onError) {
  const uid = auth.currentUser?.uid;
  if (!uid) return onSnapshot(query(clientProcesses, where("tipo", "!=", "abono")), snapshot => onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), onError);
  const snapshots = new Map();
  const subscriptions = [
    ["general", query(clientProcesses, where("tipo", "!=", "abono"))],
    ["ownProcesses", query(clientProcesses, where("iniciadoPorUid", "==", uid))],
    ["completedProcesses", query(clientProcesses, where("estado", "==", "completado"))]
  ];
  const ready = new Set();
  const emit = () => {
    if (ready.size < subscriptions.length) return;
    const merged = new Map();
    snapshots.forEach(items => items.forEach(item => merged.set(item.id, item)));
    onChange([...merged.values()]);
  };
  const unsubscribers = subscriptions.map(([key, source]) => onSnapshot(source, snapshot => {
    snapshots.set(key, snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    ready.add(key);
    emit();
  }, onError));
  return () => unsubscribers.forEach(unsubscribe => unsubscribe());
}
export function createClientProcess({ client, type, user, reconexionClienteCancelado = false }) {
  const stepsByType = {
    reconexion: ["Actualiza cuánto se le cobra a este cliente por la reconexión", "¿Generaste o ajustaste la factura?", "¿Cambiaste la fecha de pago?", "¿Hiciste la anotación?"],
    abono: ["Genera la factura de abono con comisión", "Registra la promesa de pago y espera hasta la fecha acordada", "Confirma si el cliente pagó la factura de abono", "Haz la anotación del abono", "Aplica el descuento a la factura correspondiente"],
    "cambio-fecha-pago": ["Confirmar cliente y fecha de pago actual", "Acordar la nueva fecha de pago", "Actualizar la fecha en la plataforma", "Confirmar el cambio con el cliente"],
    "cambio-plan": ["Confirmar cliente y plan actual", "Acordar el nuevo plan", "Actualizar el plan en la plataforma", "Confirmar el cambio con el cliente"]
  };
  const initialInformation = {
    ...(type === "reconexion" ? { reconexionClienteCancelado: reconexionClienteCancelado === true } : {}),
    ...(type === "cambio-plan" ? { planAnterior: String(client.plan || ""), valorMensualAnterior: client.valorMensual ?? null } : {}),
    ...(type === "cambio-fecha-pago" || type === "reconexion" ? { diaPagoAnterior: client.diaPago ?? null, fechaPagoAnterior: String(client.fechaPago || "") } : {})
  };
  return addDoc(clientProcesses, { clienteId: client.id, clienteNombre: String(client.nombre || ""), clienteCedula: String(client.cedula || ""), tipo: String(type || ""), estado: "en_curso", informacion: initialInformation, pasos: stepsByType[type] || [], pasosVerificados: [], iniciadoPorUid: user?.uid || "", iniciadoPorNombre: String(user?.nombre || ""), iniciadoEn: Timestamp.now(), actualizadoEn: serverTimestamp() });
}
function cleanProcessInformationValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return undefined;
  if (typeof value === "bigint") return String(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) return Array.from(value, item => cleanProcessInformationValue(item, seen)).map(item => item === undefined ? null : item);
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([key, item]) => [String(key), cleanProcessInformationValue(item, seen)]).filter(([, item]) => item !== undefined));
  if (value instanceof Set) return [...value].map(item => cleanProcessInformationValue(item, seen)).filter(item => item !== undefined);
  const entries = Object.entries(value).map(([key, item]) => [key, cleanProcessInformationValue(item, seen)]).filter(([, item]) => item !== undefined);
  if (!entries.length && Object.keys(value).length === 0 && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return String(value);
  return Object.fromEntries(entries);
}
function cleanProcessInformation(value) {
  const cleaned = cleanProcessInformationValue(value);
  return cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) ? cleaned : {};
}
export function updateClientProcess(id, { informacion, pasos, pasosVerificados, estado, completadoEn } = {}) {
  const changes = { actualizadoEn: serverTimestamp() };
  if (informacion !== undefined) changes.informacion = cleanProcessInformation(informacion);
  if (pasos !== undefined) changes.pasos = Array.from(pasos || [], step => String(step));
  if (pasosVerificados !== undefined) changes.pasosVerificados = Array.from(pasosVerificados || [], step => Number(step));
  if (estado !== undefined) {
    changes.estado = estado;
    if (estado === "completado") changes.completadoEn = serverTimestamp();
    if (estado === "en_curso") changes.completadoEn = null;
  }
  if (completadoEn !== undefined) changes.completadoEn = completadoEn;
  return updateDoc(doc(firestore, "procesosClientes", id), changes);
}
export function completeClientProfileStep({ clientId, processId, profile, informacion, pasos, pasosVerificados, estado }) {
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "clientes", clientId), { ...cleanClientProfile(profile), actualizadoEn: serverTimestamp() });
  batch.update(doc(firestore, "procesosClientes", processId), {
    informacion: cleanProcessInformation(informacion),
    pasos: Array.from(pasos || [], step => String(step)),
    pasosVerificados: Array.from(pasosVerificados || [], step => Number(step)),
    estado,
    ...(estado === "completado" ? { completadoEn: serverTimestamp() } : { completadoEn: null }),
    actualizadoEn: serverTimestamp()
  });
  return batch.commit();
}
export function deleteClientProcess(id) { return deleteDoc(doc(firestore, "procesosClientes", id)); }
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
export function subscribeAdjustmentZones(onChange, onError) { return onSnapshot(adjustmentZonesConfig, snapshot => onChange(snapshot.exists() ? snapshot.data().zonas || [] : []), onError); }
export function saveAdjustmentZones(zones) {
  const cleanZones = Array.from(zones || [], zone => ({ nombre: String(zone.nombre || "").trim(), valor: Number(zone.valor) }))
    .filter(zone => zone.nombre && Number.isFinite(zone.valor) && zone.valor > 0);
  return setDoc(adjustmentZonesConfig, { zonas: cleanZones, actualizadoEn: serverTimestamp() });
}
window.INTERCOL_FIREBASE = { app: firebaseApp, db: firestore, auth, observeAuth, getAdvisorProfile, listAdvisorProfiles, getAdvisorSectionPermissions, listAdvisorSectionPermissions, saveAdvisorSectionPermissions, getAdvisorRolePermissions, listAdvisorRoles, ensureAdvisorRole, deleteAdvisorRole, saveAdvisorRole, assignAdvisorRole, registerAdvisor, signInAdvisor, sendAdvisorPasswordReset, setAdvisorRecoveryEmail, changeAdvisorPassword, signOutAdvisor, subscribeChatDirectory, subscribeChatConversations, subscribeChatMessages, ensureChatAdvisorProfile, seedChatDirectoryForExistingAdvisors, createChatConversationAndSend, markChatConversationRead, updateChatAdvisorPresence, updateChatTyping, subscribeTemporaryMessages, createTemporaryMessage, updateTemporaryMessage, deleteTemporaryMessage, subscribePaymentNotifications, createPaymentNotification, updatePaymentNotification, setPaymentNotificationReviewed, deletePaymentNotification, subscribeRetiredRecords, createRetiredRecord, updateRetiredRecord, deleteRetiredRecord, subscribeTvRetirementRecords, createTvRetirementRecord, updateTvRetirementRecord, deleteTvRetirementRecord, createVerifiedBox, updateVerifiedBox, updateVerifiedBoxPorts, deleteVerifiedBox, subscribeVerifiedBoxes, subscribeBoxLocationOptions, findClientByCedula, createClient, subscribeClients, updateClientProfile, subscribeClientProcesses, createClientProcess, updateClientProcess, completeClientProfileStep, deleteClientProcess, subscribePublicSupportConfig, savePublicSupportConfig, subscribeAdjustmentZones, saveAdjustmentZones };
window.dispatchEvent(new Event("intercol-firebase-ready"));

