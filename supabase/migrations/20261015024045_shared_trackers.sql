-- Transitional release: retain the existing name-based shared workspace.
-- No task, member or historical activity rows are rewritten or seeded.
-- Apply staff_access and trackers_and_signup only when email sign-in is ready.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;

CREATE TABLE public.board_trackers (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  url text NOT NULL CHECK (char_length(url) <= 2048 AND url ~ '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.board_trackers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.board_trackers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_trackers TO anon;
CREATE POLICY "Shared tracker access" ON public.board_trackers FOR ALL TO anon
USING (true) WITH CHECK (true);

CREATE FUNCTION private.stamp_tracker() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION private.stamp_tracker() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER stamp_tracker BEFORE UPDATE ON public.board_trackers
FOR EACH ROW EXECUTE FUNCTION private.stamp_tracker();

CREATE FUNCTION private.stamp_task_note() RETURNS trigger
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
CREATE TRIGGER stamp_task_note BEFORE INSERT OR UPDATE ON public.board_tasks
FOR EACH ROW EXECUTE FUNCTION private.stamp_task_note();

-- Names remain self-reported, exactly as in the existing shared workflow.
-- The later staff migration replaces this with verified Auth attribution.
CREATE OR REPLACE FUNCTION public.record_board_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  previous jsonb := '{}'::jsonb; current_row jsonb := '{}'::jsonb;
  item jsonb; change_set jsonb := '{}'::jsonb; field text;
  actor text; encoded text; decoded bytea := ''::bytea; pos integer := 1;
BEGIN
  encoded := coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-board-actor', '');
  WHILE pos <= length(encoded) LOOP
    IF substring(encoded, pos, 1) = '%' AND substring(encoded, pos + 1, 2) ~ '^[0-9a-fA-F]{2}$' THEN
      decoded := decoded || decode(substring(encoded, pos + 1, 2), 'hex'); pos := pos + 3;
    ELSE
      decoded := decoded || convert_to(substring(encoded, pos, 1), 'UTF8'); pos := pos + 1;
    END IF;
  END LOOP;
  BEGIN actor := coalesce(nullif(left(btrim(convert_from(decoded, 'UTF8')), 70), ''), 'Unknown');
  EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN actor := 'Unknown'; END;
  IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN current_row := to_jsonb(NEW); END IF;
  item := CASE WHEN TG_OP = 'DELETE' THEN previous ELSE current_row END;
  FOR field IN SELECT jsonb_object_keys(item) LOOP
    IF field IN ('id', 'created_at', 'updated_at', 'note_updated_at') THEN CONTINUE; END IF;
    IF TG_OP <> 'UPDATE' OR current_row -> field IS DISTINCT FROM previous -> field
      OR (field = 'latest_note' AND current_row -> 'note_updated_at' IS DISTINCT FROM previous -> 'note_updated_at') THEN
      change_set := change_set || jsonb_build_object(field, jsonb_build_object('from', previous -> field, 'to', current_row -> field));
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND change_set = '{}'::jsonb THEN RETURN NEW; END IF;
  INSERT INTO public.board_activity(entity, record_id, record_title, action, actor_name, changes)
  VALUES (CASE TG_TABLE_NAME WHEN 'board_tasks' THEN 'tasks' WHEN 'board_trackers' THEN 'trackers' ELSE 'members' END,
    item ->> 'id', coalesce(item ->> 'title', item ->> 'name'), TG_OP, actor, change_set);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_board_activity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER record_tracker_activity AFTER INSERT OR UPDATE OR DELETE ON public.board_trackers
FOR EACH ROW EXECUTE FUNCTION public.record_board_activity();
COMMIT;
