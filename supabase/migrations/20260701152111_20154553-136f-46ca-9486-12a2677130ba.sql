ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_leads_responsible_user ON public.leads(responsible_user_id);