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

  const jwt = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!jwt || !url || !anonKey || !serviceRoleKey) return json({ error: 'Account updates are unavailable.' }, 503, origin)

  let input: { email?: unknown; display_name?: unknown; password?: unknown }
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Enter valid account details.' }, 400, origin)
    input = body as typeof input
  } catch { return json({ error: 'Enter valid account details.' }, 400, origin) }

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const displayName = typeof input.display_name === 'string' ? input.display_name.trim() : ''
  const username = displayName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '').slice(0, 32).replace(/[._-]+$/g, '')
  const password = typeof input.password === 'string' ? input.password : ''
  const passwordBytes = new TextEncoder().encode(password).length
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'This account could not be found.' }, 400, origin)
  if (!displayName || displayName.length > 70 || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return json({ error: 'Use a name with at least 3 letters or numbers.' }, 400, origin)
  if (password && (password.length < 8 || passwordBytes > 72)) return json({ error: 'Use a password from 8 to 72 bytes.' }, 400, origin)

  const caller = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: identity, error: identityError } = await caller.auth.getUser(jwt)
  const callerEmail = identity.user?.email?.trim().toLowerCase()
  if (identityError || !callerEmail || !identity.user?.email_confirmed_at) return json({ error: 'Sign in again with a verified account.' }, 401, origin)

  const { data: callerAccess, error: callerError } = await service.from('workspace_access').select('role').eq('email', callerEmail).maybeSingle()
  if (callerError) return json({ error: 'Unable to verify administrator access.' }, 503, origin)
  if (callerAccess?.role !== 'admin') return json({ error: 'Administrator access is required.' }, 403, origin)

  const { data: target, error: targetError } = await service.from('workspace_access').select('email,username,display_name,role').eq('email', email).maybeSingle()
  if (targetError) return json({ error: 'Unable to load this account.' }, 503, origin)
  if (!target) return json({ error: 'This account could not be found.' }, 404, origin)
  const { data: collision, error: collisionError } = await service.from('workspace_access').select('email').eq('username', username).neq('email', email).maybeSingle()
  if (collisionError) return json({ error: 'Unable to verify the name. Please try again.' }, 503, origin)
  if (collision) return json({ error: 'That name already has access.' }, 409, origin)

  let authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return json({ error: 'Unable to update the account. Please try again.' }, 503, origin)
    authUser = data.users.find(user => user.email?.toLowerCase() === email) ?? null
    if (authUser || data.users.length < 1000) break
  }
  if (!authUser) return json({ error: 'This account could not be found in sign-in records.' }, 404, origin)

  const adminSession = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: updatedAccess, error: accessUpdateError } = await adminSession.from('workspace_access')
    .update({ username, display_name: displayName }).eq('email', email).eq('username', target.username).select('email').maybeSingle()
  if (accessUpdateError || !updatedAccess) return json({ error: 'Unable to save these account details.' }, 409, origin)

  const authChanges: { password?: string; user_metadata: Record<string, unknown> } = {
    user_metadata: { ...(authUser.user_metadata ?? {}), display_name: displayName, username },
  }
  if (password) authChanges.password = password
  const { error: authUpdateError } = await service.auth.admin.updateUserById(authUser.id, authChanges)
  if (authUpdateError) {
    const { data: rolledBack, error: rollbackError } = await adminSession.from('workspace_access')
      .update({ username: target.username, display_name: target.display_name }).eq('email', email).select('email').maybeSingle()
    if (rollbackError || !rolledBack) return json({ error: 'Sign-in details could not be updated and access details need administrator review.' }, 500, origin)
    return json({ error: 'Sign-in details could not be updated. No account details were changed.' }, 409, origin)
  }

  return json({ user: { username, display_name: displayName, role: target.role } }, 200, origin)
})
