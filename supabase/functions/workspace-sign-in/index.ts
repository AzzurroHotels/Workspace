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

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) return json({ error: 'Workspace sign-in is unavailable.' }, 503, origin)

  let input: { username?: unknown; password?: unknown }
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Enter a name and password.' }, 400, origin)
    input = body as typeof input
  } catch { return json({ error: 'Enter a name and password.' }, 400, origin) }

  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  const passwordBytes = new TextEncoder().encode(password).length
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || password.length < 8 || passwordBytes > 72) {
    return json({ error: 'Name or password is incorrect.' }, 401, origin)
  }

  const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: account, error: lookupError } = await service.from('workspace_access').select('email').eq('username', username).maybeSingle()
  if (lookupError) return json({ error: 'Workspace sign-in is unavailable.' }, 503, origin)

  // Even unknown usernames go through Auth with a fixed dummy identity, keeping
  // the public response uniform and applying Auth's password-attempt limits.
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await auth.auth.signInWithPassword({
    email: account?.email ?? 'unknown@workspace.invalid',
    password,
  })
  if (!account || error || !data.session) return json({ error: 'Name or password is incorrect.' }, 401, origin)

  return json({ session: {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  } }, 200, origin)
})
