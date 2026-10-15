const sharedNameMode = FormaStore.enabled && window.FORMA_CONFIG?.accessMode === 'shared-name';
const demoMode = !FormaStore.enabled && window.FORMA_CONFIG?.preview === true && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
function icon(name, className = '') {
  const paths = {
    dashboard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    board: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M15 4v16M5.5 8h1M11.5 8h1M17.5 8h1"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 9-5M18 12l4 2v3c0 3-4 5-4 5s-4-2-4-5v-3z"/>',
    folder: '<path d="M3 20V5a1 1 0 0 1 1-1h6l2 3h8a1 1 0 0 1 1 1v12z"/><path d="M3 11h18"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M14 9l-3 3 3 3"/>',
    expand: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M13 9l3 3-3 3"/>',
    sheet: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7M12 10v9"/>',
    doc: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>',
    slides: '<rect x="3" y="4" width="18" height="14" rx="1"/><path d="M8 22l4-4 4 4M8 9h8M8 13h4"/>',
    form: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h1M12 8h4M8 12h1M12 12h4M8 16h1M12 16h4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 .2l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.2l-3 3a5 5 0 0 0 7 7l2-2"/>',
    arrow: '<path d="M6 18L18 6M6 6h12v12"/>',
    repeat: '<path d="M4 7h14l-3-3M20 17H6l3 3M20 7v5M4 17v-5"/>',
    tools: '<path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4z"/>',
    cart: '<path d="M3 4h3l3 12h10l3-8H7M10 21h1M18 21h1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M5 12l4 4L20 5"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>'
  };
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.doc}</svg>`;
}
function initSidebar() {
  const button = $('#sidebar-toggle');
  let collapsed = storage.get('localStorage', 'azzurro-sidebar-collapsed') === 'true';
  function apply(restoreFocus = false) {
    const destination = $(collapsed ? '#sidebar-reopen' : '#sidebar-toggle-home');
    destination.append(button);
    $('#sidebar-reopen').hidden = !collapsed;
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    $('#workspace-sidebar').hidden = collapsed;
    button.innerHTML = icon(collapsed ? 'expand' : 'panel') + (collapsed ? '' : '<span>Hide sidebar</span>');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
    button.title = collapsed ? 'Show sidebar' : 'Hide sidebar';
    if (restoreFocus) button.focus({ preventScroll: true });
  }
  button.onclick = () => { collapsed = !collapsed; storage.set('localStorage', 'azzurro-sidebar-collapsed', String(collapsed)); apply(true); };
  document.querySelectorAll('[data-nav-icon]').forEach(node => { node.innerHTML = icon(node.dataset.navIcon); });
  apply();
}
function noteMeta(task) {
  if (!task.latest_note) return '';
  const date = new Date(task.note_updated_at);
  if (!task.note_updated_at || Number.isNaN(date.getTime())) return '<p class="note-time">Update time not recorded</p>';
  const label = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
  return `<p class="note-time">${icon('clock')}<span>Update added on <time datetime="${esc(date.toISOString())}" title="${esc(timestamp(date))} · Sydney">${esc(label)}</time><span class="time-zone"> Sydney</span></span></p>`;
}
function setupScreen() {
  document.body.classList.add('welcome-mode');
  $('#content').innerHTML = '<div class="welcome-card"><span class="brand-mark">a</span><h1>Workspace setup required</h1><p class="subtitle">Staff sign-in is not configured. Ask your administrator to check the workspace connection.</p></div>';
}
