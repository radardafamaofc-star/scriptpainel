CREATE POLICY "Anyone can read settings"
ON public.panel_settings
FOR SELECT
TO anon
USING (true);