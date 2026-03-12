import { Layout } from "@/components/Layout";
import { Wifi, Ban, Search, Loader2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function Connections() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["active-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("active_connections")
        .select("*, clients(username), servers(name)")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000, // Refresh every 10s
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("active_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-connections"] });
      toast({ title: "Conexão encerrada!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const filtered = connections.filter((c: any) => {
    const username = c.clients?.username || "";
    const ip = c.ip_address || "";
    const channel = c.channel || "";
    const q = search.toLowerCase();
    return username.toLowerCase().includes(q) || ip.includes(q) || channel.toLowerCase().includes(q);
  });

  const getDuration = (startedAt: string) => {
    const start = new Date(startedAt);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conexões Ativas</h1>
          <p className="text-sm text-muted-foreground mt-1">{connections.length} conexões em tempo real</p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por usuário, IP ou canal..." className="pl-10 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Wifi className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhuma conexão ativa</h3>
            <p className="text-sm text-muted-foreground mt-1">As conexões aparecerão aqui em tempo real</p>
          </div>
        ) : (
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Usuário</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">IP</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Canal</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Servidor</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Duração</th>
                  <th className="px-5 py-3 text-muted-foreground font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((conn: any) => (
                  <tr key={conn.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                    <td className="px-5 py-3 text-foreground font-medium flex items-center gap-2">
                      <Wifi className="h-3 w-3 text-success animate-pulse" /> {conn.clients?.username || "—"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{conn.ip_address || "—"}</td>
                    <td className="px-5 py-3 text-foreground">{conn.channel || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{conn.servers?.name || "—"}</td>
                    <td className="px-5 py-3 text-foreground">{getDuration(conn.started_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7"
                        onClick={() => disconnectMutation.mutate(conn.id)}
                        disabled={disconnectMutation.isPending}
                      >
                        <Ban className="h-3 w-3 mr-1" /> Desconectar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
