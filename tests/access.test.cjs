const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('staff access migration on isolated PostgreSQL', async t => {
  const db = new PGlite();
  const ids = { admin: '00000000-0000-4000-8000-000000000001', viewer: '00000000-0000-4000-8000-000000000002', unknown: '00000000-0000-4000-8000-000000000003', unverified: '00000000-0000-4000-8000-000000000004' };
  await db.exec(`
    CREATE ROLE supabase_auth_admin; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
    CREATE TABLE board_members(id text PRIMARY KEY,name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 70),role text NOT NULL CHECK(role IN ('Admin','Dev','ProB')),created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE board_tasks(id text PRIMARY KEY,title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 120),description text NOT NULL DEFAULT '',member_id text REFERENCES board_members(id) ON DELETE SET NULL,status text NOT NULL DEFAULT 'New' CHECK(status IN ('New','In progress','For Review','Completed')),due date NOT NULL,priority text NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Normal','High')),created_at timestamptz NOT NULL DEFAULT now(),latest_note text NOT NULL DEFAULT '',note_updated_at timestamptz);
    CREATE TABLE board_activity(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entity text NOT NULL,record_id text NOT NULL,record_title text,action text NOT NULL,actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),changes jsonb NOT NULL DEFAULT '{}');
    ALTER TABLE board_members ENABLE ROW LEVEL SECURITY; ALTER TABLE board_tasks ENABLE ROW LEVEL SECURITY; ALTER TABLE board_activity ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "No login board access" ON board_members FOR ALL TO anon USING(true) WITH CHECK(true);
    CREATE POLICY "No login board access" ON board_tasks FOR ALL TO anon USING(true) WITH CHECK(true);
    CREATE POLICY "Public activity read" ON board_activity FOR SELECT TO anon USING(true);
    GRANT ALL ON board_tasks,board_members TO anon,authenticated; GRANT SELECT ON board_activity TO anon;
    CREATE FUNCTION record_board_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN COALESCE(NEW,OLD); END $$;
    CREATE TRIGGER record_member_activity AFTER INSERT OR UPDATE OR DELETE ON board_members FOR EACH ROW EXECUTE FUNCTION record_board_activity();
    CREATE TRIGGER record_task_activity AFTER INSERT OR UPDATE OR DELETE ON board_tasks FOR EACH ROW EXECUTE FUNCTION record_board_activity();
    INSERT INTO board_members(id,name,role) VALUES ('m1','Alex','Dev'),('m2','Jamie','ProB');
    INSERT INTO board_tasks(id,title,member_id,due) VALUES ('t1','Prepare rooms','m1','2026-10-16');
    INSERT INTO board_activity(entity,record_id,action,actor_name) VALUES ('tasks','t1','INSERT','Legacy label');
    INSERT INTO auth.users VALUES ('${ids.admin}','vivekalthi@gmail.com',now()),('${ids.viewer}','viewer@example.com',now()),('${ids.unknown}','unknown@example.com',now()),('${ids.unverified}','unverified@example.com',NULL);
  `);
  const beforeShared = (await db.query("SELECT jsonb_build_object('tasks',(SELECT jsonb_agg(t) FROM board_tasks t),'members',(SELECT jsonb_agg(m) FROM board_members m),'activity',(SELECT jsonb_agg(a) FROM board_activity a)) snapshot")).rows[0].snapshot;
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261015024045_shared_trackers.sql'),'utf8'));
  await t.test('shared-mode migration preserves every existing task, member and history field',async()=>{
    const after = (await db.query("SELECT jsonb_build_object('tasks',(SELECT jsonb_agg(t) FROM board_tasks t),'members',(SELECT jsonb_agg(m) FROM board_members m),'activity',(SELECT jsonb_agg(a) FROM board_activity a)) snapshot")).rows[0].snapshot;
    assert.deepEqual(after,beforeShared);
  });
  await t.test('shared-mode tracker CRUD and note timestamps retain self-reported names',async()=>{
    await db.exec('BEGIN; SET LOCAL ROLE anon');
    try {
      await db.query("SELECT set_config('request.headers',$1,true)",[JSON.stringify({'x-board-actor':encodeURIComponent('José Test')})]);
      await db.exec("INSERT INTO board_trackers(id,name,url) VALUES('shared','Roster','https://example.com/roster')");
      await db.exec("UPDATE board_trackers SET name='Team roster' WHERE id='shared'");
      await db.exec("UPDATE board_tasks SET latest_note='Shared update',note_updated_at='2000-01-01' WHERE id='t1'");
      assert.ok(new Date((await db.query("SELECT note_updated_at FROM board_tasks WHERE id='t1'")).rows[0].note_updated_at).getUTCFullYear()>2000);
      assert.equal((await db.query("SELECT actor_name FROM board_activity WHERE entity='trackers' AND action='INSERT'")).rows[0].actor_name,'José Test');
      assert.equal((await db.query("DELETE FROM board_trackers WHERE id='shared' RETURNING id")).rows.length,1);
      assert.equal((await db.query("SELECT count(*)::int n FROM board_activity WHERE entity='trackers'")).rows[0].n,3);
      await db.query("SELECT set_config('request.headers',$1,true)",[JSON.stringify({'x-board-actor':'%FF'})]);
      await db.exec("UPDATE board_tasks SET latest_note='Second shared update' WHERE id='t1'");
      assert.equal((await db.query("SELECT actor_name FROM board_activity WHERE changes->'latest_note'->>'to'='Second shared update'")).rows[0].actor_name,'Unknown');
    } finally { await db.exec('ROLLBACK'); }
  });

  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261015040000_operations_workflows.sql'),'utf8'));
  await t.test('workflow migration preserves every legacy field and defaults existing tasks to operations',async()=>{
    const after=(await db.query("SELECT jsonb_build_object('tasks',(SELECT jsonb_agg(to_jsonb(t)-'area') FROM board_tasks t),'members',(SELECT jsonb_agg(m) FROM board_members m),'activity',(SELECT jsonb_agg(a) FROM board_activity a)) snapshot")).rows[0].snapshot;
    assert.deepEqual(after,beforeShared);
    assert.equal((await db.query('SELECT area FROM board_tasks')).rows[0].area,'operations');
  });
  async function workflowTransaction(callback){
    await db.exec('BEGIN; SET LOCAL ROLE anon');
    try{await callback();}finally{await db.exec('ROLLBACK');}
  }
  const seedRoutine="INSERT INTO board_recurring(id,title,frequency,time,start_date) VALUES('routine','Reception opening','daily','09:00',(now() AT TIME ZONE 'Australia/Sydney')::date)";
  const completion="INSERT INTO board_completions(id,recurring_id,occurrence,completed_at) VALUES('done','routine',(now() AT TIME ZONE 'Australia/Sydney')::date,'2000-01-01')";
  await t.test('shared routine completion is timestamped by the server, unique per date, and can be undone',async()=>workflowTransaction(async()=>{
    await db.exec(seedRoutine);await db.exec(completion);
    const done=(await db.query('SELECT * FROM board_completions')).rows[0];assert.ok(new Date(done.completed_at).getUTCFullYear()>2000);
    await db.exec('SAVEPOINT duplicate');
    await assert.rejects(db.exec(completion.replace("'done'","'second'")),/unique constraint/);await db.exec('ROLLBACK TO duplicate');
    await db.exec('DELETE FROM board_completions');await db.exec(completion);
    assert.equal((await db.query("SELECT count(*)::int n FROM board_activity WHERE entity='completions'")).rows[0].n,3);
  }));
  await t.test('paused, future and stale-date completions are rejected',async()=>{
    for(const setup of ["UPDATE board_recurring SET paused=true", "UPDATE board_recurring SET start_date=start_date+1"]){
      await workflowTransaction(async()=>{await db.exec(seedRoutine);await db.exec(setup);await assert.rejects(db.exec(completion),/unavailable|occurrence changed/);});
    }
    await workflowTransaction(async()=>{await db.exec(seedRoutine);await assert.rejects(db.exec(completion.replace("::date,'2000", "::date-1,'2000")),/occurrence changed/);});
  });
  await t.test('purchase transitions set, preserve and clear server timestamps',async()=>workflowTransaction(async()=>{
    await db.exec("INSERT INTO board_purchases(id,title,quantity) VALUES('p','Towels','2 boxes')");
    await db.exec("UPDATE board_purchases SET status='purchased',purchased_at='2000-01-01' WHERE id='p'");
    const stamp=(await db.query('SELECT purchased_at FROM board_purchases')).rows[0].purchased_at;
    assert.ok(new Date(stamp).getUTCFullYear()>2000);
    await db.exec("UPDATE board_purchases SET notes='Receipt filed',purchased_at='2000-01-01' WHERE id='p'");
    assert.deepEqual((await db.query('SELECT purchased_at FROM board_purchases')).rows[0].purchased_at,stamp);
    await db.exec("UPDATE board_purchases SET status='planned' WHERE id='p'");
    assert.equal((await db.query('SELECT purchased_at FROM board_purchases')).rows[0].purchased_at,null);
    assert.equal((await db.query("SELECT count(*)::int n FROM board_activity WHERE entity='purchases'")).rows[0].n,4);
  }));
  await t.test('schedule checks reject impossible times and weekly definitions',async()=>{
    for(const change of ["time='24:00'","weekday=7,frequency='weekly'","frequency='weekly',weekday=NULL"])
      await workflowTransaction(async()=>{await db.exec(seedRoutine);await assert.rejects(db.exec('UPDATE board_recurring SET '+change),/check constraint/);});
  });
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/deferred/20261015024100_staff_access.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/deferred/20261015024101_trackers_and_signup.sql'),'utf8'));
  await db.exec("INSERT INTO workspace_access(email,display_name,role) VALUES ('viewer@example.com','Viewer','viewer'),('unverified@example.com','Unverified','admin')");
  async function asUser(kind, callback, role = 'authenticated') {
    await db.exec('BEGIN');
    try {
      await db.exec('SET LOCAL ROLE ' + role);
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [ids[kind] || '']);
      await callback();
    } finally { await db.exec('ROLLBACK'); }
  }
  try {
    await t.test('preserves records and seeds the exact initial admin', async () => {
      assert.equal((await db.query('SELECT count(*)::int n FROM board_tasks')).rows[0].n,1);
      assert.equal((await db.query("SELECT role FROM workspace_access WHERE email='vivekalthi@gmail.com'")).rows[0].role,'admin');
      assert.equal((await db.query("SELECT actor_user_id FROM board_activity WHERE actor_name='Legacy label'")).rows[0].actor_user_id,null);
    });
    await t.test('anonymous reads and writes are revoked', async () => {
      for (const sql of ['SELECT * FROM board_tasks',"DELETE FROM board_members",'SELECT * FROM workspace_access']) await asUser(null,async () => assert.rejects(db.exec(sql),/permission denied/),'anon');
    });

    await t.test('future staff switch closes anonymous access on every new workflow',async()=>{
      for(const table of ['board_recurring','board_completions','board_purchases']){
        await asUser(null,async()=>assert.rejects(db.exec('SELECT * FROM '+table),/permission denied/),'anon');
        await asUser('viewer',async()=>assert.equal((await db.query('DELETE FROM '+table+' RETURNING id')).rows.length,0));
      }
      await asUser('viewer',async()=>assert.rejects(db.exec("INSERT INTO board_purchases(id,title) VALUES('bad','Bad')"),/row-level security/));
      await asUser('admin',async()=>{
        await db.exec(seedRoutine);await db.exec(completion);
        await db.exec("INSERT INTO board_purchases(id,title) VALUES('admin-p','Linen')");
        assert.equal((await db.query("SELECT actor_email FROM board_activity WHERE entity='purchases'")).rows[0].actor_email,'vivekalthi@gmail.com');
      });
    });
    await t.test('unknown and unverified accounts cannot read workspace data', async () => {
      for (const kind of ['unknown','unverified']) await asUser(kind,async () => {
        assert.equal((await db.query('SELECT * FROM board_tasks')).rows.length,0);
        assert.equal((await db.query('SELECT * FROM board_members')).rows.length,0);
        assert.equal((await db.query('SELECT * FROM board_activity')).rows.length,0);
      });
    });
    await t.test('viewer reads workspace and only their own access record', async () => asUser('viewer',async () => {
      assert.equal((await db.query('SELECT * FROM board_tasks')).rows.length,1);
      const users = (await db.query('SELECT * FROM workspace_access')).rows;
      assert.deepEqual(users.map(user => user.email),['viewer@example.com']);
      assert.equal((await db.query("SELECT * FROM board_activity WHERE entity='users'")).rows.length,0);
    }));
    await t.test('viewer cannot change tasks, delete members, or elevate access', async () => {
      await asUser('viewer',async () => {
        assert.equal((await db.query("UPDATE board_tasks SET title='Hijacked' RETURNING *")).rows.length,0);
        assert.equal((await db.query('DELETE FROM board_members RETURNING *')).rows.length,0);
        assert.equal((await db.query("UPDATE workspace_access SET role='admin' RETURNING *")).rows.length,0);
      });
      await asUser('viewer',async () => assert.rejects(db.exec("INSERT INTO board_members(id,name,role) VALUES('bad','Bad','Dev')"),/row-level security/));
        await asUser('viewer',async () => assert.rejects(db.exec("INSERT INTO workspace_access(email,username,display_name,role) VALUES('bad@example.com','bad','Bad','admin')"),/row-level security|Administrator/));
    });
    await t.test('admin can add, edit, and remove approved users', async () => asUser('admin',async () => {
      await db.exec("INSERT INTO workspace_access(email,display_name,role) VALUES('new@example.com','New staff','viewer')");
      assert.equal((await db.query("SELECT username FROM workspace_access WHERE email='new@example.com'")).rows[0].username,'new');
      await db.exec("UPDATE workspace_access SET role='admin' WHERE email='new@example.com'");
      assert.equal((await db.query("SELECT role FROM workspace_access WHERE email='new@example.com'")).rows[0].role,'admin');
      await db.exec('SAVEPOINT duplicate_username');
      await assert.rejects(db.exec("INSERT INTO workspace_access(email,username,display_name,role) VALUES('new2@example.com','new','New staff 2','viewer')"),/duplicate key|unique/i);
      await db.exec('ROLLBACK TO SAVEPOINT duplicate_username');
      await db.exec("DELETE FROM workspace_access WHERE email='new@example.com'");
      assert.equal((await db.query("SELECT * FROM workspace_access WHERE email='new@example.com'")).rows.length,0);
    }));
    await t.test('self removal, self downgrade, and email mutation are blocked', async () => {
      for (const sql of ["DELETE FROM workspace_access WHERE email='vivekalthi@gmail.com'","UPDATE workspace_access SET role='viewer' WHERE email='vivekalthi@gmail.com'"]) await asUser('admin',async () => assert.rejects(db.exec(sql),/own administrator/));
      await asUser('admin',async () => assert.rejects(db.exec("UPDATE workspace_access SET email='different@example.com' WHERE email='viewer@example.com'"),/permission denied/));
    });
    await t.test('maintenance cannot remove the last administrator', async () => {
      await db.exec('BEGIN');
      try { await db.exec("DELETE FROM workspace_access WHERE email='unverified@example.com'"); await assert.rejects(db.exec("DELETE FROM workspace_access WHERE email='vivekalthi@gmail.com'"),/At least one administrator/); }
      finally { await db.exec('ROLLBACK'); }
    });
    await t.test('activity uses verified identity and server note timestamp', async () => asUser('admin',async () => {
      await db.exec(`SELECT set_config('request.headers','{"x-board-actor":"Impersonated%FF"}',true)`);
      await db.exec("UPDATE board_tasks SET latest_note='Ready',note_updated_at='2000-01-01' WHERE id='t1'");
      const activity = (await db.query("SELECT * FROM board_activity WHERE record_id='t1' AND action='UPDATE'")).rows[0];
      assert.equal(activity.actor_user_id,ids.admin); assert.equal(activity.actor_email,'vivekalthi@gmail.com'); assert.equal(activity.actor_name,'Vivek');
      assert.equal(activity.changes.latest_note.to,'Ready');
      assert.ok(new Date((await db.query("SELECT note_updated_at FROM board_tasks WHERE id='t1'")).rows[0].note_updated_at).getFullYear() > 2020);
    }));
    await t.test('member deletion unassigns tasks and records both changes atomically', async () => asUser('admin',async () => {
      await db.exec("DELETE FROM board_members WHERE id='m1'");
      assert.equal((await db.query("SELECT member_id FROM board_tasks WHERE id='t1'")).rows[0].member_id,null);
      assert.equal((await db.query("SELECT count(*)::int n FROM board_activity WHERE actor_user_id=auth.uid() AND entity IN('tasks','members')")).rows[0].n,2);
    }));
    await t.test('direct activity tampering, trigger invocation and truncate are denied', async () => {
      for (const sql of ["DELETE FROM board_activity","SELECT record_board_activity()","TRUNCATE board_tasks"]) await asUser('admin',async () => assert.rejects(db.exec(sql),/permission denied/));
    });
    await t.test('backend text limits apply independently of the browser', async () => asUser('admin',async () => assert.rejects(db.exec("UPDATE board_tasks SET latest_note=repeat('x',3001) WHERE id='t1'"),/board_tasks_note_length/)));
    await t.test('revoking membership immediately blocks an existing authenticated identity', async () => {
      await db.exec('BEGIN');
      try {
        await db.exec("DELETE FROM workspace_access WHERE email='viewer@example.com'; SET LOCAL ROLE authenticated");
        await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[ids.viewer]);
        assert.equal((await db.query('SELECT * FROM board_tasks')).rows.length,0);
      } finally { await db.exec('ROLLBACK'); }
    });
    await t.test('tracker CRUD records verified admin identity', async () => asUser('admin', async () => {
      await db.exec("INSERT INTO board_trackers(id,name,url) VALUES('r1','Rooms','https://docs.google.com/spreadsheets/d/example')");
      await db.exec("UPDATE board_trackers SET name='Room tracker' WHERE id='r1'");
      assert.equal((await db.query("SELECT actor_email FROM board_activity WHERE entity='trackers' AND action='INSERT'")).rows[0].actor_email,'vivekalthi@gmail.com');
      assert.equal((await db.query("DELETE FROM board_trackers WHERE id='r1' RETURNING id")).rows.length,1);
    }));
    await t.test('trackers enforce viewer, unknown and anonymous permissions', async () => {
      await db.exec("INSERT INTO board_trackers(id,name,url) VALUES('fixture','Rooms','https://example.com/')");
      await asUser('viewer',async()=>{
        assert.equal((await db.query('SELECT * FROM board_trackers')).rows.length,1);
        assert.equal((await db.query("UPDATE board_trackers SET name='Hijacked' RETURNING id")).rows.length,0);
        assert.equal((await db.query('DELETE FROM board_trackers RETURNING id')).rows.length,0);
      });
      await asUser('viewer',async()=>assert.rejects(db.exec("INSERT INTO board_trackers(id,name,url) VALUES('bad','Bad','https://example.com')"),/row-level security/));
      await asUser('unknown',async()=>assert.equal((await db.query('SELECT * FROM board_trackers')).rows.length,0));
      await asUser(null,async()=>assert.rejects(db.exec('SELECT * FROM board_trackers'),/permission denied/),'anon');
    });
    await t.test('tracker URLs and lengths are validated in the database',async()=>{
      for(const url of ['javascript:alert(1)','data:text/html,bad','https://user:password@example.com','https://example.com/ bad']) await asUser('admin',async()=>assert.rejects(db.query("INSERT INTO board_trackers(id,name,url) VALUES('bad','Bad',$1)",[url]),/check constraint/));
      await asUser('admin',async()=>assert.rejects(db.exec("INSERT INTO board_trackers(id,name,url) VALUES('bad',repeat('x',121),'https://example.com')"),/check constraint/));
    });
    await t.test('signup hook allows approved emails and rejects unknown identities',async()=>{
      await asUser(null,async()=>{
        const allow=(await db.query("SELECT hook_before_user_created($1) result",[JSON.stringify({user:{email:'VIVEKALTHI@gmail.com'}})])).rows[0].result;
        assert.deepEqual(allow,{});
        const deny=(await db.query("SELECT hook_before_user_created($1) result",[JSON.stringify({user:{email:'unknown@example.com'}})])).rows[0].result;
        assert.equal(deny.error.http_code,403);
      },'supabase_auth_admin');
      for(const role of ['anon','authenticated']) await asUser('admin',async()=>assert.rejects(db.exec("SELECT hook_before_user_created('{}')"),/permission denied/),role);
    });
  } finally { await db.close(); }
});
