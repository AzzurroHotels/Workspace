// Only public configuration belongs here. Access is enforced by database RLS.
window.WorkspaceAuth = (() => {
  const config = window.FORMA_CONFIG || {};
  const enabled = Boolean(config.supabaseUrl && config.supabasePublishableKey) && config.accessMode !== 'shared-name';
  const userCreationEnabled = Boolean(config.userCreationEnabled);
  function loginName(value) {
    return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '').slice(0, 32).replace(/[._-]+$/g, '');
  }
  const client = enabled ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { storageKey: 'azzurro-staff-auth', flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
  }) : null;
  let profile = null;
  async function token() {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.access_token) throw new Error('Please sign in to access the workspace.');
    return data.session.access_token;
  }
  async function verify() {
    const { data: session, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session.session) { profile = null; return null; }
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user?.email_confirmed_at) { profile = null; throw new Error('This account is not confirmed yet. Ask an administrator to finish setup.'); }
    const email = data.user.email.toLowerCase();
    const response = await fetch(config.supabaseUrl.replace(/\/$/, '') + '/rest/v1/workspace_access?' + new URLSearchParams({ select: 'email,username,display_name,role', email: 'eq.' + email }), {
      headers: { apikey: config.supabasePublishableKey, Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('Unable to verify workspace access. Please try again.');
    const rows = await response.json();
    profile = Array.isArray(rows) ? rows.find(row => row.email === email && ['admin', 'viewer'].includes(row.role)) : null;
    if (!profile) { const denied = new Error('This account does not have workspace access. Ask an administrator to add it in Users.'); denied.accessDenied = true; throw denied; }
    return profile;
  }
  async function signIn(username, password) {
    const { data, error } = await client.functions.invoke('workspace-sign-in', { body: { username: loginName(username), password } });
    if (error || !data?.session?.access_token || !data.session.refresh_token) throw new Error('Name or password is incorrect.');
    const { error: sessionError } = await client.auth.setSession(data.session);
    if (sessionError) throw sessionError;
  }
  async function createUser(user) {
    if (!userCreationEnabled) throw new Error('Administrator account creation is not enabled yet.');
    const { data, error } = await client.functions.invoke('create-workspace-user', { body: user });
    if (error || data?.error) throw new Error(data?.error || 'Unable to create this account. Check the name and password requirements, then try again.');
    return data;
  }
  async function updateUser(user) {
    const { data, error } = await client.functions.invoke('update-workspace-user', { body: user });
    if (error || data?.error) throw new Error(data?.error || 'Unable to update this account. Please try again.');
    return data;
  }
  async function signOut() {
    // Local scope always clears this browser, including when a token was revoked.
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    profile = null;
  }
  function onSignOut(callback) {
    return client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') { profile = null; callback(); } });
  }
  return { enabled, userCreationEnabled, loginName, token, verify, signIn, createUser, updateUser, signOut, onSignOut, get profile() { return profile; } };
})();
