const ADMIN_EMAIL = "jeblaje@intercol-784d9.firebaseapp.com";
const ADMIN_UID = "INJQ1NtkRwRbxfLN2XCwF22flyu2";
const views = { dashboard: "Dashboard", advisors: "Asesores", sections: "Secciones", permissions: "Roles y permisos" };
const state = { firebase: null, user: null, profile: null, advisors: [], roles: [], view: "dashboard", selectedAdvisor: "", selectedRole: "asesor", roleDraft: false, roleEditorOpen: false, expandedRoleId: "", busy: false, isSystemAdmin: false, roleAdminPermissions: {} };
const $ = selector => document.querySelector(selector);
const host = $("#adminView");
const ADMIN_THEME_KEY = "intercol_theme_v2";
function applyAdminTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = $("#adminThemeToggle");
  button.innerHTML = `${theme === "dark" ? "☀" : "☾"} <span>${theme === "dark" ? "Claro" : "Oscuro"}</span>`;
  button.setAttribute("aria-label", `Cambiar al tema ${theme === "dark" ? "claro" : "oscuro"}`);
  button.title = `Cambiar al tema ${theme === "dark" ? "claro" : "oscuro"}`;
  try { localStorage.setItem(ADMIN_THEME_KEY, theme); } catch { /* Theme still applies for this session. */ }
}
function toggleAdminTheme() {
  applyAdminTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}
applyAdminTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
$("#adminThemeToggle").addEventListener("click", toggleAdminTheme);
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function listSections() { return (window.INTERCOL_SECTIONS || []).filter(section => !section.hideFromLists && section.id !== "acceso"); }
function listPermissionSections() { return [...listSections().filter(section => section.requiresAuth), { id: "roles-permisos", name: "Roles y permisos", description: "Administrar roles y sus permisos." }]; }
function canManageRoles(action) { return state.isSystemAdmin || state.roleAdminPermissions[action] === true; }
function canAccessAdminView(view) {
  if (view === "dashboard") return true;
  if (state.isSystemAdmin) return true;
  return state.roleAdminPermissions.ver === true;
}
function currentView() { const key = location.hash.slice(1); return views[key] ? key : "dashboard"; }
function setStatus(text, error = false) { const status = $("#adminStatus"); status.classList.toggle("is-error", error); status.innerHTML = `<span class="status-dot"></span>${escapeHtml(text)}`; }
function renderLogin() {
  document.body.classList.add("admin-auth-only");
  $("#adminSignOut").hidden = true;
  host.innerHTML = `<section class="login-card"><span class="eyebrow">ACCESO ADMINISTRATIVO</span><h2>Iniciar sesión</h2><p>Usa tu correo real o, si tu cuenta es antigua, tu nombre de usuario.</p><form id="adminLoginForm"><label for="adminUsername">Usuario o correo electrónico</label><input id="adminUsername" name="username" autocomplete="username" maxlength="254" required><label for="adminPassword">Contraseña</label><input id="adminPassword" name="password" type="password" autocomplete="current-password" required><button class="primary-button" type="submit">Continuar</button><button class="admin-reset-link" id="adminForgotPassword" type="button">¿Olvidaste tu contraseña?</button><p class="inline-status" id="loginStatus" role="status"></p></form></section>`;
  $("#adminLoginForm").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; const status = $("#loginStatus"); const button = form.querySelector("button[type=submit]");
    button.disabled = true; status.textContent = "Conectando con Firebase…";
    try { await state.firebase.signInAdvisor({ username: form.elements.username.value.trim(), password: form.elements.password.value }); }
    catch (error) { status.textContent = error.code === "auth/invalid-credential" ? "Usuario o contraseña incorrectos." : error.message || "No se pudo iniciar sesión."; button.disabled = false; }
  });
  $("#adminForgotPassword").addEventListener("click", async () => {
    const email = $("#adminUsername").value.trim(); const status = $("#loginStatus");
    if (!email.includes("@")) { status.textContent = "Escribe el correo real asociado a la cuenta."; return; }
    const button = $("#adminForgotPassword"); button.disabled = true; status.textContent = "Enviando enlace…";
    try { await state.firebase.sendAdvisorPasswordReset(email); status.textContent = "Si el correo pertenece a una cuenta, Firebase enviará el enlace de recuperación."; }
    catch (error) { status.textContent = error.code === "auth/user-not-found" ? "No se encontró una cuenta con ese correo. Las cuentas antiguas deben asociar un correo real desde una sesión abierta." : error.message || "No se pudo enviar el enlace."; }
    finally { button.disabled = false; }
  });
}
function renderUnauthorized() {
  document.body.classList.add("admin-auth-only");
  $("#adminSignOut").hidden = true;
  host.innerHTML = `<section class="login-card access-denied"><span class="eyebrow">ACCESO RESTRINGIDO</span><h2>No tienes permisos</h2><p>Esta cuenta no está autorizada para entrar al panel administrativo.</p><a class="primary-button access-return" href="../index.html">Volver al servicio principal</a></section>`;
}
function updateNav() {
  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === state.view);
    button.hidden = !canAccessAdminView(button.dataset.view);
  });
  const managementLabel = document.querySelector(".management-label");
  if (managementLabel) managementLabel.hidden = !["advisors", "sections", "permissions"].some(canAccessAdminView);
  $("#adminPageTitle").textContent = views[state.view];
}
function dashboardView() {
  const managementCards = [
    canAccessAdminView("advisors") ? '<button class="quick-card" type="button" data-go="advisors"><span class="quick-icon purple">♙</span><strong>Administrar asesores</strong><small>Asignar un rol a cada asesor</small><span class="quick-arrow">→</span></button>' : "",
    canAccessAdminView("sections") ? '<button class="quick-card" type="button" data-go="sections"><span class="quick-icon blue">▣</span><strong>Consultar secciones</strong><small>Ver los módulos disponibles</small><span class="quick-arrow">→</span></button>' : "",
    canAccessAdminView("permissions") ? '<button class="quick-card" type="button" data-go="permissions"><span class="quick-icon amber">⚿</span><strong>Administrar roles</strong><small>Definir permisos por rol</small><span class="quick-arrow">→</span></button>' : ""
  ].join("");
  host.innerHTML = `<section class="welcome-card"><div class="welcome-mark">I</div><div><span class="eyebrow">ESPACIO DE ADMINISTRACIÓN</span><h2>Bienvenido al panel de INTERCOL</h2><p>Administra las cuentas, las secciones y los roles de acceso.</p></div></section><section class="metrics-grid" aria-label="Resumen de administración"><article class="metric-card"><span class="metric-icon purple">♙</span><div><span>Asesores</span><strong>${state.advisors.length}</strong></div><small>Perfiles cargados desde Firebase</small></article><article class="metric-card"><span class="metric-icon blue">▣</span><div><span>Secciones</span><strong>${listSections().length}</strong></div><small>Módulos registrados en INTERCOL</small></article><article class="metric-card"><span class="metric-icon amber">⚿</span><div><span>Roles</span><strong>${state.roles.length}</strong></div><small>Permisos compartidos por rol</small></article></section><section class="quick-grid">${managementCards}</section>`;
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
function rolePermissionSummary(role) {
  return listPermissionSections().map(section => {
    const enabled = permissionLabels.filter(([key]) => role.permisos?.[section.id]?.[key]).map(([, label]) => label);
    return `<div class="role-permission-summary"><strong>${escapeHtml(section.name)}</strong><span>${enabled.length ? enabled.map(label => `<i class="role-permission-chip">${escapeHtml(label)}</i>`).join("") : '<i class="role-permission-none">Sin permisos</i>'}</span></div>`;
  }).join("");
}
function rolePermissionDetails(role) {
  return `<div class="role-permission-details">${listPermissionSections().map(section => `<div class="role-detail-row"><div><strong>${escapeHtml(section.name)}</strong><small>${escapeHtml(section.description || "")}</small></div><div>${permissionLabels.map(([key, label]) => `<span class="role-detail-action ${role.permisos?.[section.id]?.[key] ? "allowed" : "denied"}">${escapeHtml(label)} ${role.permisos?.[section.id]?.[key] ? "✓" : "—"}</span>`).join("")}</div></div>`).join("")}</div>`;
}
function rolesView() {
  const role = state.roles.find(item => item.id === state.selectedRole) || null;
  if (!role && !state.roleDraft && state.roles.length) state.selectedRole = state.roles[0].id;
  const selectedRole = state.roles.find(item => item.id === state.selectedRole) || null;
  const permissions = selectedRole?.permisos || {};
  const cards = state.roles.map(item => {
    const assignedCount = state.advisors.filter(advisor => (advisor.rol || "asesor") === item.id).length;
    const expanded = state.expandedRoleId === item.id;
    const cannotDeleteAssigned = assignedCount > 0 && !state.isSystemAdmin;
    const isDefaultRole = ["asesor", "administrador"].includes(item.id);
    return `<article class="role-card"><header class="role-card-header"><div><span class="role-card-kicker">${isDefaultRole ? "ROL PREDETERMINADO" : "ROL PERSONALIZADO"}</span><h3>${escapeHtml(item.nombre || item.id)}</h3><small>${assignedCount} asesor${assignedCount === 1 ? " asignado" : "es asignados"}</small></div><span class="role-key">${escapeHtml(item.id)}</span></header><div class="role-card-permissions">${rolePermissionSummary(item)}</div>${expanded ? rolePermissionDetails(item) : ""}<footer class="role-card-actions"><button class="table-button" type="button" data-view-role="${escapeHtml(item.id)}">${expanded ? "Ocultar detalle" : "Ver"}</button><button class="table-button" type="button" data-edit-role="${escapeHtml(item.id)}" ${canManageRoles("editar") && (item.id !== "administrador" || state.isSystemAdmin) ? "" : "disabled title=\"No tienes permiso para editar este rol\""}>Editar</button><button class="table-button danger-button" type="button" data-delete-role="${escapeHtml(item.id)}" ${isDefaultRole || !canManageRoles("eliminar") || (!state.isSystemAdmin && !state.roleAdminPermissions.ver) || cannotDeleteAssigned ? `disabled title="${isDefaultRole ? "Los roles predeterminados no se pueden eliminar" : cannotDeleteAssigned ? "Solo el administrador puede eliminar roles asignados" : !state.isSystemAdmin && !state.roleAdminPermissions.ver ? "Necesitas permiso para ver asesores antes de eliminar roles" : "No tienes permiso para eliminar roles"}"` : ""}>Eliminar</button></footer></article>`;
  }).join("");
  const editor = state.roleEditorOpen ? `<section class="data-panel permission-panel role-editor-panel"><div class="panel-toolbar role-toolbar"><div><span class="eyebrow">${state.roleDraft ? "CREAR ROL" : "EDITAR ROL"}</span><strong>${state.roleDraft ? "Nuevo rol" : escapeHtml(selectedRole?.nombre || "Rol")}</strong></div><label for="roleName">Nombre</label><input id="roleName" type="text" value="${escapeHtml(state.roleDraft ? "" : selectedRole?.nombre || "")}" placeholder="Ej. Supervisor"><span class="toolbar-spacer"></span><button class="secondary-button" id="cancelRoleEdit" type="button">Cancelar</button><button class="primary-button" id="saveRole" type="button">Guardar rol</button></div><div class="table-wrap"><table><thead><tr><th><label class="bulk-check"><input type="checkbox" id="permissionSelectAll"><span>Todas las secciones y permisos</span></label></th>${permissionLabels.map(([key,label]) => `<th><label class="bulk-check" title="Aplicar ${label} a todas las secciones"><input type="checkbox" data-select-action="${key}"><span>${label}</span></label></th>`).join("")}</tr></thead><tbody>${permissionRows(permissions) || `<tr><td colspan="5"><div class="table-empty">Aún no hay secciones protegidas en el catálogo.</div></td></tr>`}</tbody></table></div><p class="role-help">No se puede eliminar un rol mientras haya asesores asignados. El rol Asesor no se puede eliminar.</p></section>` : "";
  host.innerHTML = `<section class="view-heading"><div><span class="eyebrow">CONTROL DE ACCESO</span><h2>Roles y permisos</h2><p>Consulta los permisos de cada rol y edítalos desde su tarjeta.</p></div>${canManageRoles("crear") ? '<button class="primary-button" id="newRole" type="button">＋ Nuevo rol</button>' : ""}</section><div class="role-card-grid">${cards || '<div class="empty-panel"><strong>Aún no hay roles.</strong></div>'}</div><p id="rolesActionStatus" class="inline-status" role="status"></p>${editor}`;
  host.querySelectorAll("[data-view-role]").forEach(button => button.addEventListener("click", () => { state.expandedRoleId = state.expandedRoleId === button.dataset.viewRole ? "" : button.dataset.viewRole; rolesView(); }));
  host.querySelectorAll("[data-edit-role]").forEach(button => button.addEventListener("click", () => { state.selectedRole = button.dataset.editRole; state.roleDraft = false; state.roleEditorOpen = true; rolesView(); $("#roleName").focus(); }));
  host.querySelectorAll("[data-delete-role]").forEach(button => button.addEventListener("click", () => { state.selectedRole = button.dataset.deleteRole; deleteRole(); }));
  $("#newRole")?.addEventListener("click", () => { state.roleDraft = true; state.selectedRole = ""; state.roleEditorOpen = true; rolesView(); $("#roleName").focus(); });
  if (state.roleEditorOpen) {
    bindPermissionControls();
    $("#saveRole").addEventListener("click", saveRole);
    $("#cancelRoleEdit").addEventListener("click", () => { state.roleDraft = false; state.roleEditorOpen = false; rolesView(); });
  }
}
function render() { document.body.classList.remove("admin-auth-only"); if (!canAccessAdminView(state.view)) state.view = "dashboard"; updateNav(); if (state.view === "dashboard") dashboardView(); else if (state.view === "advisors") advisorsView(); else if (state.view === "sections") sectionsView(); else rolesView(); }
function navigate(view) { if (!views[view] || !canAccessAdminView(view)) return; if (location.hash !== `#${view}`) location.hash = view; else { state.view = view; render(); } }
async function loadData() {
  setStatus("Cargando datos…");
  let loadStep = "leer el catálogo de roles";
  try {
    const defaults = Object.fromEntries(listPermissionSections().map(section => [section.id, section.id === "roles-permisos" ? { ver: false, crear: false, editar: false, eliminar: false } : { ver: true, crear: true, editar: true, eliminar: false }]));
    if (state.isSystemAdmin) {
      loadStep = "crear o leer el rol Asesor";
      await state.firebase.ensureAdvisorRole("asesor", "Asesor", defaults, state.user.uid);
      loadStep = "crear o leer el rol Administrador";
      await state.firebase.ensureAdvisorRole("administrador", "Administrador", Object.fromEntries(listPermissionSections().map(section => [section.id, { ver: true, crear: true, editar: true, eliminar: true }])), state.user.uid);
    }
    loadStep = "leer roles y asesores";
    const [advisors, roles, legacyPermissions] = await Promise.all([
      state.isSystemAdmin || state.roleAdminPermissions.ver ? state.firebase.listAdvisorProfiles() : Promise.resolve([]),
      state.firebase.listAdvisorRoles(),
      state.isSystemAdmin ? state.firebase.listAdvisorSectionPermissions() : Promise.resolve([])
    ]);
    const knownRoles = new Map(roles.map(role => [role.id, role]));
    const legacyByAdvisor = new Map(legacyPermissions.map(item => [item.id, item]));
    state.advisors = advisors;
    loadStep = "migrar asignaciones de roles existentes";
    for (const advisor of state.isSystemAdmin ? state.advisors : []) {
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
    state.roles = state.isSystemAdmin ? await state.firebase.listAdvisorRoles() : roles;
    if (state.isSystemAdmin) {
      const adminRole = state.roles.find(role => role.id === "administrador");
      const adminPermissions = Object.fromEntries(listPermissionSections().map(section => [section.id, { ver: true, crear: true, editar: true, eliminar: true }]));
      if (adminRole && (adminRole.nombre !== "Administrador" || JSON.stringify(adminRole.permisos) !== JSON.stringify(adminPermissions))) {
        await state.firebase.saveAdvisorRole("administrador", "Administrador", adminPermissions, state.user.uid);
        adminRole.nombre = "Administrador"; adminRole.permisos = adminPermissions;
      }
      const adminAdvisor = state.advisors.find(advisor => advisor.id === state.user.uid);
      if (adminAdvisor && adminAdvisor.rol !== "administrador") {
        await state.firebase.assignAdvisorRole(adminAdvisor.id, "administrador", state.user.uid);
        adminAdvisor.rol = "administrador";
      }
    }
    loadStep = "completar permisos predeterminados del rol Asesor";
    const advisorRole = state.isSystemAdmin ? state.roles.find(role => role.id === "asesor") : null;
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
      ? `Firestore denegó el paso «${loadStep}» (${errorCode}). Publica las reglas actualizadas en el proyecto intercol-784d9; deben reconocer como administrador el UID de la cuenta o el rol Administrador del perfil.`
      : `Falló el paso «${loadStep}» (${errorCode}): ${error?.message || "Revisa la conexión."}`;
    setStatus(isDenied ? `Firebase denegó: ${loadStep}.` : `Error al ${loadStep} (${errorCode}).`, true);
    host.innerHTML = `<section class="empty-panel"><div class="empty-icon">!</div><h2>No se pudieron cargar los datos</h2><p>${escapeHtml(detail)}</p></section>`;
  }
}
function slugifyRole(name) { return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
async function saveRole() {
  if (state.busy) return; const button = $("#saveRole"); const status = $("#rolesActionStatus"); const name = $("#roleName").value.trim(); const existing = state.roles.find(item => item.id === state.selectedRole);
  if (!canManageRoles(existing ? "editar" : "crear") || (existing?.id === "administrador" && !state.isSystemAdmin)) { status.textContent = `No tienes permiso para ${existing ? "editar" : "crear"} este rol.`; return; }
  if (!name) { status.textContent = "Escribe el nombre del rol."; return; }
  const roleId = existing ? existing.id : slugifyRole(name);
  if (!roleId) { status.textContent = "El nombre del rol debe incluir letras o números."; return; }
  if (!existing && state.roles.some(item => item.id === roleId)) { status.textContent = "Ya existe un rol con ese nombre."; return; }
  const permissions = {}; host.querySelectorAll("input[data-section][data-action]").forEach(input => { permissions[input.dataset.section] ||= { ver: false, crear: false, editar: false, eliminar: false }; permissions[input.dataset.section][input.dataset.action] = input.checked; });
  state.busy = true; button.disabled = true; status.textContent = "Guardando permisos del rol…";
  try { await state.firebase.saveAdvisorRole(roleId, name, permissions, state.user.uid); const updated = { id: roleId, nombre: name, permisos: permissions }; const index = state.roles.findIndex(item => item.id === roleId); if (index < 0) state.roles.push(updated); else state.roles[index] = { ...state.roles[index], ...updated }; state.selectedRole = roleId; state.roleDraft = false; state.roleEditorOpen = false; rolesView(); $("#rolesActionStatus").textContent = "Rol guardado."; }
  catch (error) { console.error("No se pudo guardar el rol:", error); status.textContent = error?.code === "permission-denied" ? "Firestore denegó guardar el rol (permission-denied). Confirma que publicaste las reglas en el proyecto intercol-784d9 y que tu cuenta es la administradora autorizada." : `No se pudo guardar el rol (${error?.code || "error"}): ${error?.message || "Revisa la conexión."}`; }
  finally { state.busy = false; if ($("#saveRole")) $("#saveRole").disabled = false; }
}
async function deleteRole() {
  const role = state.roles.find(item => item.id === state.selectedRole); const status = $("#rolesActionStatus");
  if (!role || ["asesor", "administrador"].includes(role.id) || !canManageRoles("eliminar") || (!state.isSystemAdmin && !state.roleAdminPermissions.ver)) return;
  const assignedAdvisors = state.advisors.filter(advisor => (advisor.rol || "asesor") === role.id);
  if (assignedAdvisors.length && !state.isSystemAdmin) { status.textContent = "Solo el administrador puede eliminar roles asignados a asesores."; return; }
  const confirmText = assignedAdvisors.length
    ? `¿Eliminar el rol “${role.nombre || role.id}”? Los ${assignedAdvisors.length} asesor(es) asignados pasarán al rol Asesor.`
    : `¿Eliminar el rol “${role.nombre || role.id}”?`;
  if (!confirm(confirmText)) return;
  try {
    for (const advisor of assignedAdvisors) {
      await state.firebase.assignAdvisorRole(advisor.id, "asesor", state.user.uid);
      advisor.rol = "asesor";
    }
    await state.firebase.deleteAdvisorRole(role.id);
    state.roles = state.roles.filter(item => item.id !== role.id);
    state.selectedRole = "asesor"; state.roleEditorOpen = false; state.roleDraft = false;
    if (state.expandedRoleId === role.id) state.expandedRoleId = "";
    rolesView(); $("#rolesActionStatus").textContent = "Rol eliminado. Los asesores asignados quedaron con el rol Asesor.";
  }
  catch (error) { console.error("No se pudo eliminar el rol:", error); status.textContent = error.code === "permission-denied" ? "Firebase no autorizó eliminar este rol." : "No se pudo eliminar el rol."; }
}
async function handleUser(user) {
  state.user = user || null; state.profile = null; state.isSystemAdmin = false; state.roleAdminPermissions = {};
  if (!user) { setStatus("Inicia sesión para continuar"); renderLogin(); return; }
  $("#adminSignOut").hidden = false;
  try { state.profile = await state.firebase.getAdvisorProfile(user.uid); } catch { state.profile = null; }
  let assignedRole = null;
  if (state.profile?.rol) {
    try { assignedRole = await state.firebase.getAdvisorRolePermissions(state.profile.rol); }
    catch (error) { console.error("No se pudo consultar el rol asignado:", error); }
  }
  state.isSystemAdmin = user.uid === ADMIN_UID
    || String(user.email || "").toLowerCase() === ADMIN_EMAIL
    || String(state.profile?.rol || "").toLowerCase() === "administrador"
    || String(assignedRole?.nombre || "").trim().toLowerCase() === "administrador";
  if (!state.isSystemAdmin && state.profile) {
    try {
      const roleId = state.profile.rol || "asesor";
      const role = await state.firebase.getAdvisorRolePermissions(roleId);
      state.roleAdminPermissions = role?.permisos?.["roles-permisos"] || {};
    } catch (error) { console.error("No se pudieron cargar permisos de administración de roles:", error); }
  }
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
