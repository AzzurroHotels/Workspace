const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('onsite maintenance migration preserves old tasks and validates new place details', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE public.board_tasks (
      id text PRIMARY KEY,
      title text NOT NULL,
      area text NOT NULL DEFAULT 'operations',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.board_tasks(id,title,area,created_at)
      VALUES ('old-task','Existing maintenance task','maintenance','2026-10-01T03:15:00Z');
  `);
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261015060000_onsite_maintenance_details.sql'), 'utf8');
  await db.exec(migration);

  const old = (await db.query("SELECT maintenance_property, maintenance_location, created_at FROM public.board_tasks WHERE id='old-task'")).rows[0];
  assert.equal(old.maintenance_property, '');
  assert.equal(old.maintenance_location, '');
  assert.equal(old.created_at.toISOString(), '2026-10-01T03:15:00.000Z');
  await db.query("INSERT INTO public.board_tasks(id,title,area,maintenance_property,maintenance_location) VALUES ('new-task','Fix tap','maintenance','Potts Point','Room 4')");
  await assert.rejects(db.query("INSERT INTO public.board_tasks(id,title,maintenance_property) VALUES ('bad-property','Wrong property','Bondi')"), /board_tasks_maintenance_property_valid/);
  await assert.rejects(db.query("INSERT INTO public.board_tasks(id,title,maintenance_location) VALUES ('too-long','Long location',repeat('x',161))"), /board_tasks_maintenance_location_length/);
});
