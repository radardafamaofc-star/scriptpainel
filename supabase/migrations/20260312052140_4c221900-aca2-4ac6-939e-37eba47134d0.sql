
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'reseller', 'client');

-- Create function for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'client',
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Servers table
CREATE TABLE public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 25461,
  username TEXT,
  password TEXT,
  api_key TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  max_clients INTEGER NOT NULL DEFAULT 500,
  uptime TEXT DEFAULT '0%',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

-- Plans table
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  max_connections INTEGER NOT NULL DEFAULT 1,
  duration_days INTEGER NOT NULL DEFAULT 30,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  bouquets INTEGER NOT NULL DEFAULT 0,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Clients table (IPTV clients, not auth users)
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  email TEXT,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  max_connections INTEGER NOT NULL DEFAULT 1,
  expiry_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  reseller_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Resellers table
CREATE TABLE public.resellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  client_limit INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;

-- Active connections table
CREATE TABLE public.active_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ip_address TEXT,
  channel TEXT,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.active_connections ENABLE ROW LEVEL SECURITY;

-- System logs table
CREATE TABLE public.system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'info',
  action TEXT NOT NULL,
  detail TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Servers
CREATE POLICY "Admins can manage servers" ON public.servers FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Resellers can view servers" ON public.servers FOR SELECT USING (public.has_role(auth.uid(), 'reseller'));

-- Plans
CREATE POLICY "Admins can manage plans" ON public.plans FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view plans" ON public.plans FOR SELECT USING (auth.uid() IS NOT NULL);

-- Clients
CREATE POLICY "Admins can manage clients" ON public.clients FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Resellers can view own clients" ON public.clients FOR SELECT USING (public.has_role(auth.uid(), 'reseller') AND reseller_id = auth.uid());
CREATE POLICY "Resellers can create clients" ON public.clients FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'reseller') AND reseller_id = auth.uid());

-- Resellers
CREATE POLICY "Admins can manage resellers" ON public.resellers FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Resellers can view own data" ON public.resellers FOR SELECT USING (auth.uid() = user_id);

-- Active connections
CREATE POLICY "Admins can manage connections" ON public.active_connections FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- System logs
CREATE POLICY "Admins can view logs" ON public.system_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert logs" ON public.system_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON public.servers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_resellers_updated_at BEFORE UPDATE ON public.resellers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile and default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
