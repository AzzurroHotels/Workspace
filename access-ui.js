let authProfile = null, authGeneration = 0, authStarting = false;
let usersCache = [], usersGeneration = 0;
// Shared entry retains existing editing behavior; it is not authenticated admin access.
const isAdmin = () => demoMode || sharedNameMode || authProfile?.role === 'admin';
const canManageUsers = () => !sharedNameMode && isAdmin();
function nameScreen() {
  document.body.classList.add('welcome-mode');
  $('#content').innerHTML = `<div class="welcome-card"><p class="eyebrow">Azzurro Workspace</p><h1>A good day starts here.</h1><p class="subtitle">Enter your name so your team can see who added each update.</p><form id="name-form"><label for="visitor-name">Your name</label><input id="visitor-name" autocomplete="name" required maxlength="70" placeholder="Your name"><button class="primary" type="submit">Open workspace</button></form></div>`;
  $('#name-form').onsubmit = async event => {
    event.preventDefault();
    const input = $('#visitor-name'), name = input.value.trim();
    if (!name) { input.setCustomValidity('Enter your name.'); input.reportValidity(); return; }
    input.setCustomValidity(''); visitorName = name;
    storage.set('sessionStorage', 'forma-visitor', name);
    await initializeAccess();
  };
  $('#visitor-name').oninput = event => event.target.setCustomValidity('');
}
function clearAccess(message = '') {
  authGeneration++;
  authProfile = null; visitorName = ''; state = emptyState(); baseline = emptyState();
  usersCache = []; ready = false; stale = false; setBusy(false);
  if ($('#editor').open) $('#editor').close();
  $('#visitor-bar').innerHTML = '';
  loginScreen(message);
}
function loginScreen(message = '') {
  if (sharedNameMode) { nameScreen(); return; }
  document.body.classList.add('welcome-mode');
  $('#content').innerHTML = `<div class="welcome-card"><div class="welcome-logo"><span class="brand-mark" aria-hidden="true">a</span>Azzurro Workspace</div><p class="eyebrow">Staff access</p><h1>Welcome to your workspace.</h1><p class="subtitle">Sign in with your approved email to see your team’s tasks and updates.</p><form id="login-form"><label for="login-email">Work email</label><input id="login-email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"><button class="primary" type="submit" ${authStarting ? 'disabled' : ''}>${authStarting ? 'Checking your session…' : 'Email me a sign-in link'}</button></form><p id="auth-message" class="auth-message" role="status">${esc(message)}</p><small>Only users added by an administrator can access this workspace. Your link opens securely in this browser.</small><div class="auth-actions"><button class="text-button" id="retry-access">Check access again</button><button class="text-button" id="reset-session">Use another email</button></div></div>`;
  $('#login-form').onsubmit = async event => {
    event.preventDefault(); const button = event.target.querySelector('button');
    button.disabled = true; $('#auth-message').textContent = 'Sending your sign-in link…';
    try {
      await WorkspaceAuth.signIn($('#login-email').value);
      $('#auth-message').textContent = 'Check your inbox. Open the sign-in link in this browser to continue. If access has not been granted, ask your administrator to add your email.';
    } catch (error) { $('#auth-message').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('#retry-access').onclick = () => initializeAccess();
  $('#reset-session').onclick = async () => { try { await WorkspaceAuth.signOut(); clearAccess(); } catch (error) { $('#auth-message').textContent = error.message; } };
}
async function initializeAccess() {
  if (sharedNameMode) {
    if (!visitorName) { nameScreen(); return; }
    render(); await refresh(true); return;
  }
  if (!FormaStore.enabled) { if (demoMode) render(); else setupScreen(); return; }
  const generation = ++authGeneration;
  authStarting = true; loginScreen();
  try {
    const profile = await WorkspaceAuth.verify();
    if (generation !== authGeneration) return;
    authStarting = false;
    if (!profile) { loginScreen(); return; }
    authProfile = profile; visitorName = profile.display_name; ready = false;
    render(); await refresh(true);
  } catch (error) { if (generation === authGeneration) { authStarting = false; clearAccess(error.message); } }
}
function viewerTask(id) {
  const task = state.tasks.find(item => item.id === id); if (!task || !ready) return;
  openDialog(`<h2 id="dialog-title">${esc(task.title)}</h2><p class="subtitle">Task details · Read-only access</p><div class="task-facts">${badge(task.status)} ${priorityBadge(task.priority)}<p>Assigned to <b>${esc(member(task.memberId)?.name || 'Unassigned')}</b></p><p>Due ${esc(dateLabel(task.due, true))}</p></div><p class="read-description">${esc(task.description || 'No description')}</p>${notePreview(task)}${activityHTML(id)}<div class="actions"><button type="button" class="secondary" id="cancel">Close</button></div>`);
}
async function users() {
  if (!canManageUsers()) return;
  const generation = ++usersGeneration;
  $('#body').innerHTML = '<div class="panel access-intro"><h2>Choose who can access your workspace.</h2><p><b>Admin</b> can manage tasks, members, trackers, and user access. <b>Viewer</b> can read tasks, notes, and history, open trackers, and export reports.</p><p>Adding a user grants access to their verified email. It does not send an invitation.</p></div><div id="users-list" role="status">Loading users…</div>';
  try {
    if (FormaStore.enabled) usersCache = await FormaStore.users();
    else {
      const savedUsers = storage.get('localStorage', 'azzurro-demo-users');
      usersCache = savedUsers ? JSON.parse(savedUsers) : [{ email: 'preview@example.com', display_name: visitorName, role: 'admin' }];
      if (!Array.isArray(usersCache)) throw new Error('Local user preview could not be loaded.');
    }
    if (generation !== usersGeneration || view !== 'users' || !isAdmin() || !$('#users-list')) return;
    $('#users-list').innerHTML = `<div class="users-grid">${usersCache.map(user => `<article class="panel user-card"><div class="member-top"><span class="avatar">${esc(initials(user.display_name))}</span><span class="access-role ${user.role === 'admin' ? 'admin' : 'viewer'}">${user.role === 'admin' ? 'Admin' : 'Viewer'}</span></div><h3>${esc(user.display_name)}</h3><p class="user-email">${esc(user.email)}</p><p class="note">${user.role === 'admin' ? 'Manage tasks, people, and access' : 'Read and export workspace information'}</p><div class="member-actions"><button class="secondary" data-edit-user="${esc(user.email)}">Edit access</button>${user.email === (authProfile?.email || 'preview@example.com') ? '<span class="pill">You</span>' : `<button class="danger" data-remove-user="${esc(user.email)}">Remove access</button>`}</div></article>`).join('') || '<p class="empty">No users found.</p>'}</div>${FormaStore.enabled ? '' : '<p class="note">Local preview only. These users do not have access to the shared database.</p>'}`;
    document.querySelectorAll('[data-edit-user]').forEach(button => { button.onclick = () => userEditor(button.dataset.editUser); });
    document.querySelectorAll('[data-remove-user]').forEach(button => { button.onclick = async () => {
      const user = usersCache.find(item => item.email === button.dataset.removeUser);
      if (!user || !canEdit() || !confirm(`Remove access for ${user.email}? Their tasks and history will be kept.`)) return;
      await mutateUser(async () => {
        if (FormaStore.enabled) await FormaStore.removeUser(user);
        else persistDemoUsers(usersCache.filter(item => item.email !== user.email));
      }, 'User access removed');
    }; });
  } catch (error) {
    if (generation !== usersGeneration || view !== 'users' || !$('#users-list')) return;
    $('#users-list').innerHTML = `<div class="connection-panel"><p>${esc(error.message)}</p><button class="secondary" id="retry-users">Retry loading users</button></div>`;
    $('#retry-users').onclick = users;
  }
}
function persistDemoUsers(next) {
  if (!storage.set('localStorage', 'azzurro-demo-users', JSON.stringify(next))) throw new Error('User preview could not be saved in this browser.');
}
async function mutateUser(action, message) {
  setBusy(true);
  try { await action(); if ($('#editor').open) $('#editor').close(); setBusy(false); render(); toast(message); }
  catch (error) { setBusy(false); toast(error.message + ' Refresh Users before retrying if the connection was interrupted.', true); }
}
function userEditor(email) {
  if (!canEdit()) return;
  const user = usersCache.find(item => item.email === email);
  const self = user?.email === (authProfile?.email || 'preview@example.com');
  openDialog(`<form id="user-form"><h2 id="dialog-title">${user ? 'Edit user access' : 'Add a user'}</h2><p class="subtitle">Give the right people the right level of access.</p><label for="user-name">Name</label><input id="user-name" name="display_name" required maxlength="70" value="${esc(user?.display_name || '')}"><label for="user-email">Email</label><input id="user-email" type="email" name="email" required maxlength="254" value="${esc(user?.email || '')}" ${user ? 'readonly' : ''} autocomplete="off"><label for="user-role">Access role</label><select id="user-role" name="role" ${self ? 'disabled' : ''}><option value="viewer" ${user?.role !== 'admin' ? 'selected' : ''}>Viewer — read and export</option><option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Admin — manage workspace and users</option></select><p class="note">${self ? 'You cannot remove or downgrade your own administrator access.' : 'The user will sign in with this exact email. Adding access does not send an email.'}</p><div class="actions"><button type="button" class="secondary" id="cancel">Cancel</button><button class="primary" type="submit">${user ? 'Save access' : 'Add user'}</button></div></form>`);
  $('#user-form').onsubmit = async event => {
    event.preventDefault(); if (!canEdit()) return;
    const data = Object.fromEntries(new FormData(event.target));
    data.email = data.email.trim().toLowerCase(); data.display_name = data.display_name.trim();
    if (self) data.role = 'admin';
    if (!data.display_name) { $('#user-name').setCustomValidity('Enter a name.'); $('#user-name').reportValidity(); return; }
    if (!['admin', 'viewer'].includes(data.role)) return;
    await mutateUser(async () => {
      if (FormaStore.enabled) await FormaStore.saveUser(data, user);
      else {
        if (!user && usersCache.some(item => item.email === data.email)) throw new Error('This email already has access.');
        persistDemoUsers(user ? usersCache.map(item => item.email === user.email ? data : item) : [...usersCache, data]);
      }
      if (self && authProfile) { authProfile.display_name = data.display_name; visitorName = data.display_name; }
    }, user ? 'User access updated' : 'User added. They can sign in with their approved email.');
  };
  $('#user-name').oninput = () => $('#user-name').setCustomValidity('');
}
