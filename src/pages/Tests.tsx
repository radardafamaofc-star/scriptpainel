import { Layout } from "@/components/Layout";
import { TestTube, Plus, Loader2, Clock, Trash2, Copy, Server } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { generateUsername, generatePassword } from "@/lib/credentials";

async function generateTestCredentials() {
  const [username, password] = await Promise.all([generateUsername(), generatePassword()]);
  return { username, password };
}

export default function Tests() {
  const [open, setOpen] = useState(false);
  const [serverId, setServerId] = useState("");
  const [duration, setDuration] = useState("4");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["test-lines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("test_lines")
        .select("*, servers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: servers = [] } = useQuery({
    queryKey: ["servers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servers").select("id, name, status").order("name");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const creds = await generateTestCredentials();
      const hours = parseInt(duration);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + hours);

      // 1. Save locally
      const { data: createdTest, error } = await supabase.from("test_lines").insert({
        username: creds.username,
        password: creds.password,
        server_id: serverId || null,
        created_by: user!.id,
        duration_hours: hours,
        expires_at: expiresAt.toISOString(),
      }).select("id").single();
      if (error) throw error;

      // 2. Provision on XUI server
      if (serverId) {
        const expTimestamp = Math.floor(expiresAt.getTime() / 1000);
        const { data: xuiRes, error: xuiErr } = await supabase.functions.invoke("xui-proxy", {
          body: {
            action: "xui_command",
            server_id: serverId,
            xui_action: "user_create",
            xui_params: {
              username: creds.username,
              password: creds.password,
              max_connections: "1",
              exp_date: String(expTimestamp),
              is_trial: "1",
              bouquet: "",
            },
          },
        });

        const xuiMessage = xuiErr?.message || (xuiRes && !xuiRes.success ? xuiRes.error : null);
        if (xuiMessage) {
          await supabase.from("test_lines").delete().eq("id", createdTest.id);
          throw new Error(`Falha ao criar no XUI: ${xuiMessage}`);
        }
      }

      return creds;
    },
    onSuccess: (creds) => {
      queryClient.invalidateQueries({ queryKey: ["test-lines"] });
      toast({ title: "Teste criado!", description: `Usuário: ${creds.username}` });
      setOpen(false);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("test_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-lines"] });
      toast({ title: "Teste removido!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const copyCredentials = (test: any) => {
    navigator.clipboard.writeText(`Usuário: ${test.username}\nSenha: ${test.password}`);
    toast({ title: "Credenciais copiadas!" });
  };

  const getStatus = (test: any) => {
    if (test.status === "expired" || new Date(test.expires_at) < new Date()) return "expired";
    return "active";
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Testes</h1>
            <p className="text-sm text-muted-foreground mt-1">Gere linhas de teste gratuitas para demonstração</p>
          </div>
          <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" /> Gerar Teste
          </Button>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="bg-card border-border sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-foreground">Gerar Teste Rápido</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Servidor</Label>
                <Select value={serverId} onValueChange={setServerId}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione um servidor" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.filter(s => s.status === "online").map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Duração (horas)</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hora</SelectItem>
                    <SelectItem value="2">2 horas</SelectItem>
                    <SelectItem value="4">4 horas</SelectItem>
                    <SelectItem value="6">6 horas</SelectItem>
                    <SelectItem value="12">12 horas</SelectItem>
                    <SelectItem value="24">24 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs text-primary/80">Testes não consomem créditos. Use para demonstrar o serviço antes de ativar o cliente.</p>
              </div>
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !serverId}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Gerar Teste
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : tests.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <TestTube className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum teste gerado</h3>
            <p className="text-sm text-muted-foreground mt-1">Gere um teste rápido para demonstrar o serviço</p>
          </div>
        ) : (
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Usuário</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Senha</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Servidor</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Duração</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Expira</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {tests.map((test: any) => {
                  const status = getStatus(test);
                  return (
                    <tr key={test.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                      <td className="px-5 py-3 text-foreground font-mono text-xs">{test.username}</td>
                      <td className="px-5 py-3 text-foreground font-mono text-xs">{test.password}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{test.servers?.name || "—"}</td>
                      <td className="px-5 py-3 text-foreground">{test.duration_hours}h</td>
                      <td className="px-5 py-3 text-foreground text-xs">{format(new Date(test.expires_at), "dd/MM HH:mm")}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                          {status === "active" ? "Ativo" : "Expirado"}
                        </span>
                      </td>
                      <td className="px-5 py-3 flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => copyCredentials(test)}>
                          <Copy className="h-3 w-3 mr-1" /> Copiar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(test.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
