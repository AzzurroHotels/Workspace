-- Coordinated release required: deploy the sign-in frontend with this migration.
-- Existing tasks, members, and historical activity are preserved.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TABLE public.workspace_access (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 70),
  role text NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.workspace_access (email, display_name, role)
VALUES ('vivekalthi@gmail.com', 'Vivek', 'admin');

-- Serializes access changes, including under repeatable-read isolation. A row
-- update forces conflicting transactions to wait or receive serialization errors.
CREATE TABLE private.access_guard (id integer PRIMARY KEY CHECK (id = 1), revision bigint NOT NULL);
INSERT INTO private.access_guard VALUES (1, 0);
REVOKE ALL ON private.access_guard FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.workspace_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.role FROM public.workspace_access a
  JOIN auth.users u ON lower(u.email) = a.email
  WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
$$;
CREATE FUNCTION private.workspace_email() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT lower(u.email) FROM auth.users u
  WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
$$;
REVOKE ALL ON FUNCTION private.workspace_role(), private.workspace_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.workspace_role(), private.workspace_email() TO authenticated;

CREATE FUNCTION private.guard_workspace_access() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller_email text; caller_role text;
BEGIN
  UPDATE private.access_guard SET revision = revision + 1 WHERE id = 1;
  -- This query runs after the guard lock, using the latest committed membership.
  SELECT a.email, a.role INTO caller_email, caller_role
  FROM public.workspace_access a JOIN auth.users u ON lower(u.email) = a.email
  WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF auth.uid() IS NOT NULL AND caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL AND current_setting('role', true) NOT IN ('postgres', 'service_role', 'none') THEN
    RAISE EXCEPTION 'A verified administrator is required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Email cannot be changed; remove access and add the new email';
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.role <> 'admin') THEN
    IF OLD.role = 'admin' AND OLD.email = caller_email THEN
      RAISE EXCEPTION 'You cannot remove or downgrade your own administrator access';
    END IF;
    IF OLD.role = 'admin' AND NOT EXISTS (SELECT 1 FROM public.workspace_access WHERE role = 'admin' AND email <> OLD.email) THEN
      RAISE EXCEPTION 'At least one administrator must remain';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.display_name = btrim(NEW.display_name);
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_workspace_access() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_workspace_access BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_access
FOR EACH ROW EXECUTE FUNCTION private.guard_workspace_access();

ALTER TABLE public.workspace_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No login board access" ON public.board_members;
DROP POLICY IF EXISTS "No login board access" ON public.board_tasks;
DROP POLICY IF EXISTS "Public activity read" ON public.board_activity;
REVOKE ALL ON public.board_members, public.board_tasks, public.board_activity, public.workspace_access FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_members, public.board_tasks TO authenticated;
GRANT SELECT ON public.board_activity TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.workspace_access TO authenticated;
GRANT UPDATE (display_name, role) ON public.workspace_access TO authenticated;

CREATE POLICY staff_members_read ON public.board_members FOR SELECT TO authenticated
USING ((SELECT private.workspace_role()) IN ('admin', 'viewer'));
CREATE POLICY admin_members_write ON public.board_members FOR ALL TO authenticated
USING ((SELECT private.workspace_role()) = 'admin') WITH CHECK ((SELECT private.workspace_role()) = 'admin');
CREATE POLICY staff_tasks_read ON public.board_tasks FOR SELECT TO authenticated
USING ((SELECT private.workspace_role()) IN ('admin', 'viewer'));
CREATE POLICY admin_tasks_write ON public.board_tasks FOR ALL TO authenticated
USING ((SELECT private.workspace_role()) = 'admin') WITH CHECK ((SELECT private.workspace_role()) = 'admin');
CREATE POLICY staff_activity_read ON public.board_activity FOR SELECT TO authenticated
USING ((SELECT private.workspace_role()) IN ('admin', 'viewer') AND entity <> 'users');
CREATE POLICY admin_access_activity_read ON public.board_activity FOR SELECT TO authenticated
USING ((SELECT private.workspace_role()) = 'admin');
CREATE POLICY workspace_access_read ON public.workspace_access FOR SELECT TO authenticated
USING (email = (SELECT private.workspace_email()) OR (SELECT private.workspace_role()) = 'admin');
CREATE POLICY admin_access_insert ON public.workspace_access FOR INSERT TO authenticated
WITH CHECK ((SELECT private.workspace_role()) = 'admin');
CREATE POLICY admin_access_update ON public.workspace_access FOR UPDATE TO authenticated
USING ((SELECT private.workspace_role()) = 'admin') WITH CHECK ((SELECT private.workspace_role()) = 'admin');
CREATE POLICY admin_access_delete ON public.workspace_access FOR DELETE TO authenticated
USING ((SELECT private.workspace_role()) = 'admin');

ALTER TABLE public.board_tasks
  ADD CONSTRAINT board_tasks_description_length CHECK (char_length(description) <= 10000),
  ADD CONSTRAINT board_tasks_note_length CHECK (char_length(latest_note) <= 3000);
ALTER TABLE public.board_activity ADD COLUMN actor_user_id uuid, ADD COLUMN actor_email text;

CREATE OR REPLACE FUNCTION private.stamp_task_note() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.note_updated_at = CASE WHEN NEW.latest_note <> '' THEN clock_timestamp() ELSE NULL END;
  ELSIF NEW.latest_note IS DISTINCT FROM OLD.latest_note OR NEW.note_updated_at IS DISTINCT FROM OLD.note_updated_at THEN
    NEW.note_updated_at = CASE WHEN NEW.latest_note <> '' THEN clock_timestamp() ELSE NULL END;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.stamp_task_note() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS stamp_task_note ON public.board_tasks;
CREATE TRIGGER stamp_task_note BEFORE INSERT OR UPDATE ON public.board_tasks
FOR EACH ROW EXECUTE FUNCTION private.stamp_task_note();

-- Existing member/task triggers already call this function. Replace its body to
-- use verified identity instead of the forgeable x-board-actor request header.
CREATE OR REPLACE FUNCTION public.record_board_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_row jsonb := '{}'::jsonb; new_row jsonb := '{}'::jsonb;
  item jsonb; diff jsonb := '{}'::jsonb; key text;
  actor_id uuid := auth.uid(); actor_email_value text; actor_label text;
BEGIN
  SELECT lower(u.email), coalesce(a.display_name, lower(u.email)) INTO actor_email_value, actor_label
  FROM auth.users u LEFT JOIN public.workspace_access a ON a.email = lower(u.email)
  WHERE u.id = actor_id AND u.email_confirmed_at IS NOT NULL;
  IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
  item := CASE WHEN TG_OP = 'DELETE' THEN old_row ELSE new_row END;
  FOR key IN SELECT jsonb_object_keys(CASE WHEN TG_OP = 'DELETE' THEN old_row ELSE new_row END) LOOP
    IF key IN ('id', 'created_at', 'updated_at', 'note_updated_at') THEN CONTINUE; END IF;
    IF TG_OP <> 'UPDATE' OR old_row -> key IS DISTINCT FROM new_row -> key
      OR (key = 'latest_note' AND old_row -> 'note_updated_at' IS DISTINCT FROM new_row -> 'note_updated_at') THEN
      diff := diff || jsonb_build_object(key, jsonb_build_object('from', old_row -> key, 'to', new_row -> key));
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND diff = '{}'::jsonb THEN RETURN NEW; END IF;
  INSERT INTO public.board_activity(entity,record_id,record_title,action,actor_name,actor_user_id,actor_email,changes)
  VALUES (CASE TG_TABLE_NAME WHEN 'board_tasks' THEN 'tasks' WHEN 'board_members' THEN 'members' WHEN 'board_trackers' THEN 'trackers' ELSE 'users' END,
    coalesce(item ->> 'id', item ->> 'email'), coalesce(item ->> 'title', item ->> 'name', item ->> 'display_name'),
    TG_OP, coalesce(actor_label, 'Database maintenance'), actor_id, actor_email_value, diff);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_board_activity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER record_workspace_access AFTER INSERT OR UPDATE OR DELETE ON public.workspace_access
FOR EACH ROW EXECUTE FUNCTION public.record_board_activity();
COMMIT;
