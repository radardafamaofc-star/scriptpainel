
-- Credit transactions table
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'purchase',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage credit_transactions" ON public.credit_transactions FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- Test lines table
CREATE TABLE IF NOT EXISTS public.test_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  password text NOT NULL,
  server_id uuid REFERENCES public.servers(id),
  created_by uuid NOT NULL,
  duration_hours integer NOT NULL DEFAULT 4,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage test_lines" ON public.test_lines FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Resellers can manage own test_lines" ON public.test_lines FOR ALL USING (auth.uid() = created_by);

-- Coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  max_uses integer NOT NULL DEFAULT 50,
  used_count integer NOT NULL DEFAULT 0,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coupons" ON public.coupons FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view active coupons" ON public.coupons FOR SELECT USING (auth.uid() IS NOT NULL);
