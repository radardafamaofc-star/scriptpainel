import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BrandingSettings = {
  logo_url: string | null;
  panel_name: string;
};

export const BRANDING_QUERY_KEY = ["panel-settings", "branding"] as const;
const BRANDING_STORAGE_KEY = "panel-branding-cache-v1";

const normalizeBranding = (value: unknown): BrandingSettings => {
  const obj = (value ?? {}) as Partial<BrandingSettings>;
  const panel_name = typeof obj.panel_name === "string" && obj.panel_name.trim() ? obj.panel_name.trim() : "";
  const logo_url = typeof obj.logo_url === "string" && obj.logo_url.trim() ? obj.logo_url : null;

  // Compatibilidade com branding antigo padrão: nunca exibir xSync como fallback
  if (panel_name.toLowerCase() === "xsync") {
    return { logo_url: null, panel_name: "" };
  }

  return {
    logo_url,
    panel_name,
  };
};

export const getCachedBranding = (): BrandingSettings | undefined => {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(BRANDING_STORAGE_KEY);
    if (!raw) return undefined;
    return normalizeBranding(JSON.parse(raw));
  } catch {
    return undefined;
  }
};

export const cacheBranding = (branding: BrandingSettings) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(branding));
};

export function useBranding() {
  return useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: async (): Promise<BrandingSettings> => {
      const { data, error } = await supabase
        .from("panel_settings")
        .select("value")
        .eq("key", "branding")
        .maybeSingle();

      if (error) throw error;

      const branding = normalizeBranding(data?.value);
      cacheBranding(branding);
      return branding;
    },
    initialData: getCachedBranding,
    staleTime: 60_000,
  });
}
