-- Store XUI package id separately from credits
ALTER TABLE public.plans
ADD COLUMN IF NOT EXISTS package_id text;