// Configuración e inicialización de Firebase para INTERCOL.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDK0tK8yptJYD8R6f0VkoiyW2Lekl9KKAQ",
  authDomain: "intercol-784d9.firebaseapp.com",
  projectId: "intercol-784d9",
  storageBucket: "intercol-784d9.firebasestorage.app",
  messagingSenderId: "380146455867",
  appId: "1:380146455867:web:2d3b17e736f16ce88a931e"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);
const temporaryMessages = collection(firestore, "smsTemp");

function normalizeTemporaryMessage(documentSnapshot) {
  const fields = documentSnapshot.data();
  const rawDate = fields.date ?? fields.expiresAt;
  const expiry = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
  const text = fields.data ?? fields.text;
  if (typeof text !== "string" || !Number.isFinite(expiry.getTime())) return null;
  return {
    id: documentSnapshot.id,
    text,
    advisor: String(fields.asesor ?? fields.advisor ?? ""),
    expiresAt: expiry.toISOString()
  };
}

export function subscribeTemporaryMessages(onChange, onError) {
  return onSnapshot(temporaryMessages, snapshot => {
    onChange(snapshot.docs.map(normalizeTemporaryMessage).filter(Boolean));
  }, onError);
}

export function createTemporaryMessage({ text, advisor, expiresAt }) {
  return addDoc(temporaryMessages, {
    data: text,
    asesor: advisor,
    date: Timestamp.fromDate(new Date(expiresAt)),
    createdAt: serverTimestamp()
  });
}

export function updateTemporaryMessage(id, { text, advisor, expiresAt }) {
  return updateDoc(doc(firestore, "smsTemp", id), {
    data: text,
    asesor: advisor,
    date: Timestamp.fromDate(new Date(expiresAt)),
    updatedAt: serverTimestamp()
  });
}

export function deleteTemporaryMessage(id) {
  return deleteDoc(doc(firestore, "smsTemp", id));
}

window.INTERCOL_FIREBASE = {
  app: firebaseApp,
  db: firestore,
  subscribeTemporaryMessages,
  createTemporaryMessage,
  updateTemporaryMessage,
  deleteTemporaryMessage
};
window.dispatchEvent(new Event("intercol-firebase-ready"));
