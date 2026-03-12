
-- 1. Add new reseller tier enum values
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reseller_master';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reseller_ultra';
