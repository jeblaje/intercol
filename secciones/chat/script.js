const $ = selector => document.querySelector(selector);
const list = $("#contactList");
const messagesEl = $("#messageArea");
const searchInput = $("#advisorSearch");
const messageInput = $("#messageInput");
const chatForm = $("#messageForm");
const dayFormat = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });
let fb = null, currentUser = null, currentProfile = null;
let directory = [], fallbackDirectory = [], directoryError = "", profileLoadError = "", conversations = [], activeContact = null, activeConversationId = "", activeMessages = [];
let activeTab = "advisors", unsubscribeDirectory = null, unsubscribeConversations = null, unsubscribeMessages = null;
let typingStopTimer = 0, presenceHeartbeat = 0, noticeTimer = 0;
let lastTypingWrite = 0, destroyed = false, messageSubscriptionId = "";

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function initials(name) { return String(name || "?").trim().split(/\s+/).slice(0, 2).map(word => word[0] || "").join("").toUpperCase(); }
function colorClass(uid = "") { let sum = 0; for (const char of uid) sum = (sum * 31 + char.charCodeAt(0)) | 0; return `color-${Math.abs(sum) % 5}`; }
function online(advisor) { const seen = advisor?.lastSeenAt?.toDate ? advisor.lastSeenAt.toDate().getTime() : 0; return Boolean(advisor?.online && Date.now() - seen < 90000); }
function getAdvisor(uid) { return directory.find(advisor => advisor.uid === uid || advisor.id === uid) || null; }
function getConversation(contact = activeContact) {
  if (!contact || !currentUser) return null;
  const id = [currentUser.uid, contact.uid].sort().join("_");
  return conversations.find(item => item.id === id) || null;
}
function millis(value) { return value?.toDate ? value.toDate().getTime() : 0; }
function isUnread(conversation) {
  if (!conversation || conversation.lastMessageSenderUid === currentUser?.uid) return false;
  const readAt = millis(conversation.lastReadAtByUid?.[currentUser?.uid]);
  return (conversation.lastMessageAtMs || 0) > readAt;
}
function unreadCount(conversation) {
  const contact = getAdvisor(conversation.participantUids?.find(uid => uid !== currentUser?.uid));
  if (!contact) return 0;
  return isUnread(conversation) ? 1 : 0;
}
function formatLastMessage(conversation) {
  if (!conversation?.lastMessageText) return "Iniciar conversación";
  const prefix = conversation.lastMessageSenderUid === currentUser.uid ? "Tú: " : "";
  return `${prefix}${conversation.lastMessageText}`;
}
function showNotice(message, error = true) {
  const notice = $("#chatNotice");
  notice.textContent = message;
  notice.classList.toggle("visible", Boolean(message));
  notice.style.background = error ? "" : "#15372f";
  notice.style.color = error ? "" : "#9aefc2";
  window.clearTimeout(noticeTimer);
  if (message) noticeTimer = window.setTimeout(() => notice.classList.remove("visible"), error ? 6500 : 2200);
}
function renderContactList() {
  if (!currentUser) return;
  const queryText = searchInput.value.trim().toLocaleLowerCase("es");
  const advisors = directory.filter(person => person.uid !== currentUser.uid
    && (!queryText || `${person.nombre} ${person.usuario}`.toLocaleLowerCase("es").includes(queryText)));
  let items = [];
  if (activeTab === "personal") {
    items = conversations.map(conversation => {
      const uid = conversation.participantUids?.find(participant => participant !== currentUser.uid);
      const person = getAdvisor(uid);
      return person ? { person, conversation } : null;
    }).filter(Boolean).filter(item => !queryText || `${item.person.nombre} ${item.person.usuario}`.toLocaleLowerCase("es").includes(queryText));
    $("#chatCount").textContent = String(items.length);
  } else {
    items = advisors.map(person => ({ person, conversation: getConversation(person) }));
    $("#chatCount").textContent = String(items.length);
  }
  $("#listHeading").textContent = activeTab === "personal" ? "Chats personales" : "Asesores registrados";
  if (!items.length) {
    const loadError = directoryError || profileLoadError;
    const emptyText = loadError && activeTab === "advisors"
      ? loadError
      : activeTab === "personal" ? (queryText ? "No encontramos chats con ese nombre." : "Aún no tienes conversaciones. Busca un asesor para iniciar una.") : "No encontramos asesores registrados con ese nombre.";
    list.innerHTML = `<div class="list-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  list.innerHTML = items.map(({ person, conversation }) => {
    const isActive = activeContact?.uid === person.uid;
    const badge = conversation && unreadCount(conversation) ? `<span class="unread-badge">1</span>` : "";
    const preview = conversation ? formatLastMessage(conversation) : (online(person) ? "En línea" : "Asesor registrado");
    const time = conversation?.lastMessageAtMs ? `<time>${timeFormat.format(new Date(conversation.lastMessageAtMs))}</time>` : "";
    return `<button class="contact-row ${isActive ? "active" : ""}" type="button" data-advisor-uid="${escapeHtml(person.uid)}"><span class="avatar ${colorClass(person.uid)} ${online(person) ? "online" : ""}">${escapeHtml(initials(person.nombre))}</span><span class="contact-copy"><strong>${escapeHtml(person.nombre || "Asesor")}</strong><span>${escapeHtml(preview)}</span></span><span class="contact-meta">${time}${badge}</span></button>`;
  }).join("");
  list.querySelectorAll("[data-advisor-uid]").forEach(button => button.addEventListener("click", () => selectContact(getAdvisor(button.dataset.advisorUid))));
}
function setActiveTab(tab) {
  activeTab = tab;
  $("#personalTab").classList.toggle("active", tab === "personal");
  $("#advisorsTab").classList.toggle("active", tab === "advisors");
  $("#personalTab").setAttribute("aria-selected", String(tab === "personal"));
  $("#advisorsTab").setAttribute("aria-selected", String(tab === "advisors"));
  renderContactList();
}
function setProfile(contact) {
  const name = contact?.nombre || "Chat de asesores";
  $("#activeName").textContent = name;
  $("#activeAvatar").textContent = initials(name);
  $("#activeAvatar").className = `avatar ${colorClass(contact?.uid || "")}${online(contact) ? " online" : ""}`;
  $("#activePresence").textContent = contact ? (online(contact) ? "En línea" : "Asesor") : "Selecciona un asesor para conversar";
  $("#profileName").textContent = contact ? name : "Perfil del asesor";
  $("#profileAvatar").textContent = contact ? initials(name) : "◉";
  $("#profileAvatar").className = `avatar profile-avatar ${colorClass(contact?.uid || "")}${online(contact) ? " online" : ""}`;
  $("#profileRole").textContent = contact ? "Asesor · INTERCOL" : "INTERCOL";
  $("#profileUsername").textContent = contact?.usuario ? `@${contact.usuario}` : "—";
  $("#profileStatus").textContent = contact ? (online(contact) ? "En línea" : "Desconectado") : "—";
  $("#profileStatus").classList.toggle("online-text", online(contact));
}
function watchMessages(conversationId) {
  if (messageSubscriptionId === conversationId) return;
  unsubscribeMessages?.();
  unsubscribeMessages = null;
  messageSubscriptionId = conversationId;
  unsubscribeMessages = fb.subscribeChatMessages(conversationId, items => {
    if (activeConversationId !== conversationId) return;
    activeMessages = items;
    renderMessages();
    if (items.some(message => message.recipientUid === currentUser.uid && !message.readAtMs)) {
      fb.markChatConversationRead(conversationId, currentUser.uid).catch(error => console.warn("No se pudo registrar la lectura del chat:", error));
    }
  }, error => showNotice(error?.code === "permission-denied" ? "No tienes permiso para consultar esta conversación. Revisa las reglas de Firestore." : "No se pudieron cargar los mensajes."));
}
function selectContact(contact) {
  if (!contact || !currentUser || contact.uid === currentUser.uid) return;
  if (unsubscribeMessages) unsubscribeMessages();
  unsubscribeMessages = null;
  messageSubscriptionId = "";
  activeContact = contact;
  activeConversationId = [currentUser.uid, contact.uid].sort().join("_");
  activeMessages = [];
  setProfile(contact);
  messageInput.disabled = false;
  messageInput.placeholder = `Escribe un mensaje para ${contact.nombre || "el asesor"}...`;
  chatForm.querySelector(".send-button").disabled = !messageInput.value.trim();
  $("#typingStatus").hidden = true;
  messagesEl.innerHTML = `<div class="message-day"><span>CONVERSACIÓN</span></div><div class="list-empty">Cargando mensajes…</div>`;
  renderContactList();
  if (getConversation(contact)) watchMessages(activeConversationId);
  else renderMessages();
  fb.updateChatTyping(currentUser.uid, "").catch(() => {});
  if (window.innerWidth <= 1000) $("#profileSidebar").classList.remove("open");
}
function renderMessages() {
  const oldScroll = messagesEl.scrollTop;
  const wasNearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
  if (!activeContact) return;
  if (!activeMessages.length) {
    messagesEl.innerHTML = `<div class="welcome-state"><div class="welcome-icon">${escapeHtml(initials(activeContact.nombre))}</div><h2>Conversación con ${escapeHtml(activeContact.nombre)}</h2><p>Este es el inicio de tu chat. Escribe el primer mensaje.</p></div>`;
    return;
  }
  let lastDate = "";
  messagesEl.innerHTML = activeMessages.map(message => {
    const mine = message.senderUid === currentUser.uid;
    const timestamp = message.createdAtMs ? new Date(message.createdAtMs) : new Date();
    const dateKey = timestamp.toDateString();
    let day = "";
    if (lastDate !== dateKey) { lastDate = dateKey; day = `<div class="message-day"><span>${dayFormat.format(timestamp)}</span></div>`; }
    const sender = mine ? currentProfile?.asesor || currentProfile?.usuario || "Tú" : activeContact.nombre;
    const status = mine ? `<span class="read-status">${message.readAtMs ? "✓✓ Visto" : "✓ Enviado"}</span>` : "";
    return `${day}<article class="message-row ${mine ? "mine" : ""}"><span class="avatar ${colorClass(message.senderUid)}">${escapeHtml(initials(sender))}</span><div class="message-content">${mine ? "" : `<div class="message-sender">${escapeHtml(sender)}</div>`}<div class="message-bubble">${escapeHtml(message.text)}</div><div class="message-footer"><time>${timeFormat.format(timestamp)}</time>${status}</div></div></article>`;
  }).join("");
  if (wasNearBottom || oldScroll === 0) messagesEl.scrollTop = messagesEl.scrollHeight;
}
function renderTypingStatus() {
  const other = activeContact && getAdvisor(activeContact.uid);
  const isTyping = Boolean(other?.typingConversationId === activeConversationId && other?.typingUntil?.toDate?.().getTime() > Date.now());
  $("#typingStatus").hidden = !isTyping;
  $("#typingText").textContent = `${other?.nombre || activeContact?.nombre || "El asesor"} está escribiendo`;
}
function renderAll() {
  renderContactList();
  if (activeContact) {
    const updated = getAdvisor(activeContact.uid);
    if (updated) { activeContact = updated; setProfile(updated); }
    renderTypingStatus();
  }
}
function onTyping() {
  if (!activeContact || !currentUser) return;
  const text = messageInput.value.trim();
  chatForm.querySelector(".send-button").disabled = !text;
  if (!text) { window.clearTimeout(typingStopTimer); fb.updateChatTyping(currentUser.uid, "").catch(() => {}); return; }
  if (Date.now() - lastTypingWrite > 3000) {
    lastTypingWrite = Date.now();
    fb.updateChatTyping(currentUser.uid, activeConversationId).catch(() => {});
  }
  window.clearTimeout(typingStopTimer);
  typingStopTimer = window.setTimeout(() => fb.updateChatTyping(currentUser.uid, "").catch(() => {}), 1800);
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 100)}px`;
}
async function sendMessage(event) {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeContact || !currentUser) return;
  const send = chatForm.querySelector(".send-button");
  send.disabled = true;
  try {
    await fb.createChatConversationAndSend({ otherUid: activeContact.uid, senderUid: currentUser.uid, senderName: currentProfile.asesor || currentProfile.usuario || "Asesor", recipientName: activeContact.nombre || "Asesor", text });
    messageInput.value = "";
    messageInput.style.height = "auto";
    fb.updateChatTyping(currentUser.uid, "").catch(() => {});
    showNotice("Mensaje enviado.", false);
  } catch (error) {
    console.error("No se pudo enviar el mensaje:", error);
    showNotice(error?.code === "permission-denied" ? "No se pudo enviar. Publica las reglas de Firestore actualizadas y verifica el permiso Chat del asesor." : "No se pudo enviar el mensaje. Revisa tu conexión e inténtalo de nuevo.");
  } finally { send.disabled = !messageInput.value.trim(); }
}
function focusAdvisorSearch() {
  setActiveTab("advisors");
  searchInput.focus();
  if (window.innerWidth <= 620) showNotice("Elige un asesor en la lista para abrir un chat.", false);
}
function cleanup() {
  destroyed = true;
  unsubscribeDirectory?.(); unsubscribeConversations?.(); unsubscribeMessages?.();
  window.clearInterval(presenceHeartbeat); window.clearTimeout(typingStopTimer);
  if (currentUser && fb) {
    fb.updateChatAdvisorPresence(currentUser.uid, false).catch(() => {});
    fb.updateChatTyping(currentUser.uid, "").catch(() => {});
  }
}
async function startChat(user, profile) {
  if (user?.uid && user.uid === currentUser?.uid && currentProfile && !destroyed) return;
  cleanup();
  destroyed = false;
  unsubscribeDirectory = null; unsubscribeConversations = null; unsubscribeMessages = null;
  currentUser = user || null; currentProfile = profile || null;
  directory = []; directoryError = ""; profileLoadError = ""; conversations = []; activeContact = null; activeConversationId = ""; activeMessages = [];
  fallbackDirectory = [];
  if (!user || !profile || !fb) {
    $("#activeName").textContent = "Inicia sesión para usar el chat";
    $("#activePresence").textContent = "Solo asesores registrados";
    messagesEl.innerHTML = `<div class="welcome-state"><div class="welcome-icon">◉</div><h2>Chat de asesores</h2><p>Inicia sesión con tu cuenta registrada para comenzar.</p></div>`;
    return;
  }
  try {
    await fb.ensureChatAdvisorProfile(user.uid, profile);
    await fb.updateChatAdvisorPresence(user.uid, true);
  } catch (error) { console.warn("No se pudo registrar la presencia en Chat:", error); }
  try { fallbackDirectory = await fb.seedChatDirectoryForExistingAdvisors(); }
  catch (error) {
    console.warn("No se pudieron cargar los perfiles reales de los asesores:", error);
    profileLoadError = error?.code === "permission-denied"
      ? "Tu sesión abre Chat, pero Firestore no autoriza leer los perfiles registrados. Habilita la lectura administrativa de Asesores o publica las reglas nuevas del directorio."
      : "No se pudieron cargar los perfiles reales. Revisa la conexión con Firebase.";
  }
  const name = profile.asesor || profile.usuario || user.displayName || "Asesor";
  $("#selfName").textContent = name;
  $("#selfAvatar").textContent = initials(name);
  unsubscribeDirectory = fb.subscribeChatDirectory(items => {
    directoryError = "";
    if (items.length) profileLoadError = "";
    const merged = new Map(fallbackDirectory.map(person => [person.uid, person]));
    items.forEach(person => merged.set(person.uid || person.id, { ...merged.get(person.uid || person.id), ...person }));
    directory = [...merged.values()];
    renderAll();
  }, error => {
    directoryError = fallbackDirectory.length
      ? "Mostrando los perfiles reales. Publica firestore.rules para activar mensajes y presencia."
      : error?.code === "permission-denied" ? "Firebase bloqueó el directorio. Publica firestore.rules y confirma el permiso de Chat para ver los asesores reales." : "No se pudo conectar con el directorio de asesores. Revisa la conexión.";
    directory = [...fallbackDirectory];
    renderContactList();
    showNotice(directoryError);
  });
  unsubscribeConversations = fb.subscribeChatConversations(user.uid, items => {
    conversations = items;
    renderAll();
    const selectedConversation = getConversation();
    if (selectedConversation && selectedConversation.id === activeConversationId) watchMessages(selectedConversation.id);
  }, error => showNotice(error?.code === "permission-denied" ? "No tienes permiso para consultar tus conversaciones. Verifica las reglas de Firestore." : "No se pudieron cargar tus conversaciones."));
  presenceHeartbeat = window.setInterval(() => {
    if (!destroyed && document.visibilityState === "visible") fb.updateChatAdvisorPresence(user.uid, true).catch(() => {});
  }, 45000);
  renderAll();
}

$("#personalTab").addEventListener("click", () => setActiveTab("personal"));
$("#advisorsTab").addEventListener("click", () => setActiveTab("advisors"));
searchInput.addEventListener("input", renderContactList);
$("#newChatButton").addEventListener("click", focusAdvisorSearch);
$("#focusSearch").addEventListener("click", focusAdvisorSearch);
$("#conversationInfo").addEventListener("click", () => {
  const panel = $("#profileSidebar");
  if (window.innerWidth <= 1000) panel.classList.toggle("open");
  else $(".chat-app").classList.toggle("profile-closed");
});
$("#closeProfile").addEventListener("click", () => {
  if (window.innerWidth <= 1000) $("#profileSidebar").classList.remove("open");
  else $(".chat-app").classList.add("profile-closed");
});
messageInput.addEventListener("input", onTyping);
messageInput.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); chatForm.requestSubmit(); } });
chatForm.addEventListener("submit", sendMessage);
window.addEventListener("pagehide", cleanup);
window.addEventListener("beforeunload", cleanup);
window.addEventListener("message", event => {
  if (event.source !== window.parent) return;
  if (event.data?.type === "INTERCOL_AUTH_STATE") startChat(event.data.user, event.data.profile);
});

async function initialize() {
  const standalone = window.parent === window;
  if (standalone && !window.INTERCOL_FIREBASE) {
    await import("../../admin/firebase-config.js?v=20261021-chat-real-v2");
  }
  while (!window.parent.INTERCOL_FIREBASE && !destroyed) await new Promise(resolve => window.setTimeout(resolve, 75));
  fb = window.parent.INTERCOL_FIREBASE;
  if (!fb) return;
  if (standalone) {
    fb.observeAuth(async user => {
      if (!user) { startChat(null, null); return; }
      const profile = await fb.getAdvisorProfile(user.uid);
      const role = profile ? await fb.getAdvisorRolePermissions(profile.rol || "asesor") : null;
      const permission = role?.permisos?.chat?.acceder;
      const allowed = user.uid === "INJQ1NtkRwRbxfLN2XCwF22flyu2"
        || String(user.email || "").toLowerCase() === "jeblaje@intercol-784d9.firebaseapp.com"
        || permission === true
        || (profile?.rol === "asesor" && typeof permission !== "boolean");
      if (!profile || !allowed) {
        startChat(null, null);
        messagesEl.innerHTML = `<div class="welcome-state"><div class="welcome-icon">⊘</div><h2>Chat no disponible</h2><p>Inicia sesión con una cuenta autorizada para hablar con otros asesores.</p><p><a class="workspace-link" href="../../index.html">Volver a INTERCOL</a></p></div>`;
        return;
      }
      startChat(user, profile);
    });
  } else {
    const user = fb.auth.currentUser;
    if (user) startChat(user, await fb.getAdvisorProfile(user.uid));
    else startChat(null, null);
    window.parent.addEventListener("intercol-firebase-ready", async () => {
      fb = window.parent.INTERCOL_FIREBASE;
      if (fb?.auth.currentUser && currentUser?.uid !== fb.auth.currentUser.uid) startChat(fb.auth.currentUser, await fb.getAdvisorProfile(fb.auth.currentUser.uid));
    });
  }
}
initialize();
