const id = '00000000-0000-4000-8000-000000000001';
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', email_confirmed_at: '2026-10-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-10-01T00:00:00Z' };
const expires = Math.floor(Date.now()/1000) + 3600;
const token = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:id,email:user.email,role:'authenticated',exp:expires})).toString('base64url'),'test-signature'].join('.');
const session = { access_token:token,refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,expires_at:expires,user };
const profile = { email:user.email,username:'vivek',display_name:'Vivek',role:'admin' };
module.exports = { user,session,profile };
