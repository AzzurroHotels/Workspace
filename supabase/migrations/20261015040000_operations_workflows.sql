-- Additive shared-mode release. Existing task content and history are retained.
BEGIN;
ALTER TABLE public.board_tasks ADD COLUMN area text NOT NULL DEFAULT 'operations'
  CHECK (area IN ('operations','maintenance'));
CREATE TABLE public.board_recurring (
  id text PRIMARY KEY,
  title text NOT NULL CHECK(title=btrim(title) AND char_length(title) BETWEEN 1 AND 120),
  category text NOT NULL DEFAULT '' CHECK(char_length(category)<=70),
  notes text NOT NULL DEFAULT '' CHECK(char_length(notes)<=3000),
  frequency text NOT NULL CHECK(frequency IN ('daily','weekly')),
  weekday integer,
  time text NOT NULL CHECK(time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  start_date date NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((frequency='daily' AND weekday IS NULL) OR (frequency='weekly' AND weekday IS NOT NULL AND weekday BETWEEN 0 AND 6))
);
CREATE TABLE public.board_completions (
  id text PRIMARY KEY,
  recurring_id text NOT NULL REFERENCES public.board_recurring(id) ON DELETE CASCADE,
  occurrence date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recurring_id,occurrence)
);
CREATE TABLE public.board_purchases (
  id text PRIMARY KEY,
  title text NOT NULL CHECK(title=btrim(title) AND char_length(title) BETWEEN 1 AND 120),
  quantity text NOT NULL DEFAULT '1' CHECK(quantity=btrim(quantity) AND char_length(quantity) BETWEEN 1 AND 60),
  category text NOT NULL DEFAULT '' CHECK(char_length(category)<=70),
  notes text NOT NULL DEFAULT '' CHECK(char_length(notes)<=3000),
  priority text NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Normal','High')),
  status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','purchased')),
  purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((status='planned' AND purchased_at IS NULL) OR (status='purchased' AND purchased_at IS NOT NULL))
);
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['board_recurring','board_completions','board_purchases'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon',tbl);
    EXECUTE format('CREATE POLICY shared_workflow_access ON public.%I FOR ALL TO anon USING(true) WITH CHECK(true)',tbl);
  END LOOP;
END $$;
-- Completions are immutable occurrences; undo uses DELETE, followed by a fresh INSERT.
REVOKE UPDATE ON public.board_completions FROM anon;
CREATE FUNCTION private.stamp_purchase() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
  IF NEW.status='planned' THEN NEW.purchased_at=NULL;
  ELSIF TG_OP='INSERT' THEN NEW.purchased_at=clock_timestamp();
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN NEW.purchased_at=clock_timestamp();
  ELSE NEW.purchased_at=OLD.purchased_at; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stamp_purchase BEFORE INSERT OR UPDATE ON public.board_purchases
FOR EACH ROW EXECUTE FUNCTION private.stamp_purchase();
CREATE FUNCTION private.stamp_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE routine public.board_recurring; local_day date := (clock_timestamp() AT TIME ZONE 'Australia/Sydney')::date; scheduled date;
BEGIN
  SELECT * INTO routine FROM public.board_recurring WHERE id=NEW.recurring_id FOR SHARE;
  IF NOT FOUND OR routine.paused THEN RAISE EXCEPTION 'This routine is unavailable or paused. Refresh and try again.'; END IF;
  scheduled=local_day;
  IF routine.frequency='weekly' THEN scheduled=local_day-((extract(dow FROM local_day)::int-routine.weekday+7)%7); END IF;
  IF scheduled < routine.start_date OR NEW.occurrence <> scheduled THEN
    RAISE EXCEPTION 'The scheduled occurrence changed. Refresh before completing this routine.';
  END IF;
  NEW.completed_at=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER stamp_completion BEFORE INSERT ON public.board_completions
FOR EACH ROW EXECUTE FUNCTION private.stamp_completion();
REVOKE ALL ON FUNCTION private.stamp_purchase(), private.stamp_completion() FROM PUBLIC,anon,authenticated;
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
  VALUES (CASE TG_TABLE_NAME WHEN 'board_tasks' THEN 'tasks' WHEN 'board_trackers' THEN 'trackers' WHEN 'board_recurring' THEN 'recurring' WHEN 'board_completions' THEN 'completions' WHEN 'board_purchases' THEN 'purchases' ELSE 'members' END,
    item ->> 'id', coalesce(item ->> 'title', item ->> 'name', item ->> 'recurring_id'), TG_OP, actor, change_set);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_board_activity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER record_recurring_activity AFTER INSERT OR UPDATE OR DELETE ON public.board_recurring
FOR EACH ROW EXECUTE FUNCTION public.record_board_activity();
CREATE TRIGGER record_completions_activity AFTER INSERT OR UPDATE OR DELETE ON public.board_completions
FOR EACH ROW EXECUTE FUNCTION public.record_board_activity();
CREATE TRIGGER record_purchases_activity AFTER INSERT OR UPDATE OR DELETE ON public.board_purchases
FOR EACH ROW EXECUTE FUNCTION public.record_board_activity();
COMMIT;
