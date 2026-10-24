const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID = "intercol-784d9";
const ADMIN_UID = "INJQ1NtkRwRbxfLN2XCwF22flyu2";
const ADMIN_EMAILS = new Set(["jeblaje@gmail.com", "jeblaje@intercol-784d9.firebaseapp.com"]);
const PORT = Number(process.env.INTERCOL_ADMIN_PORT || 8765);
const ROOT = path.resolve(__dirname, "..");
const allowedOrigins = new Set(["http://localhost:8000", "http://127.0.0.1:8000"]);

function initialize() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) throw new Error("Define GOOGLE_APPLICATION_CREDENTIALS con el JSON privado de la cuenta de servicio.");
  const resolved = path.resolve(keyPath);
  const relative = path.relative(ROOT, resolved);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Guarda el JSON privado fuera de la carpeta del proyecto.");
  const key = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (key.project_id !== PROJECT_ID) throw new Error(`El JSON no pertenece al proyecto ${PROJECT_ID}.`);
  initializeApp({ credential: cert(key), projectId: PROJECT_ID });
  return { auth: getAuth(), db: getFirestore() };
}

function send(res, status, body, origin) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin || "null",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 16_384) { reject(new Error("La solicitud es demasiado grande.")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("El contenido enviado no es JSON válido.")); }
    });
    req.on("error", reject);
  });
}

async function main() {
  const { auth, db } = initialize();
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || "";
    if (origin && !allowedOrigins.has(origin)) return send(res, 403, { error: "Origen no permitido." }, "null");
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "300", Vary: "Origin" });
      return res.end();
    }
    if (req.method === "GET" && req.url === "/api/health") return send(res, 200, { ready: true }, origin);
    if (req.method !== "POST" || !["/api/accounts/list", "/api/accounts/update"].includes(req.url)) return send(res, 404, { error: "Ruta no encontrada." }, origin);
    try {
      if (!origin || !allowedOrigins.has(origin)) return send(res, 403, { error: "Abre el panel desde localhost:8000 para usar la administración local." }, origin);
      const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
      if (!match) return send(res, 401, { error: "Inicia sesión en el panel de administración." }, origin);
      const decoded = await auth.verifyIdToken(match[1]);
      const email = String(decoded.email || "").toLowerCase();
      if (decoded.uid !== ADMIN_UID && !ADMIN_EMAILS.has(email)) return send(res, 403, { error: "Solo la cuenta administradora puede modificar credenciales." }, origin);
      const body = await readJson(req);
      if (req.url === "/api/accounts/list") {
        const uids = Array.isArray(body.uids) ? [...new Set(body.uids.filter(uid => typeof uid === "string" && uid.length > 0 && uid.length <= 128))].slice(0, 1000) : [];
        const accounts = await Promise.all(uids.map(async uid => {
          try { const user = await auth.getUser(uid); return { uid, email: user.email || "", emailVerified: Boolean(user.emailVerified) }; }
          catch (error) { if (error.code === "auth/user-not-found") return { uid, email: "", emailVerified: false }; throw error; }
        }));
        return send(res, 200, { accounts }, origin);
      }
      const uid = typeof body.uid === "string" ? body.uid.trim() : "";
      const newEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!uid || uid.length > 128) return send(res, 400, { error: "Selecciona una cuenta válida." }, origin);
      if (!newEmail && !password) return send(res, 400, { error: "Indica un correo nuevo, una contraseña nueva o ambos." }, origin);
      if (newEmail && (newEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))) return send(res, 400, { error: "Escribe un correo electrónico válido." }, origin);
      if (password && (password.length < 6 || password.length > 4096)) return send(res, 400, { error: "La contraseña debe tener al menos 6 caracteres." }, origin);
      const existing = await auth.getUser(uid);
      const emailChanged = Boolean(newEmail && newEmail !== String(existing.email || "").toLowerCase());
      const updates = { ...(password ? { password } : {}), ...(emailChanged ? { email: newEmail, emailVerified: false } : {}) };
      if (!Object.keys(updates).length) return send(res, 400, { error: "No hay cambios para guardar." }, origin);
      const updated = await auth.updateUser(uid, updates);
      if (emailChanged) {
        const profileRef = db.collection("asesores").doc(uid);
        const profileSnapshot = await profileRef.get();
        const username = String(profileSnapshot.data()?.usuario || "").trim().toLowerCase();
        const batch = db.batch();
        batch.set(profileRef, { email: newEmail, correoRecuperacion: newEmail, correoActualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
        if (/^[a-z0-9._-]{3,30}$/.test(username)) batch.set(db.collection("loginAliases").doc(username), { uid, usuario: username, email: newEmail, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
        await batch.commit();
      }
      return send(res, 200, { uid, email: updated.email || "", emailVerified: Boolean(updated.emailVerified), passwordUpdated: Boolean(password) }, origin);
    } catch (error) {
      const status = error.code === "auth/id-token-expired" || error.code === "auth/argument-error" ? 401 : error.code === "auth/email-already-exists" ? 409 : 400;
      console.error("Error en administración local:", error.message || error);
      return send(res, status, { error: error.message || "No se pudo completar la solicitud." }, origin);
    }
  });
  server.listen(PORT, "127.0.0.1", () => console.log(`Servicio privado de administración listo en http://127.0.0.1:${PORT}. Mantén esta ventana abierta mientras usas el panel local.`));
}

main().catch(error => { console.error(`No se pudo iniciar la administración local: ${error.message || error}`); process.exitCode = 1; });
