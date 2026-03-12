ALTER TABLE public.plans ADD COLUMN duration_hours integer NOT NULL DEFAULT 720;
UPDATE public.plans SET duration_hours = duration_days * 24;