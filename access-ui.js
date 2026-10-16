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
  $('#content').innerHTML = `<div class="welcome-card"><div class="welcome-logo">Azzurro Workspace</div><p class="eyebrow">Staff access</p><h1>Welcome to your workspace.</h1><p class="subtitle">Sign in with the name and password created for you by an administrator.</p><form id="login-form"><label for="login-username">Name</label><input id="login-username" name="username" autocomplete="username" required minlength="3" maxlength="70" placeholder="Your name"><label for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="72" placeholder="Your password"><button class="primary" id="auth-submit" type="submit" ${authStarting ? 'disabled' : ''}>${authStarting ? 'Checking your session…' : 'Sign in'}</button></form><p id="auth-message" class="auth-message" role="status">${esc(message)}</p><small>Only accounts created by an administrator can enter. This browser remembers your session subject to the workspace security policy.</small><div class="auth-actions"><button class="text-button" id="retry-access" type="button">Check access again</button><button class="text-button" id="reset-session" type="button">Use another account</button></div></div>`;
  $('#login-form').onsubmit = async event => {
    event.preventDefault();
    const form = event.target, button = $('#auth-submit');
    button.disabled = true; $('#auth-message').textContent = 'Signing in…';
    try {
      await WorkspaceAuth.signIn($('#login-username').value, $('#login-password').value);
      authStarting = true; await initializeAccess();
    } catch (error) { $('#auth-message').textContent = error.message; }
    finally { if (form.isConnected) button.disabled = false; }
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
  $('#body').innerHTML = '<div class="panel access-intro"><h2>Workspace access</h2><p>Add each person with a name and password. Admins can manage the workspace; viewers can read and export. Passwords are never stored in workspace records.</p></div><div id="users-list" role="status">Loading users…</div>';
  try {
    if (FormaStore.enabled) usersCache = await FormaStore.users();
    else {
      const savedUsers = storage.get('localStorage', 'azzurro-demo-users');
      usersCache = savedUsers ? JSON.parse(savedUsers) : [{ email: 'preview@example.com', username: 'preview', display_name: visitorName, role: 'admin' }];
      if (!Array.isArray(usersCache)) throw new Error('Local user preview could not be loaded.');
    }
    if (generation !== usersGeneration || view !== 'users' || !isAdmin() || !$('#users-list')) return;
    $('#users-list').innerHTML = `<div class="users-grid">${usersCache.map(user => { const self = user.email === (authProfile?.email || 'preview@example.com'); return `<article class="panel user-card"><div class="member-top"><span class="avatar">${esc(initials(user.display_name))}</span><span class="access-role ${user.role === 'admin' ? 'admin' : 'viewer'}">${user.role === 'admin' ? 'Admin' : 'Viewer'}</span></div><h3>${esc(user.display_name)}</h3><p class="note">${user.role === 'admin' ? 'Manage the workspace' : 'Read and export workspace information'}</p><div class="member-actions"><button class="secondary" data-edit-user="${esc(user.email)}">Edit name / password</button>${self ? '<span class="pill">You</span>' : `<button class="secondary" data-change-role="${esc(user.email)}" data-next-role="${user.role === 'admin' ? 'viewer' : 'admin'}">Make ${user.role === 'admin' ? 'viewer' : 'admin'}</button><button class="danger" data-remove-user="${esc(user.email)}">Remove access</button>`}</div></article>`; }).join('') || '<p class="empty">No users found.</p>'}</div>${FormaStore.enabled ? '' : '<p class="note">Local preview only. These accounts do not sign in to the shared workspace.</p>'}`;
    $('#copy-view').disabled = false;
    document.querySelectorAll('[data-edit-user]').forEach(button => { button.onclick = () => userEditor(button.dataset.editUser); });
    document.querySelectorAll('[data-change-role]').forEach(button => { button.onclick = async () => {
      const user = usersCache.find(item => item.email === button.dataset.changeRole);
      if (!user || !canEdit()) return;
      const updated = { ...user, role: button.dataset.nextRole };
      await mutateUser(async () => {
        if (FormaStore.enabled) await FormaStore.saveUser(updated, user);
        else persistDemoUsers(usersCache.map(item => item.email === user.email ? updated : item));
      }, `Access changed to ${updated.role === 'admin' ? 'Admin' : 'Viewer'}`);
    }; });
    document.querySelectorAll('[data-remove-user]').forEach(button => { button.onclick = async () => {
      const user = usersCache.find(item => item.email === button.dataset.removeUser);
      if (!user || !canEdit() || !confirm(`Remove access for ${user.display_name}? Their tasks and history will be kept.`)) return;
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
function userCopyText() {
  if (!Array.isArray(usersCache)) return '';
  const lines = [`Approved accounts: ${usersCache.length}`, ''];
  for (const user of usersCache) lines.push(`${user.display_name} · ${user.role === 'admin' ? 'Admin' : 'Viewer'}`, `  Login name: ${user.username || WorkspaceAuth.loginName(user.display_name)}`, '');
  return copyDocument('Workspace users', lines);
}
function persistDemoUsers(next) {
  if (!storage.set('localStorage', 'azzurro-demo-users', JSON.stringify(next))) throw new Error('User preview could not be saved in this browser.');
}
async function mutateUser(action, message) {
  setBusy(true);
  try { await action(); if ($('#editor').open) $('#editor').close(); setBusy(false); render(); toast(message); }
  catch (error) { setBusy(false); toast(error.message + ' Refresh Users before retrying if the connection was interrupted.', true); }
}
function userEditor(email, role = 'viewer') {
  if (!canEdit()) return;
  const user = usersCache.find(item => item.email === email);
  const self = user?.email === (authProfile?.email || 'preview@example.com');
  if (!user && FormaStore.enabled && !WorkspaceAuth.userCreationEnabled) { toast('Password account creation is not configured yet.'); return; }
  const createLogin = !user && FormaStore.enabled && WorkspaceAuth.userCreationEnabled;
  const selectedRole = user?.role || role;
  openDialog(`<form id="user-form"><h2 id="dialog-title">${user ? 'Edit user' : `Add ${selectedRole} account`}</h2><label for="user-name">Name</label><input id="user-name" name="display_name" required maxlength="70" autocomplete="username" value="${esc(user?.display_name || '')}" placeholder="Name used to sign in"><label for="user-password">Password</label><input id="user-password" type="password" name="password" ${user ? '' : 'required'} minlength="8" maxlength="72" autocomplete="${user ? 'new-password' : 'new-password'}" placeholder="${user ? 'Leave blank to keep current password' : 'At least 8 characters'}">${user ? '<small>Leave the password empty to keep it unchanged.</small>' : ''}<div class="actions"><button type="button" class="secondary" id="cancel">Cancel</button><button class="primary" type="submit">${user ? 'Save changes' : `Add ${selectedRole}`}</button></div></form>`);
  $('#user-form').onsubmit = async event => {
    event.preventDefault(); if (!canEdit()) return;
    const data = Object.fromEntries(new FormData(event.target));
    data.display_name = data.display_name.trim();
    const username = WorkspaceAuth.loginName(data.display_name);
    if (!data.display_name) { $('#user-name').setCustomValidity('Enter a name.'); $('#user-name').reportValidity(); return; }
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) { $('#user-name').setCustomValidity('Use a name with at least 3 letters or numbers.'); $('#user-name').reportValidity(); return; }
    if (!user && !data.password) { $('#user-password').setCustomValidity('Enter a password.'); $('#user-password').reportValidity(); return; }
    if (data.password && new TextEncoder().encode(data.password).length > 72) { $('#user-password').setCustomValidity('Use a password of at most 72 bytes.'); $('#user-password').reportValidity(); return; }
    data.role = selectedRole;
    await mutateUser(async () => {
      if (FormaStore.enabled && !user && createLogin) await WorkspaceAuth.createUser(data);
      else if (FormaStore.enabled && user) await WorkspaceAuth.updateUser({ email: user.email, display_name: data.display_name, password: data.password });
      else {
        const email = user?.email || `${username}@workspace.invalid`;
        if (!user && usersCache.some(item => item.username === username)) throw new Error('That name already has access.');
        const updated = { email, username, display_name: data.display_name, role: data.role };
        if (user) persistDemoUsers(usersCache.map(item => item.email === user.email ? updated : item));
        else persistDemoUsers([...usersCache, updated]);
      }
      data.password = '';
      if (self && authProfile) { authProfile.display_name = data.display_name; visitorName = data.display_name; }
    }, user ? 'User details updated' : createLogin ? 'Account created. Share the name and password securely.' : 'User added to this local preview.');
  };
  $('#user-name').oninput = () => $('#user-name').setCustomValidity('');
  $('#user-password').oninput = () => $('#user-password').setCustomValidity('');
}
