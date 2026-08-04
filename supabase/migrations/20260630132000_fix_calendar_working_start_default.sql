-- Align agenda defaults with the product configuration shown in the UI and used by the AI agent.
-- Older installs created app_settings.meeting_working_start with 08:00, which could make
-- the WhatsApp agent offer 08:00 even when no per-user calendar preference was saved.
ALTER TABLE public.app_settings
  ALTER COLUMN meeting_working_start SET DEFAULT '09:00';

UPDATE public.app_settings
SET meeting_working_start = '09:00', updated_at = now()
WHERE meeting_working_start = '08:00';

UPDATE public.calendar_connections
SET working_hours = jsonb_set(working_hours, '{start}', '"09:00"'::jsonb, true), updated_at = now()
WHERE working_hours->>'start' = '08:00'
  AND COALESCE(working_hours->>'end', '18:00') = '18:00';
