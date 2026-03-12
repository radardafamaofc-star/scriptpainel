
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS template text;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS template text;
