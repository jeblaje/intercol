const ADMIN_EMAIL = "jeblaje@intercol-784d9.firebaseapp.com";
const views = { dashboard: "Dashboard", advisors: "Asesores", sections: "Secciones", permissions: "Roles y permisos" };
const state = { firebase: null, user: null, profile: null, advisors: [], roles: [], view: "dashboard", selectedAdvisor: "", selectedRole: "asesor", roleDraft: false, busy: false };
const $ = selector => document.querySelector(selector);
const host = $("#adminView");
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function listSections() { return (window.INTERCOL_SECTIONS || []).filter(section => !section.hideFromLists && section.id !== "acceso"); }
function listPermissionSections() { return listSections().filter(section => section.requiresAuth); }
function currentView() { const key = location.hash.slice(1); return views[key] ? key : "dashboard"; }
function setStatus(text, error = false) { const status = $("#adminStatus"); status.classList.toggle("is-error", error); status.innerHTML = `<span class="status-dot"></span>${escapeHtml(text)}`; }
function renderLogin() {
  $("#adminSignOut").hidden = true;
  host.innerHTML = `<section class="login-card"><span class="eyebrow">ACCESO ADMINISTRATIVO</span><h2>Iniciar sesión</h2><p>Usa tu cuenta de asesor. Solo la cuenta autorizada puede administrar INTERCOL.</p><form id="adminLoginForm"><label for="adminUsername">Nombre de usuario</label><input id="adminUsername" name="username" autocomplete="username" required><label for="adminPassword">Contraseña</label><input id="adminPassword" name="password" type="password" autocomplete="current-password" required><button class="primary-button" type="submit">Continuar</button><p class="inline-status" id="loginStatus" role="status"></p></form></section>`;
  $("#adminLoginForm").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; const status = $("#loginStatus"); const button = form.querySelector("button[type=submit]");
    button.disabled = true; status.textContent = "Conectando con Firebase…";
    try { await state.firebase.signInAdvisor({ username: form.elements.username.value.trim(), password: form.elements.password.value }); }
    catch (error) { status.textContent = error.code === "auth/invalid-credential" ? "Usuario o contraseña incorrectos." : error.message || "No se pudo iniciar sesión."; button.disabled = false; }
  });
}
function renderUnauthorized() {
  $("#adminSignOut").hidden = false;
  host.innerHTML = `<section class="empty-panel access-denied"><div class="empty-icon">⛨</div><span class="eyebrow">ACCESO RESTRINGIDO</span><h2>Esta cuenta no administra el sistema</h2><p>UID de esta cuenta:</p><code class="uid-copy">${escapeHtml(state.user?.uid || "")}</code><button class="secondary-button" id="copyUid" type="button">Copiar UID</button><p class="inline-status" id="copyStatus" role="status"></p></section>`;
  $("#copyUid").addEventListener("click", async () => { try { await navigator.clipboard.writeText(state.user.uid); $("#copyStatus").textContent = "UID copiado."; } catch { $("#copyStatus").textContent = state.user.uid; } });
}
function updateNav() { document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === state.view)); $("#adminPageTitle").textContent = views[state.view]; }
function dashboardView() {
  host.innerHTML = `<section class="welcome-card"><div class="welcome-mark">I</div><div><span class="eyebrow">ESPACIO DE ADMINISTRACIÓN</span><h2>Bienvenido al panel de INTERCOL</h2><p>Administra las cuentas, las secciones y los roles de acceso.</p></div></section><section class="metrics-grid" aria-label="Resumen de administración"><article class="metric-card"><span class="metric-icon purple">♙</span><div><span>Asesores</span><strong>${state.advisors.length}</strong></div><small>Perfiles cargados desde Firebase</small></article><article class="metric-card"><span class="metric-icon blue">▣</span><div><span>Secciones</span><strong>${listSections().length}</strong></div><small>Módulos registrados en INTERCOL</small></article><article class="metric-card"><span class="metric-icon amber">⚿</span><div><span>Roles</span><strong>${state.roles.length}</strong></div><small>Permisos compartidos por rol</small></article></section><section class="quick-grid"><button class="quick-card" type="button" data-go="advisors"><span class="quick-icon purple">♙</span><strong>Administrar asesores</strong><small>Asignar un rol a cada asesor</small><span class="quick-arrow">→</span></button><button class="quick-card" type="button" data-go="sections"><span class="quick-icon blue">▣</span><strong>Consultar secciones</strong><small>Ver los módulos disponibles</small><span class="quick-arrow">→</span></button><button class="quick-card" type="button" data-go="permissions"><span class="quick-icon amber">⚿</span><strong>Administrar roles</strong><small>Definir permisos por rol</small><span class="quick-arrow">→</span></button></section>`;
  host.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
}
function advisorsView() {
  const rows = state.advisors.map(advisor => `<tr><td><strong>${escapeHtml(advisor.asesor || "Sin nombre")}</strong><small>${escapeHtml(advisor.usuario || "")}</small></td><td><code>${escapeHtml(advisor.id)}</code></td><td><select class="role-assignment" data-advisor-role="${escapeHtml(advisor.id)}" aria-label="Rol de ${escapeHtml(advisor.asesor || advisor.usuario || "asesor")}">${state.roles.map(role => `<option value="${escapeHtml(role.id)}" ${(advisor.rol || "asesor") === role.id ? "selected" : ""}>${escapeHtml(role.nombre || role.id)}</option>`).join("")}</select></td><td><button class="table-button" type="button" data-save-advisor-role="${escapeHtml(advisor.id)}">Guardar rol</button></td></tr>`).join("");
  host.innerHTML = `<section class="view-heading"><div><span class="eyebrow">CUENTAS DE FIREBASE</span><h2>Asesores</h2><p>Asigna un rol a cada asesor. Las cuentas nuevas reciben el rol Asesor.</p></div><button type="button" class="secondary-button" id="refreshAdvisors">Actualizar</button></section><section class="data-panel"><div class="panel-toolbar"><strong>${state.advisors.length} asesor${state.advisors.length === 1 ? "" : "es"}</strong><input id="advisorSearch" type="search" placeholder="Buscar asesor o usuario"></div><div class="table-wrap"><table><thead><tr><th>Asesor</th><th>UID</th><th>Rol asignado</th><th></th></tr></thead><tbody id="advisorRows">${rows || `<tr><td colspan="4"><div class="table-empty">No hay perfiles para mostrar.</div></td></tr>`}</tbody></table></div><p id="advisorRoleStatus" class="inline-status" role="status"></p></section>`;
  $("#refreshAdvisors").addEventListener("click", loadData);
  $("#advisorSearch").addEventListener("input", event => { const term = event.target.value.toLowerCase(); host.querySelectorAll("#advisorRows tr").forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(term); }); });
  host.querySelectorAll("[data-save-advisor-role]").forEach(button => button.addEventListener("click", async () => {
    const uid = button.dataset.saveAdvisorRole; const roleId = host.querySelector(`[data-advisor-role="${CSS.escape(uid)}"]`).value; const status = $("#advisorRoleStatus");
    button.disabled = true; status.textContent = "Guardando rol…";
    try { await state.firebase.assignAdvisorRole(uid, roleId, state.user.uid); const advisor = state.advisors.find(item => item.id === uid); if (advisor) advisor.rol = roleId; status.textContent = "Rol guardado."; }
    catch (error) { console.error("No se pudo asignar el rol:", error); status.textContent = error.code === "permission-denied" ? "Firebase no autorizó asignar el rol. Publica las reglas actualizadas." : "No se pudo guardar el rol."; }
    finally { button.disabled = false; }
  }));
}
function sectionsView() {
  const sections = listSections();
  host.innerHTML = `<section class="view-heading"><div><span class="eyebrow">MÓDULOS DISPONIBLES</span><h2>Secciones</h2><p>Catálogo cargado desde el registro actual de INTERCOL.</p></div></section><section class="section-catalog">${sections.map((section, index) => `<article class="catalog-card"><span class="catalog-icon">${escapeHtml(section.icon || "▣")}</span><div><small>SECCIÓN ${String(index + 1).padStart(2, "0")}</small><h3>${escapeHtml(section.name)}</h3><p>${escapeHtml(section.description || "Sin descripción")}</p></div><span class="catalog-access ${section.requiresAuth ? "private" : "public"}">${section.requiresAuth ? "Con inicio de sesión" : "Abierta"}</span></article>`).join("")}</section>`;
}
const permissionLabels = [["ver", "Ver"], ["crear", "Crear"], ["editar", "Editar"], ["eliminar", "Eliminar"]];
function updateBulkCheckboxes() {
  const inputs = [...host.querySelectorAll("input[data-section][data-action]")]; const master = $("#permissionSelectAll"); if (!master) return;
  const selected = inputs.filter(input => input.checked).length; master.checked = inputs.length > 0 && selected === inputs.length; master.indeterminate = selected > 0 && selected < inputs.length;
  permissionLabels.forEach(([action]) => { const group = host.querySelector(`[data-select-action="${action}"]`); const members = inputs.filter(input => input.dataset.action === action); const count = members.filter(input => input.checked).length; group.checked = members.length > 0 && count === members.length; group.indeterminate = count > 0 && count < members.length; });
}
function bindPermissionControls() {
  $("#permissionSelectAll")?.addEventListener("change", event => { host.querySelectorAll("input[data-section][data-action]").forEach(input => { input.checked = event.currentTarget.checked; }); updateBulkCheckboxes(); });
  permissionLabels.forEach(([action]) => host.querySelector(`[data-select-action="${action}"]`)?.addEventListener("change", event => { host.querySelectorAll(`input[data-section][data-action="${action}"]`).forEach(input => { input.checked = event.currentTarget.checked; }); updateBulkCheckboxes(); }));
  host.querySelectorAll("input[data-section][data-action]").forEach(input => input.addEventListener("change", updateBulkCheckboxes)); updateBulkCheckboxes();
}
function permissionRows(permissions = {}) {
  return listPermissionSections().map(section => `<tr><th><strong>${escapeHtml(section.name)}</strong><small>${escapeHtml(section.description || "")}</small></th>${permissionLabels.map(([key,label]) => `<td><label class="permission-check" aria-label="${escapeHtml(label)} ${escapeHtml(section.name)}"><input type="checkbox" data-section="${escapeHtml(section.id)}" data-action="${key}" ${permissions[section.id]?.[key] ? "checked" : ""}><span>${label}</span></label></td>`).join("")}</tr>`).join("");
}
function rolesView() {
  const role = state.roles.find(item => item.id === state.selectedRole) || null;
  if (!role && !state.roleDraft && state.roles.length) state.selectedRole = state.roles[0].id;
  const selectedRole = state.roles.find(item => item.id === state.selectedRole) || null;
  const permissions = selectedRole?.permisos || {};
  const assigned = selectedRole && state.advisors.some(advisor => (advisor.rol || "asesor") === selectedRole.id);
  host.innerHTML = `<section class="view-heading"><div><span class="eyebrow">CONTROL DE ACCESO</span><h2>Roles y permisos</h2><p>Define permisos una sola vez por rol y luego asigna ese rol a los asesores.</p></div></section><section class="data-panel permission-panel"><div class="panel-toolbar role-toolbar"><label for="roleSelector">Rol</label><select id="roleSelector"><option value="" ${state.roleDraft ? "selected" : ""}>Nuevo rol…</option>${state.roles.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === state.selectedRole && !state.roleDraft ? "selected" : ""}>${escapeHtml(item.nombre || item.id)}</option>`).join("")}</select><label for="roleName">Nombre</label><input id="roleName" type="text" value="${escapeHtml(state.roleDraft ? "" : selectedRole?.nombre || "")}" placeholder="Ej. Supervisor"><button class="secondary-button" id="newRole" type="button">Nuevo rol</button><span class="toolbar-spacer"></span><button class="secondary-button danger-button" id="deleteRole" type="button" ${!selectedRole || selectedRole.id === "asesor" || assigned ? "disabled" : ""}>Eliminar rol</button><button class="primary-button" id="saveRole" type="button">Guardar rol</button></div><div class="table-wrap"><table><thead><tr><th><label class="bulk-check"><input type="checkbox" id="permissionSelectAll"><span>Todas las secciones y permisos</span></label></th>${permissionLabels.map(([key,label]) => `<th><label class="bulk-check" title="Aplicar ${label} a todas las secciones"><input type="checkbox" data-select-action="${key}"><span>${label}</span></label></th>`).join("")}</tr></thead><tbody>${permissionRows(permissions) || `<tr><td colspan="5"><div class="table-empty">Aún no hay secciones con inicio de sesión.</div></td></tr>`}</tbody></table></div><p class="role-help">Las secciones públicas no necesitan configuración de roles. El rol Asesor se asigna automáticamente al registrarse. No se puede eliminar mientras haya asesores asignados.</p><p id="roleStatus" class="inline-status" role="status"></p></section>`;
  $("#roleSelector").addEventListener("change", event => { state.roleDraft = event.target.value === ""; state.selectedRole = event.target.value; rolesView(); });
  $("#newRole").addEventListener("click", () => { state.roleDraft = true; state.selectedRole = ""; rolesView(); $("#roleName").focus(); });
  bindPermissionControls();
  $("#saveRole").addEventListener("click", saveRole);
  $("#deleteRole").addEventListener("click", deleteRole);
}
function render() { updateNav(); if (state.view === "dashboard") dashboardView(); else if (state.view === "advisors") advisorsView(); else if (state.view === "sections") sectionsView(); else rolesView(); }
function navigate(view) { if (!views[view]) return; if (location.hash !== `#${view}`) location.hash = view; else { state.view = view; render(); } }
async function loadData() {
  setStatus("Cargando datos…");
  let loadStep = "leer el catálogo de roles";
  try {
    const defaults = Object.fromEntries(listPermissionSections().map(section => [section.id, { ver: true, crear: true, editar: true, eliminar: false }]));
    loadStep = "crear o leer el rol Asesor";
    await state.firebase.ensureAdvisorRole("asesor", "Asesor", defaults, state.user.uid);
    loadStep = "leer asesores, roles y permisos";
    const [advisors, roles, legacyPermissions] = await Promise.all([state.firebase.listAdvisorProfiles(), state.firebase.listAdvisorRoles(), state.firebase.listAdvisorSectionPermissions()]);
    const knownRoles = new Map(roles.map(role => [role.id, role]));
    const legacyByAdvisor = new Map(legacyPermissions.map(item => [item.id, item]));
    state.advisors = advisors;
    loadStep = "migrar asignaciones de roles existentes";
    for (const advisor of state.advisors) {
      const legacy = legacyByAdvisor.get(advisor.id);
      if (advisor.rol && knownRoles.has(advisor.rol)) continue;
      if (!legacy?.permisos) { advisor.rol = "asesor"; continue; }
      const legacyRole = legacy.rol || "Personalizado";
      const roleId = legacyRole === "Operador" ? "operador" : legacyRole === "Solo lectura" ? "solo-lectura" : "personalizado-" + advisor.id.slice(0, 8);
      const roleName = legacyRole === "Personalizado" ? "Personalizado · " + (advisor.asesor || advisor.usuario || advisor.id.slice(0, 8)) : legacyRole;
      if (!knownRoles.has(roleId)) {
        await state.firebase.ensureAdvisorRole(roleId, roleName, legacy.permisos, state.user.uid);
        knownRoles.set(roleId, { id: roleId, nombre: roleName, permisos: legacy.permisos });
      }
      await state.firebase.assignAdvisorRole(advisor.id, roleId, state.user.uid);
      advisor.rol = roleId;
    }
    state.roles = await state.firebase.listAdvisorRoles();
    loadStep = "completar permisos predeterminados del rol Asesor";
    const advisorRole = state.roles.find(role => role.id === "asesor");
    if (advisorRole) {
      const completedPermissions = { ...(advisorRole.permisos || {}) };
      let permissionsChanged = false;
      Object.entries(defaults).forEach(([sectionId, defaultActions]) => {
        const currentActions = completedPermissions[sectionId] || {};
        const mergedActions = { ...defaultActions, ...currentActions };
        if (JSON.stringify(currentActions) !== JSON.stringify(mergedActions)) permissionsChanged = true;
        completedPermissions[sectionId] = mergedActions;
      });
      if (permissionsChanged) {
        await state.firebase.saveAdvisorRole("asesor", advisorRole.nombre || "Asesor", completedPermissions, state.user.uid);
        advisorRole.permisos = completedPermissions;
      }
    }
    state.advisors = state.advisors.map(advisor => ({ ...advisor, rol: advisor.rol || "asesor" }));
    if (!state.roles.some(role => role.id === state.selectedRole) && !state.roleDraft) state.selectedRole = state.roles[0]?.id || "asesor";
    setStatus("Datos sincronizados con Firebase"); render();
  } catch (error) {
    console.error(`No se pudo completar el paso «${loadStep}» en la administración de INTERCOL:`, error);
    const errorCode = error?.code || "error";
    const isDenied = errorCode === "permission-denied";
    const detail = isDenied
      ? `Firestore denegó el paso «${loadStep}» (${errorCode}). Verifica que publicaste las reglas en el proyecto intercol-784d9 y que la cuenta administradora sea jeblaje@intercol-784d9.firebaseapp.com.`
      : `Falló el paso «${loadStep}» (${errorCode}): ${error?.message || "Revisa la conexión."}`;
    setStatus(isDenied ? `Firebase denegó: ${loadStep}.` : `Error al ${loadStep} (${errorCode}).`, true);
    host.innerHTML = `<section class="empty-panel"><div class="empty-icon">!</div><h2>No se pudieron cargar los datos</h2><p>${escapeHtml(detail)}</p></section>`;
  }
}
function slugifyRole(name) { return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
async function saveRole() {
  if (state.busy) return; const button = $("#saveRole"); const status = $("#roleStatus"); const name = $("#roleName").value.trim(); const existing = state.roles.find(item => item.id === state.selectedRole);
  if (!name) { status.textContent = "Escribe el nombre del rol."; return; }
  const roleId = existing ? existing.id : slugifyRole(name);
  if (!roleId) { status.textContent = "El nombre del rol debe incluir letras o números."; return; }
  if (!existing && state.roles.some(item => item.id === roleId)) { status.textContent = "Ya existe un rol con ese nombre."; return; }
  const permissions = {}; host.querySelectorAll("input[data-section][data-action]").forEach(input => { permissions[input.dataset.section] ||= { ver: false, crear: false, editar: false, eliminar: false }; permissions[input.dataset.section][input.dataset.action] = input.checked; });
  state.busy = true; button.disabled = true; status.textContent = "Guardando permisos del rol…";
  try { await state.firebase.saveAdvisorRole(roleId, name, permissions, state.user.uid); const updated = { id: roleId, nombre: name, permisos: permissions }; const index = state.roles.findIndex(item => item.id === roleId); if (index < 0) state.roles.push(updated); else state.roles[index] = { ...state.roles[index], ...updated }; state.selectedRole = roleId; state.roleDraft = false; status.textContent = "Rol guardado."; rolesView(); $("#roleStatus").textContent = "Rol guardado."; }
  catch (error) { console.error("No se pudo guardar el rol:", error); status.textContent = error?.code === "permission-denied" ? "Firestore denegó guardar el rol (permission-denied). Confirma que publicaste las reglas en el proyecto intercol-784d9 y que tu cuenta es la administradora autorizada." : `No se pudo guardar el rol (${error?.code || "error"}): ${error?.message || "Revisa la conexión."}`; }
  finally { state.busy = false; if ($("#saveRole")) $("#saveRole").disabled = false; }
}
async function deleteRole() {
  const role = state.roles.find(item => item.id === state.selectedRole); const status = $("#roleStatus");
  if (!role || role.id === "asesor") return;
  if (state.advisors.some(advisor => (advisor.rol || "asesor") === role.id)) { status.textContent = "Primero asigna otro rol a los asesores que lo usan."; return; }
  if (!confirm(`¿Eliminar el rol “${role.nombre || role.id}”?`)) return;
  try { await state.firebase.deleteAdvisorRole(role.id); state.roles = state.roles.filter(item => item.id !== role.id); state.selectedRole = "asesor"; rolesView(); $("#roleStatus").textContent = "Rol eliminado."; }
  catch (error) { console.error("No se pudo eliminar el rol:", error); status.textContent = error.code === "permission-denied" ? "Firebase no autorizó eliminar este rol." : "No se pudo eliminar el rol."; }
}
async function handleUser(user) {
  state.user = user || null; state.profile = null;
  if (!user) { setStatus("Inicia sesión para continuar"); renderLogin(); return; }
  $("#adminSignOut").hidden = false;
  if (String(user.email || "").toLowerCase() !== ADMIN_EMAIL) { setStatus("Cuenta pendiente de autorización", true); renderUnauthorized(); return; }
  try { state.profile = await state.firebase.getAdvisorProfile(user.uid); } catch { state.profile = null; }
  state.view = currentView(); await loadData();
}
function boot() {
  state.firebase = window.INTERCOL_FIREBASE;
  if (!state.firebase) { setStatus("No se pudo iniciar Firebase", true); host.innerHTML = `<section class="empty-panel"><h2>Error de conexión</h2><p>Recarga la página para volver a intentarlo.</p></section>`; return; }
  $("#adminSignOut").addEventListener("click", () => state.firebase.signOutAdvisor());
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
  window.addEventListener("hashchange", () => { state.view = currentView(); render(); });
  state.firebase.observeAuth(handleUser);
}
if (window.INTERCOL_FIREBASE) boot(); else window.addEventListener("intercol-firebase-ready", boot, { once: true });
