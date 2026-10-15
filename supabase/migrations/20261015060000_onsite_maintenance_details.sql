-- Add location context for onsite work without changing existing tasks.
BEGIN;

ALTER TABLE public.board_tasks
  ADD COLUMN maintenance_property text NOT NULL DEFAULT '',
  ADD COLUMN maintenance_location text NOT NULL DEFAULT '';

ALTER TABLE public.board_tasks
  ADD CONSTRAINT board_tasks_maintenance_property_valid
    CHECK (maintenance_property IN ('', 'Allen', 'Central', 'Potts Point', 'Olympic')),
  ADD CONSTRAINT board_tasks_maintenance_location_length
    CHECK (char_length(maintenance_location) <= 160);

COMMIT;
