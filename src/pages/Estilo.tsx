import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { BRANDING_QUERY_KEY, BrandingSettings, cacheBranding, useBranding } from "@/hooks/use-branding";

export default function Estilo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panelName, setPanelName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: branding } = useBranding();

  useEffect(() => {
    if (branding) {
      setPanelName(branding.panel_name || "xSync");
      setPreviewUrl(branding.logo_url || null);
    }
  }, [branding]);

  const saveBranding = useMutation<void, Error, string | null, { previous?: BrandingSettings }>({
    mutationFn: async (logoUrl: string | null) => {
      const { error } = await supabase
        .from("panel_settings")
        .upsert(
          { key: "branding", value: { logo_url: logoUrl, panel_name: panelName } as any },
          { onConflict: "key" }
        );
      if (error) throw error;
    },
    onMutate: async (logoUrl) => {
      await queryClient.cancelQueries({ queryKey: BRANDING_QUERY_KEY });
      const previous = queryClient.getQueryData<BrandingSettings>(BRANDING_QUERY_KEY);
      const optimistic: BrandingSettings = { logo_url: logoUrl, panel_name: panelName };
      queryClient.setQueryData(BRANDING_QUERY_KEY, optimistic);
      cacheBranding(optimistic);
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
      toast({ title: "Estilo atualizado!" });
    },
    onError: (err: Error, _v, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BRANDING_QUERY_KEY, context.previous);
        cacheBranding(context.previous);
      }
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Erro", description: "Selecione uma imagem válida", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      // Convert to base64 data URL for storage in settings (small logo)
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setPreviewUrl(dataUrl);
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
      toast({ title: "Erro ao enviar imagem", variant: "destructive" });
    }
  };

  const removeLogo = () => {
    setPreviewUrl(null);
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estilo</h1>
          <p className="text-sm text-muted-foreground mt-1">Personalize a aparência do painel</p>
        </div>

        {/* Logo */}
        <div className="glass-card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-foreground">Logo do Painel</h2>
          <p className="text-xs text-muted-foreground">A logo aparece no menu lateral e na tela de login</p>

          <div className="flex items-center gap-6">
            {/* Preview */}
            <div className="w-20 h-20 rounded-xl border border-border bg-secondary flex items-center justify-center overflow-hidden relative">
              <img
                src={previewUrl || xsyncLogoDefault}
                alt="Logo"
                className="w-16 h-16 object-contain"
              />
              {previewUrl && (
                <button
                  onClick={removeLogo}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-2"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Enviar Logo
              </Button>
              <p className="text-xs text-muted-foreground">PNG, JPG ou SVG. Recomendado: 128x128px</p>
            </div>
          </div>
        </div>

        {/* Nome do Painel */}
        <div className="glass-card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-foreground">Nome do Painel</h2>
          <div>
            <Label className="text-muted-foreground text-sm">Nome exibido no menu lateral e login</Label>
            <Input
              value={panelName}
              onChange={e => setPanelName(e.target.value)}
              className="bg-secondary border-border mt-1"
              placeholder="xSync"
            />
          </div>
        </div>

        <Button
          onClick={() => saveBranding.mutate(previewUrl)}
          disabled={saveBranding.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saveBranding.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Estilo
        </Button>
      </div>
    </Layout>
  );
}
