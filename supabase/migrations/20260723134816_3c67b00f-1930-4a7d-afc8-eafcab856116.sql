
ALTER TABLE public.meetings_v2
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_same_day_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_status text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS no_show_message_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_overdue_alerted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_meetings_v2_status_end_at ON public.meetings_v2 (status, end_at);
CREATE INDEX IF NOT EXISTS idx_meetings_v2_status_start_at ON public.meetings_v2 (status, start_at);
