
-- Add hierarchy columns to resellers
ALTER TABLE public.resellers 
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS can_create_ultra boolean NOT NULL DEFAULT false;

-- Recursive hierarchy function
CREATE OR REPLACE FUNCTION public.get_descendant_user_ids(_parent_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT user_id FROM public.resellers WHERE created_by = _parent_id
    UNION ALL
    SELECT r.user_id FROM public.resellers r INNER JOIN tree t ON r.created_by = t.user_id
  )
  SELECT user_id FROM tree;
$$;

-- Update clients RLS for all reseller tiers + hierarchy
DROP POLICY IF EXISTS "Resellers can view own clients" ON public.clients;
CREATE POLICY "Resellers can view own clients" ON public.clients
  FOR SELECT USING (
    reseller_id = auth.uid() OR created_by = auth.uid()
    OR created_by IN (SELECT public.get_descendant_user_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Resellers can create clients" ON public.clients;
CREATE POLICY "Resellers can create clients" ON public.clients
  FOR INSERT WITH CHECK (created_by = auth.uid() AND auth.uid() IS NOT NULL);

CREATE POLICY "Resellers can update own clients" ON public.clients
  FOR UPDATE USING (
    created_by = auth.uid() OR created_by IN (SELECT public.get_descendant_user_ids(auth.uid()))
  );

CREATE POLICY "Resellers can delete own clients" ON public.clients
  FOR DELETE USING (
    created_by = auth.uid() OR created_by IN (SELECT public.get_descendant_user_ids(auth.uid()))
  );

-- Update resellers RLS for hierarchy visibility
DROP POLICY IF EXISTS "Resellers can view own data" ON public.resellers;
CREATE POLICY "Resellers can view own data" ON public.resellers
  FOR SELECT USING (
    user_id = auth.uid() OR created_by = auth.uid()
    OR user_id IN (SELECT public.get_descendant_user_ids(auth.uid()))
  );

CREATE POLICY "Reseller managers can create resellers" ON public.resellers
  FOR INSERT WITH CHECK (
    (has_role(auth.uid(), 'reseller_master') OR has_role(auth.uid(), 'reseller_ultra'))
    AND created_by = auth.uid()
  );

CREATE POLICY "Reseller managers can update sub-resellers" ON public.resellers
  FOR UPDATE USING (
    (has_role(auth.uid(), 'reseller_master') OR has_role(auth.uid(), 'reseller_ultra'))
    AND (created_by = auth.uid() OR user_id IN (SELECT public.get_descendant_user_ids(auth.uid())))
  );

-- User roles: managers can set reseller-tier roles
CREATE POLICY "Reseller managers can set reseller roles" ON public.user_roles
  FOR UPDATE USING (
    has_role(auth.uid(), 'reseller_master') OR has_role(auth.uid(), 'reseller_ultra')
  ) WITH CHECK (
    role IN ('reseller'::app_role, 'reseller_master'::app_role, 'reseller_ultra'::app_role)
  );

CREATE POLICY "Reseller managers can view sub-reseller roles" ON public.user_roles
  FOR SELECT USING (
    (has_role(auth.uid(), 'reseller_master') OR has_role(auth.uid(), 'reseller_ultra'))
    AND user_id IN (SELECT public.get_descendant_user_ids(auth.uid()))
  );

-- Update credit_transactions RLS
DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;
CREATE POLICY "Users can view own transactions" ON public.credit_transactions
  FOR SELECT USING (
    user_id = auth.uid() OR user_id IN (SELECT public.get_descendant_user_ids(auth.uid()))
  );

CREATE POLICY "Reseller managers can insert transactions" ON public.credit_transactions
  FOR INSERT WITH CHECK (
    (has_role(auth.uid(), 'reseller_master') OR has_role(auth.uid(), 'reseller_ultra'))
    AND (user_id = auth.uid() OR user_id IN (SELECT public.get_descendant_user_ids(auth.uid())))
  );

-- Coupons: ultra can manage own coupons
CREATE POLICY "Reseller ultra can manage coupons" ON public.coupons
  FOR ALL USING (has_role(auth.uid(), 'reseller_ultra') AND created_by = auth.uid());

-- Update servers RLS for all reseller tiers
DROP POLICY IF EXISTS "Resellers can view servers" ON public.servers;
CREATE POLICY "Resellers can view servers" ON public.servers
  FOR SELECT USING (
    has_role(auth.uid(), 'reseller') OR has_role(auth.uid(), 'reseller_master') OR has_role(auth.uid(), 'reseller_ultra')
  );

-- Connections visibility for resellers
CREATE POLICY "Resellers can view own client connections" ON public.active_connections
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM public.clients 
      WHERE created_by = auth.uid() OR created_by IN (SELECT public.get_descendant_user_ids(auth.uid()))
    )
  );
