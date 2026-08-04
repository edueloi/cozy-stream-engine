
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes text;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='created_by')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='owner_id') THEN
    ALTER TABLE public.leads RENAME COLUMN created_by TO owner_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='owner_id') THEN
    ALTER TABLE public.leads ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
