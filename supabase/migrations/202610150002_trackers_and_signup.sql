-- Run after staff_access; enable hook_before_user_created in Auth Hooks at release.
BEGIN;
CREATE TABLE public.board_trackers (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  url text NOT NULL CHECK (char_length(url) <= 2048 AND url ~ '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.board_trackers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.board_trackers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_trackers TO authenticated;
CREATE POLICY staff_trackers_read ON public.board_trackers FOR SELECT TO authenticated
USING ((SELECT private.workspace_role()) IN ('admin', 'viewer'));
CREATE POLICY admin_trackers_write ON public.board_trackers FOR ALL TO authenticated
USING ((SELECT private.workspace_role()) = 'admin') WITH CHECK ((SELECT private.workspace_role()) = 'admin');
CREATE FUNCTION private.stamp_tracker() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION private.stamp_tracker() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER stamp_tracker BEFORE UPDATE ON public.board_trackers
FOR EACH ROW EXECUTE FUNCTION private.stamp_tracker();
CREATE TRIGGER record_tracker_activity AFTER INSERT OR UPDATE OR DELETE ON public.board_trackers
FOR EACH ROW EXECUTE FUNCTION public.record_board_activity();

-- This service-only hook blocks account creation unless an admin has added the
-- email. RLS independently checks verified membership on every data request,
-- including existing Auth accounts after their workspace access is removed.
CREATE FUNCTION public.hook_before_user_created(event jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspace_access WHERE email = lower(btrim(event -> 'user' ->> 'email'))) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Workspace access requires administrator approval.'));
END $$;
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
COMMIT;
