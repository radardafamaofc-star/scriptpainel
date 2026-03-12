import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function SettingsPage() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.user_metadata?.display_name || "");
      setEmail(user.email || "");
    }
  }, [user]);

  // Credential generation settings
  const { data: credSettings } = useQuery({
    queryKey: ["panel-settings", "credential_generation"],
    queryFn: async () => {
      const { data } = await supabase
        .from("panel_settings")
        .select("value")
        .eq("key", "credential_generation")
        .single();
      return data?.value as { charset: string; length: number } || { charset: "alphanumeric", length: 8 };
    },
    enabled: role === "admin",
  });

  const [charset, setCharset] = useState("alphanumeric");
  const [credLength, setCredLength] = useState(8);

  useEffect(() => {
    if (credSettings) {
      setCharset(credSettings.charset || "alphanumeric");
      setCredLength(credSettings.length || 8);
    }
  }, [credSettings]);

  const saveCredSettings = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("panel_settings")
        .update({ value: { charset, length: credLength } as any })
        .eq("key", "credential_generation");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panel-settings"] });
      toast({ title: "Configurações de credenciais salvas!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updates: any = { data: { display_name: displayName } };
      if (newPassword) updates.password = newPassword;

      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;

      if (user) {
        await supabase.from("profiles").update({
          display_name: displayName,
        }).eq("user_id", user.id);
      }

      toast({ title: "Perfil atualizado!" });
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Configurações gerais do painel</p>
        </div>

        {/* Perfil */}
        <div className="glass-card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-foreground">Perfil</h2>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-sm">Nome</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="bg-secondary border-border mt-1 text-foreground" />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Email</Label>
              <Input value={email} disabled className="bg-secondary border-border mt-1 text-foreground opacity-60" />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Nova Senha</Label>
              <Input type="password" placeholder="Deixe vazio para manter" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="bg-secondary border-border mt-1" />
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Alterações
          </Button>
        </div>

        {/* Geração de Credenciais - Admin only */}
        {role === "admin" && (
          <div className="glass-card p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Geração de Login/Senha</h2>
              <p className="text-xs text-muted-foreground mt-1">Configuração para geração automática de usuário e senha de clientes e testes</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground text-sm">Tipo de caracteres</Label>
                <Select value={charset} onValueChange={setCharset}>
                  <SelectTrigger className="bg-secondary border-border mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="numbers">Apenas números</SelectItem>
                    <SelectItem value="letters">Apenas letras</SelectItem>
                    <SelectItem value="alphanumeric">Letras e números</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Quantidade de caracteres</Label>
                <Input
                  type="number"
                  min={6}
                  max={32}
                  value={credLength}
                  onChange={e => setCredLength(Math.max(6, parseInt(e.target.value) || 6))}
                  className="bg-secondary border-border mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Mínimo 6 caracteres</p>
              </div>
            </div>
            <Button
              onClick={() => saveCredSettings.mutate()}
              disabled={saveCredSettings.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saveCredSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Configuração
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
