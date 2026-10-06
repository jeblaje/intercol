const boxForm = document.querySelector("#boxForm");
const userForm = document.querySelector("#userForm");
const cedulaInput = document.querySelector("#cedula");
const userList = document.querySelector("#userList");
const emptyUsers = document.querySelector("#emptyUsers");
const userCount = document.querySelector("#userCount");
const detailPanel = document.querySelector("#detailPanel");
const inlineError = document.querySelector("#inlineError");
const statusText = document.querySelector("#statusText");
const openAllOnusButton = document.querySelector("#openAllOnus");
const popupStatus = document.querySelector("#popupStatus");
const copySheetButton = document.querySelector("#copySheet");
const copyStatus = document.querySelector("#copyStatus");
const BOX_DRAFT_KEY = "intercol_verificar_caja_draft_v1";
const users = [];
let selectedId = null;
let pendingOnuUsers = [];
const onuUrl = cedula => `https://intercolwisp.smartolt.com/onu/configured?free_text=${encodeURIComponent(cedula)}&sort_by=id&sort_order=desc`;
const notesUrl = cedula => `https://wisphub.net/clientes/ver/${encodeURIComponent(cedula)}@cibercitywisp/#set1`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const boxData = () => Object.fromEntries(new FormData(boxForm).entries());
const portFor = user => Number(user.port) || 1;
const listOrderFor = (user, index = 0) => Number(user.listOrder) || index + 1;
const physicalPortFor = port => ((port - 1) % 8) + 1;
const splitterFor = port => Math.floor((port - 1) / 8) + 1;
const splitterColorFor = port => `splitter-color-${((splitterFor(port) - 1) % 4) + 1}`;
const realPortLabel = (port, boxType) => boxType === "x16"
  ? `<span class="splitter-badge ${splitterColorFor(port)}">Splitter ${splitterFor(port)}</span><span>Puerto ${physicalPortFor(port)}</span>`
  : `<span>Puerto ${port}</span>`;

function saveBoxDraft() {
  try {
    localStorage.setItem(BOX_DRAFT_KEY, JSON.stringify({ form: boxData(), users, selectedId }));
  } catch { /* local storage can be unavailable in private browsing */ }
}

function restoreBoxDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(BOX_DRAFT_KEY) || "null");
    if (!draft) return;
    for (const [name, savedValue] of Object.entries(draft.form || {})) {
      const fields = boxForm.elements[name];
      if (!fields) continue;
      if (typeof fields.length === "number" && fields[0]?.type === "radio") {
        Array.from(fields).forEach(field => { field.checked = field.value === savedValue; });
      } else fields.value = savedValue;
    }
    if (Array.isArray(draft.users)) users.push(...draft.users.filter(user => user && typeof user.cedula === "string").map((user, index) => ({
      ...user,
      port: Number.isInteger(Number(user.port)) && Number(user.port) > 0 ? Number(user.port) : index + 1,
      listOrder: Number.isInteger(Number(user.listOrder)) && Number(user.listOrder) > 0 ? Number(user.listOrder) : index + 1,
      orangeBackground: Boolean(user.orangeBackground)
    })));
    selectedId = users.some(user => user.id === draft.selectedId) ? draft.selectedId : users[0]?.id || null;
  } catch { /* Ignore an invalid saved draft and start a fresh form. */ }
}

const dateField = document.querySelector("#boxDate");
const today = new Date();
dateField.value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
restoreBoxDraft();

function updateStatus() {
  const data = boxData();
  const ready = data.date && data.boxType && data.boxNumber.trim() && data.address.trim() && data.technician.trim() && data.advisor.trim();
  statusText.textContent = ready ? `${data.boxType.toUpperCase()} · ${users.length} cédula${users.length === 1 ? "" : "s"}` : "Completa los datos de la caja";
  updateSheetRows();
  saveBoxDraft();
}

function cleanCell(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function updateSheetRows() {
  const data = boxData();
  const ready = Boolean(data.date && data.boxType && data.boxNumber.trim() && data.address.trim() && data.technician.trim() && data.advisor.trim());
  copySheetButton.disabled = !ready || !users.length;
  if (!ready) {
    copyStatus.textContent = "Completa los datos generales de la caja.";
    return;
  }

  const maxPort = Math.max(data.boxType === "x16" ? 16 : 8, ...users.map(user => portFor(user)));
  const groups = Math.ceil(maxPort / 8);
  const rowCount = groups * 8 + Math.max(0, groups - 1) * 2;
  copyStatus.textContent = `Bloque ${data.boxType.toUpperCase()} listo: ${rowCount} filas, con puertos en grupos de 8.`;
}

function renderList() {
  users.sort((a, b) => listOrderFor(a) - listOrderFor(b));
  const boxType = boxData().boxType;
  userList.innerHTML = users.map((user, index) => `<li><button class="user-row ${user.id === selectedId ? "selected" : ""} ${user.orangeBackground ? "orange-marked" : ""}" type="button" data-user-id="${escapeHtml(user.id)}" aria-pressed="${user.id === selectedId}"><span class="port-tag">Lista ${listOrderFor(user, index)}</span><span class="user-id">${escapeHtml(user.cedula)}</span><span class="port-real-tag">${realPortLabel(portFor(user), boxType)}</span></button></li>`).join("");
  emptyUsers.hidden = users.length > 0;
  userCount.textContent = `${users.length} registro${users.length === 1 ? "" : "s"}`;
  openAllOnusButton.disabled = users.length === 0;
  if (!users.length) { pendingOnuUsers = []; popupStatus.textContent = ""; openAllOnusButton.textContent = "↗ Todas las ONU"; }
  userList.querySelectorAll("[data-user-id]").forEach(button => button.addEventListener("click", () => selectUser(button.dataset.userId)));
  updateStatus();
}

function selectUser(id) {
  selectedId = id;
  const user = users.find(item => item.id === id);
  if (!user) return;
  const data = boxData();
  const links = `<a class="detail-link" href="${onuUrl(user.cedula)}" target="_blank" rel="noopener noreferrer">ONU <span aria-hidden="true">↗</span></a><a class="detail-link" href="${notesUrl(user.cedula)}" target="_blank" rel="noopener noreferrer">Anotaciones <span aria-hidden="true">↗</span></a>`;
  detailPanel.innerHTML = `<div class="user-detail"><span class="detail-kicker">DETALLE DE IDENTIFICACIÓN</span><h3>${escapeHtml(user.cedula)}</h3><dl class="detail-data"><div><dt>Orden de la lista del técnico</dt><dd>Lista ${listOrderFor(user, users.indexOf(user))}</dd></div><div><dt>Puerto real actual</dt><dd>${realPortLabel(portFor(user), data.boxType)}</dd></div><div><dt>Tipo de caja</dt><dd>${escapeHtml((data.boxType || "x8").toUpperCase())}</dd></div><div><dt>Número de caja</dt><dd>${escapeHtml(data.boxNumber || "—")}</dd></div><div><dt>Técnico</dt><dd>${escapeHtml(data.technician || "—")}</dd></div><div><dt>Asesor</dt><dd>${escapeHtml(data.advisor || "—")}</dd></div></dl><label class="comment-label" for="portComment">Comentario de este puerto</label><textarea id="portComment" class="port-comment" placeholder="Ej. Se instaló primer splitter">${escapeHtml(user.comment || "")}</textarea><label class="orange-toggle"><input id="orangeBackground" type="checkbox" ${user.orangeBackground ? "checked" : ""}><span>Marcar fondo naranja en la celda de Excel</span></label><nav class="detail-links" aria-label="Detalles del usuario">${links}</nav></div>`;
  const editForm = document.createElement("form");
  editForm.className = "record-edit-form";
  editForm.innerHTML = `<label for="editIdentity">Cédula o dirección</label><input id="editIdentity" name="identity" required value="${escapeHtml(user.cedula)}"><label for="editPort">Puerto real (1–${data.boxType === "x16" ? "16" : "8"})</label><input id="editPort" name="port" type="number" min="1" max="${data.boxType === "x16" ? "16" : "8"}" step="1" required value="${portFor(user)}"><button type="submit" class="secondary">Guardar cambios</button>`;
  detailPanel.querySelector(".user-detail").insertBefore(editForm, detailPanel.querySelector(".detail-links"));
  editForm.addEventListener("submit", event => { event.preventDefault(); const identity = editForm.elements.identity.value.trim(); const port = Number(editForm.elements.port.value); const maxPort = data.boxType === "x16" ? 16 : 8; if (!identity || !Number.isInteger(port) || port < 1 || port > maxPort) return; if (users.some(item => item.id !== user.id && item.cedula.toLocaleLowerCase() === identity.toLocaleLowerCase())) { inlineError.textContent = "Ese dato ya está registrado."; return; } user.cedula = identity; user.port = port; inlineError.textContent = ""; selectUser(user.id); });
  detailPanel.querySelector("#portComment").addEventListener("input", event => {
    user.comment = event.target.value;
    updateSheetRows();
    saveBoxDraft();
  });
  detailPanel.querySelector("#orangeBackground").addEventListener("change", event => {
    user.orangeBackground = event.target.checked;
    renderList();
  });
  renderList();
}

userForm.addEventListener("submit", event => {
  event.preventDefault();
  const cedula = cedulaInput.value.trim();
  inlineError.textContent = "";
  if (!cedula) {
    inlineError.textContent = "Escribe la identificación del usuario para agregarla.";
    return;
  }
  if (users.some(user => user.cedula.toLocaleLowerCase() === cedula.toLocaleLowerCase())) {
    inlineError.textContent = "Esa cédula ya está registrada en esta caja.";
    return;
  }
  const listOrder = users.length ? Math.max(...users.map(user => listOrderFor(user))) + 1 : 1;
  const maxPort = boxData().boxType === "x16" ? 16 : 8;
  const occupiedPorts = new Set(users.map(user => portFor(user)));
  let port = 1;
  while (occupiedPorts.has(port) && port <= maxPort) port += 1;
  if (port > maxPort) port = listOrder;
  const user = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, cedula, port, listOrder, orangeBackground: false };
  users.push(user);
  cedulaInput.value = "";
  selectUser(user.id);
  cedulaInput.focus();
});

boxForm.addEventListener("input", () => {
  updateStatus();
  if (selectedId) selectUser(selectedId);
});

document.querySelector("#clearUsers").addEventListener("click", () => {
  boxForm.reset();
  const resetToday = new Date();
  dateField.value = new Date(resetToday.getTime() - resetToday.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  users.length = 0;
  selectedId = null;
  detailPanel.innerHTML = '<div class="detail-placeholder"><span class="detail-icon">⌕</span><strong>Selecciona una cédula</strong><p>Aquí verás el puerto asignado y los accesos a los detalles del usuario.</p></div>';
  inlineError.textContent = "";
  try { localStorage.removeItem(BOX_DRAFT_KEY); } catch { /* Ignore unavailable local storage. */ }
  renderList();
});

function sheetPortRows() {
  const data = boxData();
  const maxPort = Math.max(data.boxType === "x16" ? 16 : 8, ...users.map(user => portFor(user)));
  const groupCount = Math.ceil(maxPort / 8);
  const rows = [];
  for (let group = 0; group < groupCount; group += 1) {
    for (let localPort = 1; localPort <= 8; localPort += 1) {
      const port = group * 8 + localPort;
      if (port > maxPort) break;
      rows.push({ port, label: localPort });
    }
    if (group < groupCount - 1) rows.push(null, null);
  }
  if (data.boxType === "x16") rows.push(null, null);
  else rows.push(null, null, null, null, null, null);
  return rows;
}

function sheetTableMarkup() {
  const data = boxData();
  const [year, month, day] = data.date.split("-");
  const portRows = sheetPortRows();
  const blockRows = portRows.length;
  const border = "1px solid #111827";
  const base = `border:${border};padding:3px 5px;font:10px Arial,sans-serif;vertical-align:middle;`;
  const generalCells = [
    `${day}/${month}/${year}`, data.boxNumber, data.address, data.technician, data.advisor
  ].map(value => `<td rowspan="${blockRows}" style="${base}text-align:center;min-width:75px;">${escapeHtml(cleanCell(value))}</td>`).join("");
  const rows = portRows.map((slot, index) => {
    const portUsers = slot ? users.filter(item => portFor(item) === slot.port) : [];
    const comment = portUsers.flatMap(item => [item.cedula, item.comment]).filter(Boolean).map(cleanCell).join(" · ");
    const highlighted = portUsers.some(item => item.orangeBackground);
    const general = index === 0 ? generalCells : "";
    const label = slot?.label ?? "";
    const cellStyle = `${base}text-align:left;min-width:280px;${highlighted ? "background-color:#ff9900;color:#111827;" : ""}`;
    return `<tr>${general}<td style="${base}text-align:center;width:28px;">${label}</td><td style="${cellStyle}">${escapeHtml(comment)}</td></tr>`;
  }).join("");
  return `<table style="border-collapse:collapse;border-spacing:0;"><tbody>${rows}</tbody></table>`;
}

async function copyFormattedBlock() {
  const data = boxData();
  const portRows = sheetPortRows();
  const blockRows = portRows.length;
  const [year, month, day] = data.date.split("-");
  const general = [`${day}/${month}/${year}`, data.boxNumber, data.address, data.technician, data.advisor];
  const plainRows = portRows.map((slot, index) => [
    ...(index === 0 ? general : ["", "", "", "", ""]), slot?.label ?? "",
    slot ? users.filter(user => portFor(user) === slot.port).flatMap(user => [user.cedula, user.comment]).filter(Boolean).join(" · ") : ""
  ].map(cleanCell).join("\t")).join("\n");
  const html = sheetTableMarkup();
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    copyStatus.textContent = "Este navegador no permite copiar formato enriquecido. Abre INTERCOL en Chrome o Edge por una dirección segura (HTTPS) e inténtalo de nuevo.";
    return;
  }
  try {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plainRows], { type: "text/plain" })
    });
    await navigator.clipboard.write([item]);
    copyStatus.textContent = "Bloque con formato copiado. Pégalo en la primera celda del bloque vacío de la hoja.";
  } catch (error) {
    copyStatus.textContent = "No se pudo copiar el formato. Revisa que el navegador permita el portapapeles para esta página.";
  }
}

copySheetButton.addEventListener("click", copyFormattedBlock);

openAllOnusButton.addEventListener("click", () => {
  if (pendingOnuUsers.length) {
    const user = pendingOnuUsers.shift();
    const tab = window.open(onuUrl(user.cedula), "_blank");
    if (tab) {
      tab.opener = null;
      popupStatus.textContent = pendingOnuUsers.length
        ? `Abierta ${user.cedula}. Pulsa “Abrir siguiente ONU” para continuar (${pendingOnuUsers.length} restantes).`
        : `Listo: se abrieron todas las ONU.`;
    } else {
      pendingOnuUsers.unshift(user);
      popupStatus.textContent = "El navegador sigue bloqueando las pestañas. Permite ventanas emergentes para INTERCOL e inténtalo de nuevo.";
    }
    openAllOnusButton.textContent = pendingOnuUsers.length ? `Abrir siguiente ONU (${pendingOnuUsers.length})` : "↗ Todas las ONU";
    return;
  }

  popupStatus.textContent = "";
  const blockedUsers = [];
  users.forEach(user => {
    const tab = window.open(onuUrl(user.cedula), "_blank");
    if (tab) tab.opener = null;
    else blockedUsers.push(user);
  });
  pendingOnuUsers = blockedUsers;
  if (pendingOnuUsers.length) {
    openAllOnusButton.textContent = `Abrir siguiente ONU (${pendingOnuUsers.length})`;
    popupStatus.textContent = `El navegador permitió algunas pestañas y bloqueó ${pendingOnuUsers.length}. Pulsa el botón para abrirlas una por una.`;
  } else {
    popupStatus.textContent = "Listo: se abrieron todas las ONU.";
    openAllOnusButton.textContent = "↗ Todas las ONU";
  }
});
window.addEventListener("message", event => {
  if (event.data?.type !== "INTERCOL_THEME") return;
  Object.entries(event.data.variables || {}).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));
  document.documentElement.dataset.theme = event.data.theme || "light";
});
window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");

const resizeSection = () => window.parent.postMessage({ type: "INTERCOL_SECTION_RESIZE", height: document.documentElement.scrollHeight }, "*");
new ResizeObserver(resizeSection).observe(document.documentElement);
renderList();
if (selectedId) selectUser(selectedId);
window.addEventListener("load", resizeSection);
setTimeout(resizeSection, 80);








