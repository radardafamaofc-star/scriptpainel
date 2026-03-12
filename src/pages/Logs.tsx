import { Layout } from "@/components/Layout";
import { Search, Info, AlertTriangle, XCircle, CheckCircle } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

const mockLogs = [
  { id: 1, time: "2026-03-12 14:32:10", type: "info", action: "Login", detail: "Admin fez login com sucesso", user: "admin" },
  { id: 2, time: "2026-03-12 14:30:05", type: "success", action: "Cliente criado", detail: "joao_silva criado no Servidor Principal", user: "admin" },
  { id: 3, time: "2026-03-12 14:28:00", type: "warning", action: "Sincronização", detail: "Servidor EU-West demorou 15s para responder", user: "system" },
  { id: 4, time: "2026-03-12 14:25:30", type: "error", action: "Erro API", detail: "Falha ao conectar com Servidor EU-West", user: "system" },
  { id: 5, time: "2026-03-12 14:20:00", type: "info", action: "Revendedor criado", detail: "revenda_ba criado com limite de 300 clientes", user: "admin" },
  { id: 6, time: "2026-03-12 14:15:00", type: "success", action: "Renovação", detail: "maria_santos renovada por 30 dias", user: "revenda_sp" },
  { id: 7, time: "2026-03-12 14:10:00", type: "info", action: "Sincronização", detail: "Servidor Principal sincronizado - 420 usuários", user: "system" },
];

const icons = { info: Info, success: CheckCircle, warning: AlertTriangle, error: XCircle };
const colors: Record<string, string> = { info: "text-primary", success: "text-success", warning: "text-warning", error: "text-destructive" };
const bgColors: Record<string, string> = { info: "bg-primary/10", success: "bg-success/10", warning: "bg-warning/10", error: "bg-destructive/10" };

export default function Logs() {
  const [search, setSearch] = useState("");
  const filtered = mockLogs.filter(l => l.action.toLowerCase().includes(search.toLowerCase()) || l.detail.toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Logs do Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">Registro de atividades</p>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar logs..." className="pl-10 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="space-y-2">
          {filtered.map(log => {
            const Icon = icons[log.type as keyof typeof icons];
            return (
              <div key={log.id} className="glass-card px-5 py-3 flex items-center gap-4 animate-slide-in">
                <div className={`p-2 rounded-lg ${bgColors[log.type]}`}>
                  <Icon className={`h-4 w-4 ${colors[log.type]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{log.action}</span>
                    <span className="text-xs text-muted-foreground">por {log.user}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{log.detail}</p>
                </div>
                <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{log.time}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
