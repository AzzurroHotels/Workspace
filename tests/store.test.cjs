const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../store.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const member = { id: 'member-1', name: 'Alex Chen', role: 'Dev', created_at: '2026-10-01T00:00:00Z' };
const task = { id: 'task-1', title: 'Inspect guest rooms', description: null, member_id: member.id, status: 'New', due: '2026-10-15', priority: 'Normal', latest_note: null, note_updated_at: null, created_at: '2026-10-01T00:00:00Z' };

function setup(options = {}) {
  const data = clone({ board_members: [member], board_tasks: [task], board_activity: [], ...options.data });
  const calls = [];
  const fetch = async (url, init) => {
    const parsed = new URL(url), table = parsed.pathname.split('/').pop();
    calls.push({ table, query: parsed.searchParams, ...init });
    if (options.handle && init.method !== 'GET') return options.handle({ parsed, init, data, calls });
    const rows = data[table] || [];
    const offset = Number(parsed.searchParams.get('offset') || 0);
    return { ok: true, status: 200, json: async () => clone(rows.slice(offset, offset + (options.pageSize || 500))) };
  };
  const context = { window: { FORMA_CONFIG: { supabaseUrl: 'https://example.test', supabasePublishableKey: 'public' }, WorkspaceAuth: { token: async () => { if (options.signedOut) throw new Error('Please sign in'); return 'verified-session-token'; } } }, fetch, URLSearchParams, AbortSignal, Map, Set, JSON };
  vm.runInNewContext(source, context);
  return { store: context.window.FormaStore, calls, data };
}
const response = (rows, status = 200) => ({ ok: status < 400, status, json: async () => rows });

test('purchase transitions guard the original status and timestamp', async () => {
  const purchase={id:'p',title:'Towels',quantity:'2 boxes',category:'Housekeeping',notes:'',priority:'Normal',status:'planned',purchased_at:null};
  const {store,calls}=setup({data:{board_purchases:[purchase]},handle:()=>response([purchase])});
  const before=await store.load(), after=clone(before);
  after.purchases[0].status='purchased';after.purchases[0].purchased_at='2026-10-15T03:00:00Z';
  await store.save(before,after);
  const patch=calls.find(c=>c.method==='PATCH');assert.equal(patch.table,'board_purchases');
  assert.equal(patch.query.get('status'),'eq.planned');assert.equal(patch.query.get('purchased_at'),'is.null');
  assert.deepEqual(Object.keys(JSON.parse(patch.body)).sort(),['purchased_at','status']);
});
test('in-place UI edits cannot change original workflow concurrency snapshots',async()=>{
  const purchase={id:'p',title:'Towels',quantity:'1',category:'',notes:'',priority:'Normal',status:'planned',purchased_at:null};
  const recurring={id:'r',title:'Opening',frequency:'daily',weekday:null,time:'09:00',start_date:'2026-10-15',category:'',notes:'',paused:false};
  const {store,calls}=setup({data:{board_purchases:[purchase],board_recurring:[recurring]},handle:()=>response([purchase])});
  const state=await store.load(),baseline=clone(state);
  state.purchases[0].status='purchased';state.recurring[0].time='10:00';
  await store.save(baseline,state);
  assert.equal(calls.find(c=>c.method==='PATCH'&&c.table==='board_purchases').query.get('status'),'eq.planned');
  assert.equal(calls.find(c=>c.method==='PATCH'&&c.table==='board_recurring').query.get('time'),'eq.09:00');
});
test('removing a routine lets the server cascade completions atomically',async()=>{
  const recurring={id:'r',title:'Opening',frequency:'daily',weekday:null,time:'09:00',start_date:'2026-10-15',category:'',notes:'',paused:false};
  const completion={id:'c',recurring_id:'r',occurrence:'2026-10-15',completed_at:'2026-10-15T03:00:00Z'};
  const {store,calls}=setup({data:{board_recurring:[recurring],board_completions:[completion]},handle:()=>response([recurring])});
  const before=await store.load(),after=clone(before);after.recurring=[];after.completions=[];
  await store.save(before,after);
  assert.deepEqual(calls.filter(c=>c.method!=='GET').map(c=>[c.table,c.method]),[['board_recurring','DELETE']]);
});

test('loads all rows even when the server caps a page below 500', async () => {
  const { store, calls } = setup({ pageSize: 1, data: { board_members: [member, { ...member, id: 'member-2' }] } });
  const state = await store.load();
  assert.equal(state.members.length, 2);
  assert.equal(state.tasks[0].latest_note, '');
  assert.equal(state.tasks[0].memberId, member.id);
  assert.equal(calls.filter(call => call.table === 'board_members').length, 3);
});
test('patches changed fields and guards against the original database values', async () => {
  const { store, calls } = setup({ handle: () => response([task]) });
  const before = await store.load(), after = clone(before);
  after.tasks[0].latest_note = 'Room ready';
  await store.save(before, after);
  const patch = calls.find(call => call.method === 'PATCH');
  assert.deepEqual(JSON.parse(patch.body), { latest_note: 'Room ready' });
  assert.equal(patch.query.get('latest_note'), 'is.null');
  assert.equal(patch.query.has('title'), false);
  assert.equal(patch.headers.Authorization, 'Bearer verified-session-token');
  assert.equal(patch.headers['x-board-actor'], undefined);
});
test('same-field concurrent edit is rejected instead of silently overwriting', async () => {
  const { store } = setup({ handle: () => response([]) });
  const before = await store.load(), after = clone(before); after.tasks[0].status = 'Completed';
  await assert.rejects(store.save(before, after), /changed or was removed/);
});
test('member removal uses one guarded delete; the foreign key unassigns tasks atomically', async () => {
  const { store, calls } = setup({ handle: () => response([member]) });
  const before = await store.load(), after = clone(before); after.members = []; after.tasks[0].memberId = '';
  await store.save(before, after);
  const writes = calls.filter(call => call.method !== 'GET');
  assert.deepEqual(writes.map(call => [call.table, call.method]), [['board_members', 'DELETE']]);
  assert.equal(writes[0].query.get('name'), 'eq.Alex Chen');
  assert.equal(writes[0].query.get('role'), 'eq.Dev');
});
test('reports a partial multi-record save accurately', async () => {
  const { store } = setup({ handle: ({ init }) => init.method === 'DELETE' ? response({ message: 'Blocked by relation' }, 409) : response([task]) });
  const before = await store.load(), after = clone(before); after.members = []; after.tasks[0].memberId = ''; after.tasks[0].title = 'Updated independently';
  await assert.rejects(store.save(before, after), error => error.partial === true && error.message === 'Blocked by relation');
});
test('only whitelisted task fields are sent to the backend', async () => {
  const { store, calls } = setup({ handle: () => response([task]) });
  const before = await store.load(), after = clone(before);
  after.tasks.push({ ...after.tasks[0], id: 'task-2', injected: 'do not send' });
  await store.save(before, after);
  const post = JSON.parse(calls.find(call => call.method === 'POST').body);
  assert.equal(post.injected, undefined); assert.equal(post.memberId, undefined); assert.equal(post.member_id, member.id);
});
test('literal equality filters preserve punctuation without changing the query', async () => {
  const title = 'A "quoted", (test) & \\ work';
  const { store, calls } = setup({ data: { board_tasks: [{ ...task, title }] }, handle: () => response([task]) });
  const before = await store.load(), after = clone(before); after.tasks[0].title = 'New title'; await store.save(before, after);
  assert.equal(calls.find(call => call.method === 'PATCH').query.get('title'), `eq.${title}`);
});
test('no-op save sends no writes', async () => {
  const { store, calls } = setup(); const state = await store.load(); await store.save(state, clone(state));
  assert.equal(calls.some(call => call.method !== 'GET'), false);
});
test('multi-line notes retain real newlines in concurrency filters', async () => {
  const note = 'First line\nSecond line\tTabbed';
  const { store, calls } = setup({ data: { board_tasks: [{ ...task, latest_note: note }] }, handle: () => response([task]) });
  const before = await store.load(), after = clone(before); after.tasks[0].latest_note = 'Updated';
  await store.save(before, after);
  assert.equal(calls.find(call => call.method === 'PATCH').query.get('latest_note'), 'eq.' + note);
});

test('signed-out requests fail before reaching the API', async () => {
  const { store, calls } = setup({ signedOut: true });
  await assert.rejects(store.load(), /sign in/); assert.equal(calls.length, 0);
});

test('failed member deletion does not send a task mutation', async () => {
  const { store, calls } = setup({ handle: () => response({ message: 'Conflict' }, 409) });
  const before = await store.load(), after = clone(before); after.members = []; after.tasks[0].memberId = '';
  await assert.rejects(store.save(before, after), error => !error.partial && error.message === 'Conflict');
  assert.equal(calls.filter(call => call.method === 'PATCH').length, 0);
});

test('explicit reassignment is retained when a former member is removed', async () => {
  const { store, calls } = setup({ data: { board_members: [member, { ...member, id: 'member-2' }] }, handle: () => response([task]) });
  const before = await store.load(), after = clone(before); after.members.shift(); after.tasks[0].memberId = 'member-2';
  await store.save(before, after);
  assert.equal(JSON.parse(calls.find(call => call.method === 'PATCH').body).member_id, 'member-2');
});

test('tracker edits and deletes are guarded against concurrent changes', async()=>{
  const row={id:'r1',name:'Room status',url:'https://example.com/rooms'};
  const {store,calls}=setup({data:{board_trackers:[row]},handle:()=>response([row])});
  const before=await store.load(),after=clone(before); after.trackers[0].name='Reception status';
  await store.save(before,after);
  const patch=calls.find(c=>c.method==='PATCH');assert.equal(patch.table,'board_trackers');assert.equal(patch.query.get('name'),'eq.Room status');
  assert.deepEqual(JSON.parse(patch.body),{name:'Reception status'});
  await store.save(before,{...before,trackers:[]});
  const del=calls.find(c=>c.method==='DELETE');assert.equal(del.query.get('url'),'eq.https://example.com/rooms');
  const conflict=setup({data:{board_trackers:[row]},handle:()=>response([])});const old=await conflict.store.load();
  await assert.rejects(conflict.store.save(old,{...old,trackers:[{...row,name:'Conflict'}]}),/changed or was removed/);
});
