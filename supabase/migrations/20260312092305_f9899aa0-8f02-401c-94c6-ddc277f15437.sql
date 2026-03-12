UPDATE public.plans
SET is_test = true
WHERE is_test = false
  AND duration_days <= 1;