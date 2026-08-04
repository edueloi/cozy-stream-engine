ALTER TABLE public.app_settings 
  ADD COLUMN IF NOT EXISTS whatsapp_webhook_token text,
  ADD COLUMN IF NOT EXISTS smtp_from_name text,
  ADD COLUMN IF NOT EXISTS smtp_from_email text;

-- Generate initial webhook token if missing
UPDATE public.app_settings 
SET whatsapp_webhook_token = encode(gen_random_bytes(24), 'hex')
WHERE id = 1 AND whatsapp_webhook_token IS NULL;