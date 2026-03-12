import { Layout } from "@/components/Layout";
import { Search, Info, AlertTriangle, XCircle, CheckCircle, Loader2, ScrollText } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const icons: Record<string, any> = { info: Info, success: CheckCircle, warning: AlertTriangle, error: XCircle };
const colors: Record<string, string> = { info: "text-primary", success: "text-success", warning: "text-warning", error: "text-destructive" };
const bgColors: Record<string, string> = { info: "bg-primary/10", success: "bg-success/10", warning: "bg-warning/10", error: "bg-destructive/10" };

export default function Logs() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["system-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  const filtered = logs.filter((l: any) => {
    const matchSearch = l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.detail && l.detail.toLowerCase().includes(search.toLowerCase()));
    const matchType = filterType === "all" || l.type === filterType;
    return matchSearch && matchType;
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Logs do Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">Registro de atividades</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar logs..." className="pl-10 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="success">Sucesso</SelectItem>
              <SelectItem value="warning">Aviso</SelectItem>
              <SelectItem value="error">Erro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <ScrollText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum log encontrado</h3>
            <p className="text-sm text-muted-foreground mt-1">Os logs aparecerão conforme o sistema for utilizado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((log: any) => {
              const Icon = icons[log.type] || Info;
              return (
                <div key={log.id} className="glass-card px-5 py-3 flex items-center gap-4 animate-slide-in">
                  <div className={`p-2 rounded-lg ${bgColors[log.type] || bgColors.info}`}>
                    <Icon className={`h-4 w-4 ${colors[log.type] || colors.info}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{log.action}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{log.detail || "—"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
