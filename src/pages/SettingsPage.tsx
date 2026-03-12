import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
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

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updates: any = { data: { display_name: displayName } };
      if (newPassword) updates.password = newPassword;

      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;

      // Update profiles table too
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

        <div className="glass-card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-foreground">Perfil</h2>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-sm">Nome</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Email</Label>
              <Input value={email} disabled className="bg-secondary border-border mt-1 opacity-50" />
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

        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Preferências</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Auto-sincronização</p>
              <p className="text-xs text-muted-foreground">Sincronizar servidores automaticamente</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Registro de logs detalhados</p>
              <p className="text-xs text-muted-foreground">Salvar todas as ações da API</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </div>
    </Layout>
  );
}
