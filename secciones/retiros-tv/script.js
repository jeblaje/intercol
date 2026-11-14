const fb = window.parent.INTERCOL_FIREBASE;
const form = document.querySelector('#tvForm');
const list = document.querySelector('#list');
const search = document.querySelector('#search');
const filter = document.querySelector('#filter');
const createdFrom = document.querySelector('#createdFrom');
const createdTo = document.querySelector('#createdTo');
let rows = [];
let advisor = null;
let editing = '';
let stopSync = null;
const names = { pendiente: 'Pendiente', retirado: 'Retirado', 'no-retirado': 'No retirado', 'sin-retirar': 'Sin retirar', cancelado: 'Cancelado' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordDateKey(record) {
  const millis = timestampMillis(record.creadoEn);
  if (!millis) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(millis);
  const part = type => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function formatDateTime(value) {
  const millis = timestampMillis(value);
  if (!millis) return 'Fecha pendiente';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }).format(millis);
}

function formatRetirementDate(value) {
  if (!value) return 'Sin programar';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : esc(value);
}

function render() {
  const query = search.value.trim().toLocaleLowerCase('es');
  const status = filter.value;
  const from = createdFrom.value;
  const to = createdTo.value;
  const items = rows.filter(record => {
    const createdDate = recordDateKey(record);
    const matchesQuery = !query || Object.entries(record).some(([key, value]) => key !== 'creadoEn' && String(value ?? '').toLocaleLowerCase('es').includes(query));
    return (!status || record.estado === status)
      && matchesQuery
      && (!from || (createdDate && createdDate >= from))
      && (!to || (createdDate && createdDate <= to));
  });
  document.querySelector('#count').textContent = items.length;
  list.innerHTML = items.map(record => `<article class="tv-row"><div><strong class="tv-name">${esc(record.nombre)}</strong><span class="badge">${esc(names[record.estado] || record.estado || 'Sin estado')}</span><div class="tv-meta">Cédula: ${esc(record.cedula)} · Asesor: ${esc(record.asesorCreador || 'Sin asesor')}</div><div class="tv-meta">Registrado en sistema: ${esc(formatDateTime(record.creadoEn))}</div><div class="tv-meta">Fecha de retiro: ${esc(formatRetirementDate(record.fechaRetiro))}</div><div class="tv-meta">Autorizó: ${esc(record.asesorAutoriza || 'Sin registrar')} · Ticket: ${esc(record.ticket || 'Sin ticket')}</div><div class="tv-comment">${esc(record.comentarios)}</div></div><div><div class="tv-links"><a target="_blank" rel="noopener" href="https://wisphub.net/clientes/ver/${encodeURIComponent(record.cedula || '')}@cibercitywisp/#retab4">Tickets</a>${record.ticket ? `<a target="_blank" rel="noopener" href="https://wisphub.net/tickets/ver/${encodeURIComponent(record.ticket)}/">Ticket</a>` : ''}</div><div class="tv-actions"><button data-edit="${esc(record.id)}">Editar</button><button class="delete" data-del="${esc(record.id)}">Eliminar</button></div></div></article>`).join('');
  document.querySelector('#empty').hidden = items.length > 0;
  document.querySelector('#empty').textContent = rows.length && !items.length ? 'No hay retiros que coincidan con los filtros.' : 'No hay retiros de TV registrados.';
  window.parent.postMessage({ type: 'INTERCOL_SECTION_RESIZE', height: document.documentElement.scrollHeight }, '*');
}

function resetForm() {
  form.reset();
  editing = '';
  document.querySelector('#cancelEdit').hidden = true;
  document.querySelector('#formTitle').textContent = 'Agendar retiro de TV';
  document.querySelector('#saveButton').textContent = 'Guardar retiro';
}

function edit(record) {
  if (!record) return;
  editing = record.id;
  Object.entries(record).forEach(([key, value]) => {
    if (form.elements[key] && typeof value === 'string') form.elements[key].value = value;
  });
  document.querySelector('#formTitle').textContent = 'Editar retiro de TV';
  document.querySelector('#saveButton').textContent = 'Guardar cambios';
  document.querySelector('#cancelEdit').hidden = false;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!advisor) return;
  const data = Object.fromEntries(new FormData(form));
  data.asesorCreador = data.asesorCreador || advisor.nombre;
  data.asesorCreadorUid = advisor.uid;
  const button = document.querySelector('#saveButton');
  button.disabled = true;
  try {
    if (editing) await fb.updateTvRetirementRecord(editing, data);
    else await fb.createTvRetirementRecord(data);
    resetForm();
    document.querySelector('#formStatus').textContent = 'Retiro guardado.';
  } catch (error) {
    document.querySelector('#formStatus').textContent = error.code === 'permission-denied'
      ? 'Firebase bloqueó la operación. Habilita crear/editar en el rol Retiro de TV.'
      : 'No se pudo guardar.';
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#cancelEdit').addEventListener('click', () => {
  resetForm();
  document.querySelector('#formStatus').textContent = '';
});
search.addEventListener('input', render);
filter.addEventListener('change', render);
createdFrom.addEventListener('change', render);
createdTo.addEventListener('change', render);
document.querySelector('#clearSearch').addEventListener('click', () => {
  search.value = '';
  filter.value = '';
  createdFrom.value = '';
  createdTo.value = '';
  render();
});

list.addEventListener('click', async event => {
  const editButton = event.target.closest('[data-edit]');
  const deleteButton = event.target.closest('[data-del]');
  if (editButton) edit(rows.find(record => record.id === editButton.dataset.edit));
  if (deleteButton && confirm('¿Eliminar este retiro de TV?')) {
    try { await fb.deleteTvRetirementRecord(deleteButton.dataset.del); }
    catch { document.querySelector('#formStatus').textContent = 'No se pudo eliminar el retiro de TV.'; }
  }
});

window.addEventListener('message', event => {
  if (event.data?.type === 'INTERCOL_THEME') {
    Object.entries(event.data.variables || {}).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
    document.documentElement.dataset.theme = event.data.theme || 'light';
  }
  if (event.data?.type !== 'INTERCOL_AUTH_STATE') return;
  if (stopSync) { stopSync(); stopSync = null; }
  if (event.data.user && event.data.profile) {
    advisor = { uid: event.data.user.uid, nombre: event.data.profile.asesor || 'Asesor' };
    stopSync = fb.subscribeTvRetirementRecords(advisor.uid, records => { rows = records; render(); }, () => { document.querySelector('#syncStatus').textContent = 'Error de sincronización'; });
    document.querySelector('#syncStatus').textContent = 'Sincronizado';
  } else {
    advisor = null;
    rows = [];
    render();
    document.querySelector('#syncStatus').textContent = 'Inicia sesión';
  }
});

window.parent.postMessage({ type: 'INTERCOL_SECTION_READY' }, '*');
new ResizeObserver(() => window.parent.postMessage({ type: 'INTERCOL_SECTION_RESIZE', height: document.documentElement.scrollHeight }, '*')).observe(document.documentElement);
