
-- Settings table for admin panel configuration
CREATE TABLE public.panel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.panel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings" ON public.panel_settings
FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read settings" ON public.panel_settings
FOR SELECT TO public USING (auth.uid() IS NOT NULL);

-- Insert default credential generation settings
INSERT INTO public.panel_settings (key, value) VALUES
('credential_generation', '{"charset": "alphanumeric", "length": 8}'::jsonb),
('branding', '{"logo_url": null, "panel_name": "xSync"}'::jsonb);
