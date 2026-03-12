import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import xsyncLogoDefault from "@/assets/xsync-logo.png";

export default function Estilo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panelName, setPanelName] = useState("xSync");
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: branding } = useQuery({
    queryKey: ["panel-settings", "branding"],
    queryFn: async () => {
      const { data } = await supabase
        .from("panel_settings")
        .select("value")
        .eq("key", "branding")
        .single();
      return data?.value as { logo_url: string | null; panel_name: string } || { logo_url: null, panel_name: "xSync" };
    },
  });

  useEffect(() => {
    if (branding) {
      setPanelName(branding.panel_name || "xSync");
      setPreviewUrl(branding.logo_url || null);
    }
  }, [branding]);

  const saveBranding = useMutation({
    mutationFn: async (logoUrl: string | null) => {
      const { error } = await supabase
        .from("panel_settings")
        .update({ value: { logo_url: logoUrl, panel_name: panelName } as any })
        .eq("key", "branding");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panel-settings"] });
      toast({ title: "Estilo atualizado!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
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
