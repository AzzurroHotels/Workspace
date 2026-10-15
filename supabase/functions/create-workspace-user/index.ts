import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3'

const allowedOrigins = new Set([
  'https://azzurrohotels.github.io',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4175',
])

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
  })
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins.has(origin)) return json({ error: 'Origin is not allowed.' }, 403, 'null')
  if (request.method === 'OPTIONS') return new Response('ok', { headers: {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  } })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin)

  const authorization = request.headers.get('Authorization') ?? ''
  const jwt = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!jwt || !url || !anonKey || !serviceRoleKey) return json({ error: 'Workspace account setup is unavailable.' }, 503, origin)

  let input: { display_name?: unknown; role?: unknown; password?: unknown }
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Enter valid account details.' }, 400, origin)
    input = body as typeof input
  }
  catch { return json({ error: 'Enter valid account details.' }, 400, origin) }
  const displayName = typeof input.display_name === 'string' ? input.display_name.trim() : ''
  const username = displayName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '').slice(0, 32).replace(/[._-]+$/g, '')
  const email = username ? `${username}@workspace.invalid` : ''
  const role = input.role
  const password = typeof input.password === 'string' ? input.password : ''
  const passwordBytes = new TextEncoder().encode(password).length
  if (!displayName || displayName.length > 70) return json({ error: 'Enter a name up to 70 characters.' }, 400, origin)
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return json({ error: 'Use a name with at least 3 letters or numbers.' }, 400, origin)
  if (role !== 'admin' && role !== 'viewer') return json({ error: 'Choose Admin or Viewer access.' }, 400, origin)
  if (password.length < 8 || passwordBytes > 72) return json({ error: 'Use a password from 8 to 72 bytes.' }, 400, origin)

  const caller = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: identity, error: identityError } = await caller.auth.getUser(jwt)
  const callerEmail = identity.user?.email?.trim().toLowerCase()
  if (identityError || !callerEmail || !identity.user?.email_confirmed_at) return json({ error: 'Sign in again with a verified administrator account.' }, 401, origin)

  const { data: access, error: accessError } = await service.from('workspace_access').select('role').eq('email', callerEmail).maybeSingle()
  if (accessError) return json({ error: 'Unable to verify administrator access.' }, 503, origin)
  if (access?.role !== 'admin') return json({ error: 'Administrator access is required.' }, 403, origin)

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, username },
  })
  if (createError || !created.user) return json({ error: createError?.message ?? 'Unable to create this login.' }, 409, origin)

  // Use the administrator's JWT for the membership insert so database RLS and
  // the workspace audit trigger record the verified actor. If it fails, remove
  // the newly-created Auth identity; no password is written to workspace data.
  const adminSession = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { error: membershipError } = await adminSession.from('workspace_access').insert({ email, username, display_name: displayName, role })
  if (membershipError) {
    const { error: rollbackError } = await service.auth.admin.deleteUser(created.user.id)
    if (rollbackError) return json({ error: 'Access could not be saved. The new login needs administrator cleanup.' }, 500, origin)
    return json({ error: 'Access could not be saved. Check that this email does not already have workspace access.' }, 409, origin)
  }

  return json({ user: { username, display_name: displayName, role } }, 201, origin)
})
