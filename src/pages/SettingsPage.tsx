import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Configurações gerais do painel</p>
        </div>

        <div className="glass-card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-foreground">Perfil do Admin</h2>
          <div className="space-y-4">
            <div><Label className="text-muted-foreground text-sm">Usuário</Label><Input defaultValue="admin" className="bg-secondary border-border mt-1" /></div>
            <div><Label className="text-muted-foreground text-sm">Email</Label><Input defaultValue="admin@xsync.com" className="bg-secondary border-border mt-1" /></div>
            <div><Label className="text-muted-foreground text-sm">Nova Senha</Label><Input type="password" placeholder="••••••••" className="bg-secondary border-border mt-1" /></div>
          </div>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">Salvar Alterações</Button>
        </div>

        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Preferências</h2>
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-foreground">Notificações por email</p><p className="text-xs text-muted-foreground">Receber alertas de servidores offline</p></div>
            <Switch />
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-foreground">Auto-sincronização</p><p className="text-xs text-muted-foreground">Sincronizar servidores a cada 5 minutos</p></div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-foreground">Registro de logs detalhados</p><p className="text-xs text-muted-foreground">Salvar todas as ações da API</p></div>
            <Switch defaultChecked />
          </div>
        </div>

        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Integração XUI One</h2>
          <div className="space-y-3">
            <div><Label className="text-muted-foreground text-sm">URL base da API</Label><Input defaultValue="http://servidor:25461/api.php" className="bg-secondary border-border mt-1 font-mono text-sm" /></div>
            <div><Label className="text-muted-foreground text-sm">Intervalo de sync (minutos)</Label><Input type="number" defaultValue={5} className="bg-secondary border-border mt-1" /></div>
          </div>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">Testar Integração</Button>
        </div>
      </div>
    </Layout>
  );
}
