// Only public configuration belongs here. Access is enforced by database RLS.
window.WorkspaceAuth = (() => {
  const config = window.FORMA_CONFIG || {};
  const enabled = Boolean(config.supabaseUrl && config.supabasePublishableKey) && config.accessMode !== 'shared-name';
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
    if (!data.user?.email_confirmed_at) { profile = null; throw new Error('Verify your email before entering the workspace.'); }
    const email = data.user.email.toLowerCase();
    const response = await fetch(config.supabaseUrl.replace(/\/$/, '') + '/rest/v1/workspace_access?' + new URLSearchParams({ select: 'email,display_name,role', email: 'eq.' + email }), {
      headers: { apikey: config.supabasePublishableKey, Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('Unable to verify workspace access. Please try again.');
    const rows = await response.json();
    profile = Array.isArray(rows) ? rows.find(row => row.email === email && ['admin', 'viewer'].includes(row.role)) : null;
    if (!profile) { const denied = new Error('This email does not have workspace access. Ask an administrator to add it in Users.'); denied.accessDenied = true; throw denied; }
    return profile;
  }
  async function signIn(email) {
    const { error } = await client.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: new URL('./', location.href).href, shouldCreateUser: true } });
    if (error) throw error;
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
  return { enabled, token, verify, signIn, signOut, onSignOut, get profile() { return profile; } };
})();
