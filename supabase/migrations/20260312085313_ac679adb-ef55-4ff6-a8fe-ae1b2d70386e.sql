
-- Drop all restrictive policies on resellers and recreate as permissive
DROP POLICY IF EXISTS "Admins can manage resellers" ON public.resellers;
DROP POLICY IF EXISTS "Reseller managers can create resellers" ON public.resellers;
DROP POLICY IF EXISTS "Reseller managers can update sub-resellers" ON public.resellers;
DROP POLICY IF EXISTS "Resellers can view own data" ON public.resellers;

CREATE POLICY "Admins can manage resellers" ON public.resellers
FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Reseller managers can create resellers" ON public.resellers
FOR INSERT TO public WITH CHECK (
  (has_role(auth.uid(), 'reseller_master'::app_role) OR has_role(auth.uid(), 'reseller_ultra'::app_role))
  AND created_by = auth.uid()
);

CREATE POLICY "Reseller managers can update sub-resellers" ON public.resellers
FOR UPDATE TO public USING (
  (has_role(auth.uid(), 'reseller_master'::app_role) OR has_role(auth.uid(), 'reseller_ultra'::app_role))
  AND (created_by = auth.uid() OR user_id IN (SELECT get_descendant_user_ids(auth.uid())))
);

CREATE POLICY "Resellers can view own data" ON public.resellers
FOR SELECT TO public USING (
  user_id = auth.uid()
  OR created_by = auth.uid()
  OR user_id IN (SELECT get_descendant_user_ids(auth.uid()))
);

-- Fix profiles: allow resellers/admins to see sub-user profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT TO public USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Resellers can view sub profiles" ON public.profiles
FOR SELECT TO public USING (
  user_id IN (SELECT get_descendant_user_ids(auth.uid()))
);

CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT TO public WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO public USING (auth.uid() = user_id);

-- Fix user_roles policies
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Reseller managers can view sub-reseller roles" ON public.user_roles;
DROP POLICY IF EXISTS "Reseller managers can set reseller roles" ON public.user_roles;

CREATE POLICY "Admins can manage all roles" ON public.user_roles
FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own roles" ON public.user_roles
FOR SELECT TO public USING (auth.uid() = user_id);

CREATE POLICY "Reseller managers can view sub-reseller roles" ON public.user_roles
FOR SELECT TO public USING (
  (has_role(auth.uid(), 'reseller_master'::app_role) OR has_role(auth.uid(), 'reseller_ultra'::app_role))
  AND user_id IN (SELECT get_descendant_user_ids(auth.uid()))
);

CREATE POLICY "Reseller managers can set reseller roles" ON public.user_roles
FOR UPDATE TO public
USING (has_role(auth.uid(), 'reseller_master'::app_role) OR has_role(auth.uid(), 'reseller_ultra'::app_role))
WITH CHECK (role = ANY (ARRAY['reseller'::app_role, 'reseller_master'::app_role, 'reseller_ultra'::app_role]));
