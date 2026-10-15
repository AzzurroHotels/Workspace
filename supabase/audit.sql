-- READ-ONLY review queries for the Supabase SQL editor, run by the project owner.
-- No schema, policy, role, or data changes. Not run during the local UI work.

-- 1. RLS state on exposed workspace tables.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('board_members', 'board_tasks', 'board_activity');

-- 2. Actual policies: inspect anonymous reads/writes and authenticated membership.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('board_members', 'board_tasks', 'board_activity')
order by tablename, policyname;

-- 3. Grants are separate from row policies.
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('board_members', 'board_tasks', 'board_activity')
order by table_name, grantee, privilege_type;

-- 4. Required/nullable columns and defaults.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('board_members', 'board_tasks', 'board_activity')
order by table_name, ordinal_position;

-- 5. Check task statuses, roles, priorities, text lengths, and foreign-key behavior.
select t.relname as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname in ('board_members', 'board_tasks', 'board_activity')
order by t.relname, c.conname;

-- 6. Activity logging and any validation/update triggers.
select c.relname as table_name, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname = 'public'
  and c.relname in ('board_members', 'board_tasks', 'board_activity')
order by c.relname, t.tgname;

-- 7. Support stable pagination and task/history lookup as the workspace grows.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('board_members', 'board_tasks', 'board_activity')
order by tablename, indexname;
