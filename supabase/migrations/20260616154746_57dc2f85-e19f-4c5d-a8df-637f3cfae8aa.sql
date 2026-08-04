ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS reengage_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reengage_after_days int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS lost_recover_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inbound_token text;

UPDATE public.app_settings SET inbound_token = encode(gen_random_bytes(24), 'hex') WHERE inbound_token IS NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS variant_key text;

CREATE TABLE IF NOT EXISTS public.cadence_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_day int NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  variant_key text NOT NULL,
  subject text,
  body_template text NOT NULL,
  weight int NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  sent_count int NOT NULL DEFAULT 0,
  reply_count int NOT NULL DEFAULT 0,
  positive_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cadence_day, channel, variant_key)
);
CREATE INDEX IF NOT EXISTS cv_active_idx ON public.cadence_variants(cadence_day, channel, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadence_variants TO authenticated;
GRANT ALL ON public.cadence_variants TO service_role;

ALTER TABLE public.cadence_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv read"  ON public.cadence_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "cv admin" ON public.cadence_variants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER cv_updated_at BEFORE UPDATE ON public.cadence_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();