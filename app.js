const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const statuses = ['New', 'In progress', 'For Review', 'Completed'];
const roles = ['Dev', 'ProB', 'Admin'];
const priorities = ['Normal', 'High'];
const emptyState = () => ({ members: [], tasks: [], trackers: [], activity: [] });
const storage = {
  get(type, key) { try { return window[type].getItem(key); } catch { return null; } },
  set(type, key, value) { try { window[type].setItem(key, value); return true; } catch { return false; } },
  remove(type, key) { try { window[type].removeItem(key); } catch { /* Storage can be disabled. */ } }
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const offset = days => { const date = new Date(today() + 'T12:00:00'); date.setDate(date.getDate() + days); return localDate(date); };
const initials = name => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toUpperCase() || '—';
const dateLabel = (date, full = false) => date ? new Date(date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(full ? { year: 'numeric' } : {}) }) : 'No due date';
const timestamp = date => date ? new Date(date).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';

let visitorName = demoMode ? 'Demo administrator' : sharedNameMode ? String(storage.get('sessionStorage', 'forma-visitor') || '').trim().slice(0, 70) : '';
window.boardActorName = () => visitorName;
let cacheWarning = '';
function loadCache() {
  try {
    const raw = storage.get('localStorage', 'azzurro-board-v2');
    if (!raw) return emptyState();
    const value = JSON.parse(raw);
    if (!value || !Array.isArray(value.members) || !Array.isArray(value.tasks)) throw new Error('Invalid cache');
    if (!value.members.every(item => item && typeof item.id === 'string' && typeof item.name === 'string') ||
        !value.tasks.every(item => item && typeof item.id === 'string' && typeof item.title === 'string' && statuses.includes(item.status))) throw new Error('Invalid cache');
    return { members: value.members, tasks: value.tasks, trackers: Array.isArray(value.trackers) ? value.trackers.filter(row => row && ['id','name','url'].every(key => typeof row[key] === 'string')) : [], activity: Array.isArray(value.activity) ? value.activity : [] };
  } catch {
    cacheWarning = 'Saved browser data could not be read. The original data has been preserved.';
    return emptyState();
  }
}
let state = demoMode ? loadCache() : emptyState();
let baseline = structuredClone(state), busy = false, ready = demoMode, stale = false;
let view = ['dashboard', 'board', 'members', 'users', 'trackers'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
let selected = 'all', scope = 'active', query = '', month = new Date(today() + 'T12:00:00');
let taskView = storage.get('localStorage', 'forma-task-view') === 'list' ? 'list' : 'kanban';
let toastTimer, dialogReturnFocus;
const member = id => state.members.find(person => person.id === id);
const overdue = task => task.status !== 'Completed' && task.due && task.due < today();
const badge = status => `<span class="status s${statuses.indexOf(status)}">${esc(status)}</span>`;
const priorityBadge = priority => `<span class="priority ${priorities.includes(priority) ? priority : 'Normal'}">${esc(priority || 'Normal')}</span>`;

function toast(message, error = false) {
  clearTimeout(toastTimer);
  const element = $('#toast');
  element.textContent = message; element.classList.toggle('error', error); element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, error ? 9000 : 4500);
}
function connection(message, kind) {
  const element = $('#connection-status');
  element.textContent = message || (FormaStore.enabled ? 'Shared workspace · Up to date' : window.FORMA_CONFIG?.preview ? 'Demo preview · Sample data' : 'Local preview · Saved in this browser');
  element.dataset.state = kind || (FormaStore.enabled ? 'online' : 'local');
}
function setBusy(value) {
  busy = value;
  $('main').inert = value; $('aside').inert = value; $('#editor').inert = value;
  $('main').setAttribute('aria-busy', String(value));
}

async function save() {
  if (!visitorName || !isAdmin() || busy || !ready || stale) { state = structuredClone(baseline); return false; }
  if (!FormaStore.enabled) {
    if (cacheWarning) { state = structuredClone(baseline); toast(cacheWarning, true); return false; }
    recordLocalChanges(baseline, state);
    if (!storage.set('localStorage', 'azzurro-board-v2', JSON.stringify(state))) {
      state = structuredClone(baseline); render(); toast('Changes were not saved. Browser storage is unavailable or full.', true); return false;
    }
    baseline = structuredClone(state); return true;
  }
  setBusy(true); connection('Saving changes…');
  try {
    await FormaStore.save(baseline, state);
  } catch (error) {
    try { state = await FormaStore.load(); baseline = structuredClone(state); }
    catch { state = structuredClone(baseline); stale = true; }
    setBusy(false); render();
    connection(stale ? 'Connection lost · Refresh required' : 'Save needs review', 'error');
    toast(`${error.partial ? 'Some changes were saved. ' : 'Save could not be confirmed. '}${error.message}`, true);
    return false;
  }
  // A successful write and a failed reload are different outcomes. Never invite a duplicate write.
  baseline = structuredClone(state);
  try { state = await FormaStore.load(); baseline = structuredClone(state); connection(); }
  catch { stale = true; connection('Changes saved · Refresh required', 'error'); }
  finally { setBusy(false); }
  return true;
}
function saved(message) {
  toast(stale ? `${message}. The latest workspace could not be loaded; reconnect before further edits.` : message, stale);
}

async function refresh(force = false) {
  if (!visitorName || !FormaStore.enabled || busy) return;
  if (!force && (document.hidden || $('#editor').open || $('#content').contains(document.activeElement) && document.activeElement.matches('input,select,textarea,button'))) return;
  busy = true;
  const generation = authGeneration;
  try {
    let roleChanged = false;
    if (!sharedNameMode) {
    let profile;
    try { profile = await WorkspaceAuth.verify(); }
    catch (error) { if (generation === authGeneration) clearAccess(error.message); return; }
    if (generation !== authGeneration) return;
    if (!profile) { clearAccess(); return; }
    roleChanged = authProfile?.role !== profile.role;
    authProfile = profile; visitorName = profile.display_name;
    if (roleChanged && $('#editor').open) $('#editor').close();
    }
    const next = await FormaStore.load();
    if (generation !== authGeneration) return;
    const changed = roleChanged || !ready || stale || JSON.stringify(next) !== JSON.stringify(state);
    state = next; baseline = structuredClone(state); ready = true; stale = false;
    if (changed) render();
    connection();
  } catch (error) {
    if (!ready) {
      $('#content').innerHTML = '<div class="connection-panel"><p class="eyebrow">WORKSPACE CONNECTION</p><h1>Let’s reconnect.</h1><p>We couldn’t load your shared workspace. Check your connection and try again.</p><button class="primary" id="retry">Retry connection</button></div>';
      $('#retry').onclick = () => refresh(true);
    }
    connection('Unable to refresh · Check connection', 'error');
    if (force || !ready) toast(error.message, true);
  } finally { busy = false; }
}

function navigate(next) {
  if (!['dashboard', 'board', 'members', 'users', 'trackers'].includes(next) || busy) return;
  view = next === 'users' && !canManageUsers() ? 'dashboard' : next;
  if (location.hash !== '#' + next) history.pushState(null, '', '#' + next);
  render(); $('#content').focus({ preventScroll: true });
}
function render() {
  if (!visitorName) { if (FormaStore.enabled) loginScreen(); else setupScreen(); return; }
  if (view === 'users' && !canManageUsers()) view = 'dashboard';
  $('[data-view="users"]').hidden = !canManageUsers();
  const tabScroll = $('.tabs')?.scrollLeft || 0;
  document.body.classList.remove('welcome-mode');
  $('#visitor-bar').innerHTML = `<span class="avatar" aria-hidden="true">${esc(initials(visitorName))}</span><span class="visitor-name" title="${esc(visitorName)}">${esc(visitorName)}</span>${sharedNameMode ? '<button class="secondary" id="change-name">Change name</button>' : FormaStore.enabled ? `<span class="access-role ${isAdmin() ? 'admin' : 'viewer'}">${isAdmin() ? 'Admin' : 'Viewer'}</span><button class="secondary" id="sign-out">Sign out</button>` : '<span class="preview-tag">Design preview</span>'}`;
  $('#change-name')?.addEventListener('click', () => {
    storage.remove('sessionStorage', 'forma-visitor');
    clearAccess();
  });
  $('#sign-out')?.addEventListener('click', async () => { try { await WorkspaceAuth.signOut(); clearAccess(); } catch (error) { toast(error.message, true); } });
  $('#date').textContent = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  document.querySelectorAll('nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  const titles = { trackers: ['Trackers', 'Your everyday essentials.', 'Shared sheets, documents, and links. All within reach.'], users: ['Users', 'Workspace access.', 'Manage the people who can sign in to your workspace.'], dashboard: ['Dashboard', 'Your day, in focus.', 'A clear view of your team’s progress and what’s coming next.'], board: ['Task boards', 'A little progress, every day.', 'Every task, every update, all in one place.'], members: ['Team members', 'The people behind the work.', 'Keep your team connected and their responsibilities clear.'] };
  $('#breadcrumb').textContent = titles[view][0];
  connection(stale ? 'Refresh required before editing' : undefined, stale ? 'error' : undefined);
  if (!ready) { $('#content').innerHTML = '<div class="connection-panel" role="status"><p class="eyebrow">AZZURRO WORKSPACE</p><h1>Connecting your team…</h1><p>Loading tasks, members, and recent updates.</p></div>'; return; }
  $('#content').innerHTML = `${demoMode ? '<div class="preview-banner"><b>Design preview</b><span>Sample data only · Staff sign-in is required in the shared workspace.</span></div>' : ''}${stale ? '<div class="overdue-banner" role="alert"><span>Reconnect to see the latest changes and continue editing.</span><button class="secondary" id="reconnect">Reconnect</button></div>' : ''}<div class="heading"><div><p class="eyebrow">${titles[view][0]}</p><h1>${titles[view][1]}</h1><p class="subtitle">${titles[view][2]}</p></div>${isAdmin() ? `<button class="primary" id="${view === 'trackers' ? 'add-tracker' : view === 'users' ? 'add-user' : view === 'members' ? 'add-member' : 'add-task'}">＋ ${view === 'trackers' ? 'Add tracker' : view === 'users' ? 'Add user' : view === 'members' ? 'Add member' : 'New task'}</button>` : '<span class="access-role viewer">Read-only access</span>'}</div><div id="body"></div>`;
  $('#reconnect')?.addEventListener('click', () => refresh(true));
  if (view === 'dashboard') dashboard(); else if (view === 'board') board(); else if (view === 'users') users(); else if (view === 'trackers') trackers(); else members();
  $('#add-tracker')?.addEventListener('click', () => trackerEditor());
  $('#add-user')?.addEventListener('click', () => userEditor());
  $('#add-task')?.addEventListener('click', () => taskEditor());
  $('#add-member')?.addEventListener('click', () => memberEditor());
  if ($('.tabs')) $('.tabs').scrollLeft = tabScroll;
}

function taskRow(task) {
  return `<button class="task-row" data-task="${esc(task.id)}"><span class="dot" aria-hidden="true"></span><span class="details"><b>${esc(task.title)}</b><small class="${overdue(task) ? 'overdue' : ''}">${esc(member(task.memberId)?.name || 'Unassigned')} · ${task.due === today() ? 'Today' : task.due === offset(1) ? 'Tomorrow' : esc(dateLabel(task.due))}${overdue(task) ? ' · Overdue' : ''}</small></span>${badge(task.status)}</button>`;
}
function bindTaskButtons(root = $('#body')) { root.querySelectorAll('[data-task]').forEach(button => { button.onclick = () => taskEditor(button.dataset.task); }); }
function dashboard() {
  const active = state.tasks.filter(task => task.status !== 'Completed');
  const due = active.filter(task => task.due >= today() && task.due <= offset(2)).sort(sortTasks);
  const late = active.filter(overdue);
  const stats = [['Active tasks', active.length, 'Across the workspace', icon('board')], ['Due in 3 days', due.length, 'Today and the next two days', icon('clock')], ['For review', active.filter(task => task.status === 'For Review').length, 'Ready for a second look', icon('check')], ['Team members', state.members.length, 'Working better, together', icon('people')]];
  $('#body').innerHTML = `<div class="stats">${stats.map(stat => `<div class="stat"><em aria-hidden="true">${stat[3]}</em><p class="stat-label">${stat[0]}</p><strong>${stat[1]}</strong><small>${stat[2]}</small></div>`).join('')}</div>${late.length ? `<div class="overdue-banner"><span><b>${late.length} overdue ${late.length === 1 ? 'task needs' : 'tasks need'} attention.</b> Keep the next step moving.</span><button class="secondary" id="view-overdue">View overdue →</button></div>` : ''}<div class="dashboard-grid"><div class="panel"><div class="panel-head"><div><h2>Coming up next</h2><p>Your team’s upcoming deadlines</p></div><span class="pill">Next 3 days</span></div>${due.slice(0, 7).map(taskRow).join('') || '<div class="empty"><span class="empty-icon" aria-hidden="true">✓</span>No deadlines in the next three days.<br>A little breathing room for your team.</div>'}<div class="panel-foot"><small>${due.length > 7 ? `${due.length - 7} more upcoming tasks on the board` : 'All dates follow Sydney time'}</small><button class="text-button" id="view-board">View board →</button></div></div><div class="panel"><div class="panel-head"><div><h2>Task calendar</h2><p>Every deadline, at a glance</p></div><span class="pill">Month view</span></div><div id="calendar"></div></div></div>`;
  $('#view-board').onclick = () => navigate('board');
  $('#view-overdue')?.addEventListener('click', () => { scope = 'overdue'; selected = 'all'; query = ''; navigate('board'); });
  bindTaskButtons(); calendar();
}
function calendar() {
  const year = month.getFullYear(), index = month.getMonth();
  const start = new Date(year, index, 1 - (new Date(year, index, 1).getDay() + 6) % 7);
  $('#calendar').innerHTML = `<div class="calendar"><div class="calendar-toolbar"><b>${month.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</b><div><button id="prev" aria-label="Previous month">‹</button><button id="now">Today</button><button id="next" aria-label="Next month">›</button></div></div><div class="calendar-grid">${['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => `<div class="dayname">${day}</div>`).join('')}${Array.from({ length: 42 }, (_, offset) => {
    const date = new Date(start); date.setDate(date.getDate() + offset); const key = localDate(date);
    const tasks = state.tasks.filter(task => task.due === key);
    return `<div class="day ${date.getMonth() !== index ? 'muted' : ''} ${key === today() ? 'today' : ''}"><span class="day-number" ${key === today() ? 'aria-current="date"' : ''}>${date.getDate()}</span>${tasks.slice(0, 2).map(task => `<button class="calendar-task" data-task="${esc(task.id)}" title="${esc(task.title)}">${esc(task.title)}</button>`).join('')}${tasks.length > 2 ? `<button class="calendar-more" data-day="${key}">+${tasks.length - 2} more</button>` : ''}${tasks.length ? `<button class="calendar-count" data-day="${key}" aria-label="${tasks.length} tasks on ${dateLabel(key, true)}">${tasks.length}</button>` : ''}</div>`;
  }).join('')}</div><p class="calendar-hint">Select a task or a day’s task count to see details.</p></div>`;
  $('#prev').onclick = () => { month = new Date(year, index - 1, 1); calendar(); };
  $('#next').onclick = () => { month = new Date(year, index + 1, 1); calendar(); };
  $('#now').onclick = () => { month = new Date(today() + 'T12:00:00'); calendar(); };
  bindTaskButtons($('#calendar'));
  $('#calendar').querySelectorAll('[data-day]').forEach(button => { button.onclick = () => {
    openDialog(`<h2 id="dialog-title">${dateLabel(button.dataset.day, true)}</h2><p class="subtitle">Tasks due on this day</p><div class="day-tasks">${state.tasks.filter(task => task.due === button.dataset.day).map(taskRow).join('')}</div><div class="actions"><button class="secondary" id="cancel">Close</button></div>`);
    bindTaskButtons($('#editor'));
  }; });
}

function filteredTasks() {
  const needle = query.trim().toLowerCase();
  return state.tasks.filter(task => (selected === 'all' || (selected === 'unassigned' ? !task.memberId : task.memberId === selected)) &&
    (scope === 'all' || scope === 'active' && task.status !== 'Completed' || scope === 'completed' && task.status === 'Completed' || scope === 'overdue' && overdue(task)) &&
    [task.title, task.description, task.latest_note, member(task.memberId)?.name].some(value => String(value || '').toLowerCase().includes(needle)));
}
function sortTasks(a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.title.localeCompare(b.title); }
function board() {
  if (!['all', 'unassigned'].includes(selected) && !member(selected)) selected = 'all';
  const filters = [['all', 'Everyone'], ['unassigned', 'Unassigned'], ...state.members.map(person => [person.id, person.name])];
  $('#body').innerHTML = `<div class="tabs" role="group" aria-label="Filter by assignee">${filters.map(([id, name]) => `<button data-filter="${esc(id)}" class="${selected === id ? 'selected' : ''}" aria-pressed="${selected === id}" title="${esc(name)}">${esc(name)}</button>`).join('')}</div><div class="board-toolbar"><div class="view-switch" role="group" aria-label="Task view"><button data-layout="kanban" aria-pressed="${taskView === 'kanban'}" class="${taskView === 'kanban' ? 'selected' : ''}">▥ Kanban</button><button data-layout="list" aria-pressed="${taskView === 'list'}" class="${taskView === 'list' ? 'selected' : ''}">☰ List</button></div><select id="scope" class="toolbar-scope" aria-label="Task scope">${[['active', 'Active tasks'], ['all', 'All tasks'], ['completed', 'Completed'], ['overdue', 'Overdue']].map(([value, label]) => `<option value="${value}" ${scope === value ? 'selected' : ''}>${label}</option>`).join('')}</select><button class="secondary" id="export-tasks">↓ Export text</button><div class="search-wrap"><label class="sr-only" for="search">Search tasks, notes, or people</label><input id="search" type="search" placeholder="Search tasks, notes, people…" value="${esc(query)}"></div></div><div id="columns"></div><p class="note">${!isAdmin() ? 'Select a task title or Notes to view details and update history.' : taskView === 'kanban' ? 'Click a card or its Edit button to open a task. Drag between columns or use the status menu to move it.' : 'Change status directly in the table. Select a title to edit, or Notes to add an update.'} Completed work is available in the All tasks and Completed filters.</p>`;
  document.querySelectorAll('[data-filter]').forEach(button => { button.onclick = () => { selected = button.dataset.filter; scope = selected === 'all' ? 'active' : 'all'; render(); $(`[data-filter="${CSS.escape(selected)}"]`)?.focus(); }; });
  document.querySelectorAll('[data-layout]').forEach(button => { button.onclick = () => { taskView = button.dataset.layout; storage.set('localStorage', 'forma-task-view', taskView); render(); $(`[data-layout="${taskView}"]`)?.focus(); }; });
  $('#scope').onchange = event => { scope = event.target.value; columns(); };
  $('#search').oninput = event => { query = event.target.value; columns(); };
  $('#export-tasks').onclick = exportTasks;
  columns();
}
function statusPicker(task) {
  if (!isAdmin()) return badge(task.status);
  return `<select class="status status-picker s${statuses.indexOf(task.status)}" data-task-status="${esc(task.id)}" aria-label="Status for ${esc(task.title)}">${statuses.map(status => `<option ${status === task.status ? 'selected' : ''}>${status}</option>`).join('')}</select>`;
}
function columns() {
  const tasks = filteredTasks().sort(sortTasks);
  if (taskView === 'list') taskList(tasks);
  else {
    $('#columns').innerHTML = `<div class="board">${statuses.map(status => `<div class="column" data-status="${status}" aria-label="${status} tasks"><div class="column-title"><i class="dot" aria-hidden="true"></i>${status}<span>${tasks.filter(task => task.status === status).length}</span></div>${tasks.filter(task => task.status === status).map(task => `<article class="card" draggable="${isAdmin()}" tabindex="0" aria-label="Open ${esc(task.title)}" data-id="${esc(task.id)}"><div class="card-head">${priorityBadge(task.priority)}<span class="avatar" title="${esc(member(task.memberId)?.name || 'Unassigned')}" aria-label="Assigned to ${esc(member(task.memberId)?.name || 'Unassigned')}">${esc(initials(member(task.memberId)?.name))}</span></div><h3><button class="task-title" data-task="${esc(task.id)}">${esc(task.title)}</button></h3><p class="latest-note">${esc(task.latest_note || task.description || 'No updates yet')}</p>${noteMeta(task)}<div class="card-bottom"><span class="${overdue(task) ? 'overdue' : ''}">◷ ${esc(dateLabel(task.due))}${overdue(task) ? ' · Overdue' : ''}</span><span>${esc(member(task.memberId)?.name.split(' ')[0] || 'Unassigned')}</span></div><div class="card-footer">${statusPicker(task)}<div class="card-actions">${isAdmin() ? `<button class="secondary" data-edit-task="${esc(task.id)}" aria-label="Edit ${esc(task.title)}">Edit</button>` : ''}<button class="secondary" data-notes="${esc(task.id)}">Notes</button></div></div></article>`).join('') || `<div class="empty">${status === 'Completed' && scope === 'active' ? 'Choose All tasks to see completed work.' : query ? 'No matching tasks' : 'No tasks here yet'}</div>`}</div>`).join('')}</div>`;
    document.querySelectorAll('.card').forEach(card => {
      let dragged = false;
      const isControl = target => target.closest('button,select,input,textarea,a,[contenteditable]');
      card.onclick = event => {
        if (dragged || isControl(event.target) || window.getSelection()?.toString()) return;
        taskEditor(card.dataset.id);
      };
      card.onkeydown = event => {
        if (event.target === card && ['Enter', ' '].includes(event.key)) {
          event.preventDefault(); taskEditor(card.dataset.id);
        }
      };
      card.ondragstart = event => {
        if (!isAdmin() || isControl(event.target)) { event.preventDefault(); return; }
        dragged = true; event.dataTransfer.setData('text/plain', card.dataset.id); event.dataTransfer.effectAllowed = 'move';
      };
      card.ondragend = () => {
        setTimeout(() => { dragged = false; }, 0);
        document.querySelectorAll('.dragover').forEach(column => column.classList.remove('dragover'));
      };
    });
    document.querySelectorAll('.column').forEach(column => {
      column.ondragover = event => { if (!isAdmin()) return; event.preventDefault(); column.classList.add('dragover'); };
      column.ondragleave = event => { if (!column.contains(event.relatedTarget)) column.classList.remove('dragover'); };
      column.ondrop = event => { event.preventDefault(); column.classList.remove('dragover'); updateStatus(event.dataTransfer.getData('text/plain'), column.dataset.status); };
    });
  }
  bindTaskButtons($('#columns'));
  document.querySelectorAll('[data-edit-task]').forEach(button => { button.onclick = () => taskEditor(button.dataset.editTask); });
  document.querySelectorAll('[data-notes]').forEach(button => { button.onclick = () => notesEditor(button.dataset.notes); });
  document.querySelectorAll('[data-task-status]').forEach(select => { select.onchange = () => updateStatus(select.dataset.taskStatus, select.value); });
}
async function updateStatus(id, status) {
  if (!canEdit()) { render(); return; }
  const task = state.tasks.find(task => task.id === id);
  if (!task || !statuses.includes(status) || status === task.status) return;
  task.status = status;
  if (!await save()) { render(); return; }
  render(); saved('Task moved to ' + status);
  $(`[data-task-status="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
}
function taskList(tasks) {
  $('#columns').innerHTML = `<div class="panel task-table-wrap"><table class="task-table"><caption class="table-caption">${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} · ${esc($('#scope').selectedOptions[0].textContent)}</caption><thead><tr>${['Task', 'Status', 'Assignee', 'Due date', 'Priority', 'Notes'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${tasks.map(task => `<tr><td data-label="Task"><button class="task-title" data-task="${esc(task.id)}">${esc(task.title)}</button><small class="task-description latest-note">${esc(task.latest_note || task.description || 'No updates yet')}</small>${noteMeta(task)}</td><td data-label="Status">${statusPicker(task)}</td><td data-label="Assignee">${esc(member(task.memberId)?.name || 'Unassigned')}</td><td data-label="Due date"><time class="${overdue(task) ? 'overdue' : ''}" datetime="${esc(task.due)}">${esc(dateLabel(task.due, true))}</time>${overdue(task) ? '<small class="overdue">Overdue</small>' : ''}</td><td data-label="Priority">${priorityBadge(task.priority)}</td><td data-label="Notes"><button class="secondary" data-notes="${esc(task.id)}" aria-label="Notes for ${esc(task.title)}">Notes</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No tasks match these filters. Try another scope or search.</td></tr>'}</tbody></table></div>`;
}

function members() {
  $('#body').innerHTML = state.members.length ? `<div class="members">${state.members.map(person => `<div class="panel member"><div class="member-top"><span class="avatar">${esc(initials(person.name))}</span><span class="pill ${roles.includes(person.role) ? person.role : ''}">${esc(person.role)}</span></div><h3>${esc(person.name)}</h3><p>${state.tasks.filter(task => task.memberId === person.id && task.status !== 'Completed').length} active tasks</p><div class="member-actions"><button class="secondary" data-member-board="${esc(person.id)}">View tasks</button>${isAdmin() ? `<button class="secondary" data-edit-member="${esc(person.id)}">Edit</button><button class="danger" data-remove="${esc(person.id)}" aria-label="Remove ${esc(person.name)}">Remove</button>` : ''}</div></div>`).join('')}</div><p class="note">Member roles describe responsibilities. Sign-in access is managed separately in Users.</p>` : '<div class="empty-state"><span class="empty-icon" aria-hidden="true">♧</span><h2>Bring your team together.</h2><p>Add your first team member to assign tasks and keep responsibilities clear.</p><button class="primary" id="first-member">＋ Add first member</button></div>';
  if (!isAdmin() && $('#first-member')) { $('.empty-state p').textContent = 'An administrator can add members and assign their work here.'; $('#first-member').remove(); }
  $('#first-member')?.addEventListener('click', () => memberEditor());
  document.querySelectorAll('[data-member-board]').forEach(button => { button.onclick = () => { selected = button.dataset.memberBoard; scope = 'all'; query = ''; navigate('board'); }; });
  document.querySelectorAll('[data-edit-member]').forEach(button => { button.onclick = () => memberEditor(button.dataset.editMember); });
  document.querySelectorAll('[data-remove]').forEach(button => { button.onclick = async () => {
    if (!canEdit()) return;
    const person = member(button.dataset.remove);
    if (!person || !confirm(`Remove ${person.name}? Their tasks will be kept and marked unassigned.`)) return;
    state.tasks.forEach(task => { if (task.memberId === person.id) task.memberId = ''; });
    state.members = state.members.filter(item => item.id !== person.id);
    if (await save()) { render(); saved('Member removed; their tasks are now unassigned'); }
  }; });
}
function canEdit() {
  if (!isAdmin()) { toast('Your Viewer role provides read-only access.'); return false; }
  if (busy || !ready) { toast('The workspace is syncing. Try again in a moment.'); return false; }
  if (stale) { toast('Reconnect before making another change.', true); return false; }
  return true;
}
function openDialog(html) {
  const dialog = $('#editor');
  if (!dialog.open) dialogReturnFocus = document.activeElement;
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  $('#cancel').onclick = () => dialog.close();
}
function notePreview(task) {
  return task.latest_note ? `<div class="latest-note-preview"><strong>Latest note</strong><p>${esc(task.latest_note)}</p><small>${esc(timestamp(task.note_updated_at))} · Sydney</small></div>` : '';
}
function activityHTML(taskId) {
  const entries = (state.activity || []).filter(entry => entry.entity === 'tasks' && entry.record_id === taskId);
  const labels = { latest_note: 'Note', status: 'Status', title: 'Title', description: 'Description', memberId: 'Assignee', member_id: 'Assignee', due: 'Due date', priority: 'Priority' };
  return `<div class="activity-history" tabindex="0" aria-label="Task update history"><h3>Update history</h3>${entries.map(entry => `<article><b>${esc(entry.actor_name || 'Unknown')}</b><time>${esc(timestamp(entry.created_at))} · Sydney</time><p>${entry.action === 'INSERT' ? 'Task created' : entry.action === 'DELETE' ? 'Task deleted' : entry.changes?.latest_note ? 'Added an update' : 'Task updated'}</p>${Object.entries(entry.changes || {}).filter(([key]) => labels[key]).map(([key, value]) => `<p><strong>${labels[key]}:</strong> ${esc(['memberId', 'member_id'].includes(key) ? member(value?.to)?.name || (value?.to ? 'Former member' : 'Unassigned') : value?.to ?? '—')}</p>`).join('')}</article>`).join('') || '<p class="note">No recorded updates yet.</p>'}</div>`;
}
function taskEditor(id) {
  if (!isAdmin()) { if (id) viewerTask(id); return; }
  if (!canEdit()) return;
  const current = id ? state.tasks.find(task => task.id === id) : null;
  if (id && !current) { toast('This task no longer exists.', true); return; }
  const original = current ? structuredClone(current) : null;
  // Keep creation IDs stable if a request commits but its response is lost.
  const draftId = current?.id || crypto.randomUUID();
  openDialog(`<form id="task-form"><h2 id="dialog-title">${current ? 'Edit task' : 'Create a task'}</h2><p class="subtitle">Clear details make the next step easier.</p><label for="title">Task title</label><input id="title" name="title" required maxlength="120" value="${esc(current?.title || '')}" placeholder="What needs to be done?"><label for="description">Description</label><textarea id="description" name="description" maxlength="10000" placeholder="Add context, details, or links…">${esc(current?.description || '')}</textarea><div class="form-row"><div><label for="assignee">Assigned to</label><select id="assignee" name="memberId"><option value="">Unassigned</option>${state.members.map(person => `<option value="${esc(person.id)}" ${(current ? current.memberId : !['all', 'unassigned'].includes(selected) ? selected : '') === person.id ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}</select></div><div><label for="due">Due date · Sydney</label><input id="due" type="date" name="due" required value="${esc(current?.due || today())}"></div></div><div class="form-row"><div><label for="status">Status</label><select id="status" name="status">${statuses.map(status => `<option ${current?.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div><div><label for="priority">Priority</label><select id="priority" name="priority">${priorities.map(priority => `<option ${current?.priority === priority ? 'selected' : ''}>${priority}</option>`).join('')}</select></div></div><div id="note-preview">${current ? notePreview(current) : ''}</div><label for="latest-note">Add an update</label><textarea id="latest-note" name="note" maxlength="3000" placeholder="What’s the latest on this task?"></textarea><small>Leave blank to keep the current note.</small>${current ? '<button type="button" class="secondary save-note-button" id="save-task-note">Save note only</button><div id="task-history"></div>' : ''}<div class="actions">${current ? '<button type="button" class="danger" id="delete-task">Delete task</button>' : ''}<button type="button" class="secondary" id="cancel">Cancel</button><button class="primary" type="submit">Save task</button></div></form>`);
  if (current) {
    $('#task-history').innerHTML = activityHTML(id);
    $('#save-task-note').onclick = async () => {
      if (!canEdit()) return;
      const note = $('#latest-note').value.trim();
      if (!note) { $('#latest-note').focus(); toast('Enter an update first.'); return; }
      const task = state.tasks.find(task => task.id === id);
      if (!task) { toast('This task no longer exists.', true); return; }
      task.latest_note = note; task.note_updated_at = new Date().toISOString();
      if (!await save()) { $('#task-history').innerHTML = activityHTML(id); return; }
      $('#latest-note').value = ''; $('#task-history').innerHTML = activityHTML(id);
      const updated = state.tasks.find(task => task.id === id);
      $('#note-preview').innerHTML = updated ? notePreview(updated) : '';
      render(); saved('Note saved');
    };
  }
  $('#task-form').onsubmit = async event => {
    event.preventDefault(); if (!canEdit()) return;
    const data = Object.fromEntries(new FormData(event.target)); data.title = data.title.trim();
    if (!data.title) { $('#title').setCustomValidity('Enter a task title.'); $('#title').reportValidity(); return; }
    if (!statuses.includes(data.status) || !priorities.includes(data.priority) || data.memberId && !member(data.memberId)) { toast('Choose a valid status, priority, and assignee.', true); return; }
    const note = data.note.trim(); delete data.note;
    const existingTask = state.tasks.find(task => task.id === draftId);
    if (current && !existingTask) { toast('This task no longer exists.', true); return; }
    const task = existingTask || { id: draftId, latest_note: '', note_updated_at: null };
    // A separate note save reloads current data. Preserve fields the editor has not changed.
    for (const [key, value] of Object.entries(data)) if (!original || value !== (original[key] ?? '')) task[key] = value;
    if (note) { task.latest_note = note; task.note_updated_at = new Date().toISOString(); }
    if (!existingTask) state.tasks.push(task);
    if (!await save()) return;
    $('#editor').close(); render(); saved('Task saved');
  };
  $('#title').oninput = () => $('#title').setCustomValidity('');
  $('#delete-task')?.addEventListener('click', async () => {
    if (!canEdit() || !confirm('Delete this task? This cannot be undone.')) return;
    state.tasks = state.tasks.filter(task => task.id !== id);
    if (await save()) { $('#editor').close(); render(); saved('Task deleted'); }
  });
}
function notesEditor(id) {
  if (!isAdmin()) { viewerTask(id); return; }
  if (!canEdit()) return;
  const task = state.tasks.find(task => task.id === id); if (!task) return;
  openDialog(`<form id="notes-form"><h2 id="dialog-title">Task notes</h2><p class="subtitle">${esc(task.title)}</p>${notePreview(task)}${activityHTML(id)}<label for="note-text">New update</label><textarea id="note-text" name="note" maxlength="3000" required placeholder="Share progress or the next step…"></textarea><small>Saved updates appear in the task history.</small><div class="actions"><button type="button" class="secondary" id="cancel">Close</button><button class="primary" type="submit">Save note</button></div></form>`);
  $('#notes-form').onsubmit = async event => {
    event.preventDefault(); if (!canEdit()) return;
    const note = new FormData(event.target).get('note').trim();
    if (!note) { $('#note-text').setCustomValidity('Enter an update.'); $('#note-text').reportValidity(); return; }
    const task = state.tasks.find(task => task.id === id); if (!task) { toast('This task no longer exists.', true); return; }
    task.latest_note = note; task.note_updated_at = new Date().toISOString();
    if (await save()) { $('#editor').close(); render(); saved('Note saved'); }
  };
  $('#note-text').oninput = () => $('#note-text').setCustomValidity('');
}
function memberEditor(id) {
  if (!canEdit()) return;
  const existing = id ? member(id) : null; if (id && !existing) return;
  const draftId = existing?.id || crypto.randomUUID();
  openDialog(`<form id="member-form"><h2 id="dialog-title">${existing ? 'Edit team member' : 'Add team member'}</h2><p class="subtitle">Give your team’s work a familiar face.</p><label for="name">Full name</label><input id="name" name="name" required maxlength="70" value="${esc(existing?.name || '')}" placeholder="e.g. Alex Morgan"><label for="role">Role</label><select id="role" name="role">${roles.map(role => `<option ${existing?.role === role ? 'selected' : ''}>${role}</option>`).join('')}</select><small>Roles are labels; they do not restrict access.</small><div class="actions"><button type="button" class="secondary" id="cancel">Cancel</button><button type="submit" class="primary">${existing ? 'Save changes' : 'Add member'}</button></div></form>`);
  $('#member-form').onsubmit = async event => {
    event.preventDefault(); if (!canEdit()) return;
    const data = Object.fromEntries(new FormData(event.target)); data.name = data.name.trim();
    if (!data.name) { $('#name').setCustomValidity('Enter a name.'); $('#name').reportValidity(); return; }
    if (!roles.includes(data.role)) return;
    const person = member(draftId);
    if (existing && !person) { toast('This member no longer exists.', true); return; }
    if (person) Object.assign(person, data);
    else state.members.push({ ...data, id: draftId });
    if (await save()) { $('#editor').close(); render(); saved(existing ? 'Member updated' : 'Member added'); }
  };
  $('#name').oninput = () => $('#name').setCustomValidity('');
}

function recordLocalChanges(before, after) {
  const entries = [];
  for (const collection of ['tasks', 'members', 'trackers']) {
    for (const item of after[collection]) {
      const old = before[collection].find(row => row.id === item.id), changes = {};
      for (const key of Object.keys(item)) if (key !== 'id' && key !== 'note_updated_at' && (!old || item[key] !== old[key] || key === 'latest_note' && item.note_updated_at !== old.note_updated_at)) changes[key] = { from: old?.[key] ?? null, to: item[key] };
      if (!old || Object.keys(changes).length) entries.push({ id: crypto.randomUUID(), record_id: item.id, entity: collection, action: old ? 'UPDATE' : 'INSERT', actor_name: visitorName, created_at: new Date().toISOString(), record_title: item.title || item.name, changes });
    }
    for (const old of before[collection]) if (!after[collection].some(item => item.id === old.id)) entries.push({ id: crypto.randomUUID(), record_id: old.id, entity: collection, action: 'DELETE', actor_name: visitorName, created_at: new Date().toISOString(), record_title: old.title || old.name, changes: {} });
  }
  after.activity = [...entries.reverse(), ...(before.activity || [])];
}
function taskExportText(tasks) {
  const groups = new Map();
  for (const task of tasks) { const key = task.memberId || ''; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(task); }
  const lines = ['AZZURRO WORKSPACE — TASK EXPORT', `Exported by: ${visitorName}`, `Exported at: ${timestamp(new Date().toISOString())} (Australia/Sydney)`, `Scope: ${scope} · ${selected === 'all' ? 'Everyone' : member(selected)?.name || 'Unassigned'}${query ? ' · Search: ' + query : ''}`, ''];
  for (const [id, tasks] of [...groups].sort(([a], [b]) => (member(a)?.name || 'Unassigned').localeCompare(member(b)?.name || 'Unassigned'))) {
    lines.push('='.repeat(54), `NAME: ${member(id)?.name || 'Unassigned'}`, `ROLE: ${member(id)?.role || '—'}`, `TASKS: ${tasks.length}`, '='.repeat(54), '');
    tasks.sort(sortTasks).forEach((task, index) => {
      lines.push(`${index + 1}. ${task.title}`, `Status: ${task.status}`, `Due date: ${task.due || 'Not set'}`, `Priority: ${task.priority}`, `Description: ${task.description || '—'}`, `Latest note: ${task.latest_note || 'No notes yet'}`);
      if (task.latest_note) {
        const entry = state.activity.filter(entry => entry.entity === 'tasks' && entry.record_id === task.id && entry.changes?.latest_note?.to === task.latest_note).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        lines.push(`Updated by: ${entry?.actor_name || 'Not recorded'}`, `Updated at: ${timestamp(entry?.created_at || task.note_updated_at)} (Sydney)`);
      }
      lines.push('');
    });
  }
  return lines.join('\r\n');
}
function exportTasks() {
  const tasks = filteredTasks(); if (!tasks.length) { toast('No tasks to export in this view.'); return; }
  const blob = new Blob(['\ufeff' + taskExportText(tasks)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  const name = selected === 'all' ? 'everyone' : member(selected)?.name || 'unassigned';
  link.href = url; link.download = `tasks-${name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, '-')}-${today()}.txt`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Tasks exported by name');
}

document.querySelectorAll('nav button').forEach(button => { button.onclick = () => navigate(button.dataset.view); });
window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (['dashboard', 'board', 'members', 'users', 'trackers'].includes(next)) { view = next; render(); } });
$('#editor').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
$('#editor').addEventListener('close', () => { if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus({ preventScroll: true }); else $('#content').focus({ preventScroll: true }); });
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey || event.altKey) || $('#editor').open || !visitorName || event.target.matches('input,textarea,select,[contenteditable]')) return;
  if (event.key === '/' && view === 'board') { event.preventDefault(); $('#search').focus(); }
  if (event.key.toLowerCase() === 'n') { event.preventDefault(); taskEditor(); }
});
initSidebar();
initializeAccess();
if (FormaStore.enabled) { if (!sharedNameMode) WorkspaceAuth.onSignOut(() => clearAccess()); setInterval(() => refresh(), 30000); window.addEventListener('focus', () => refresh()); }
