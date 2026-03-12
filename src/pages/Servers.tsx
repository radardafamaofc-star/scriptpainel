import { Layout } from "@/components/Layout";
import { Server, Plus, Wifi, WifiOff, MoreVertical, TestTube, Trash2, RefreshCw, Pencil, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ServerForm {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  api_key: string;
  max_clients: number;
}

const emptyForm: ServerForm = {
  name: "", host: "", port: 25461, username: "", password: "", api_key: "", max_clients: 500,
};

export default function Servers() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ServerForm>(emptyForm);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: ServerForm) => {
      if (editId) {
        const { error } = await supabase.from("servers").update({
          name: formData.name,
          host: formData.host,
          port: formData.port,
          username: formData.username,
          password: formData.password,
          api_key: formData.api_key || null,
          max_clients: formData.max_clients,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("servers").insert({
          name: formData.name,
          host: formData.host,
          port: formData.port,
          username: formData.username,
          password: formData.password,
          api_key: formData.api_key || null,
          max_clients: formData.max_clients,
          created_by: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast({ title: editId ? "Servidor atualizado!" : "Servidor adicionado!" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("servers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast({ title: "Servidor removido!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setForm(emptyForm);
    setTestResult(null);
  };

  const openEdit = (server: typeof servers[0]) => {
    setEditId(server.id);
    setForm({
      name: server.name,
      host: server.host,
      port: server.port,
      username: server.username || "",
      password: server.password || "",
      api_key: server.api_key || "",
      max_clients: server.max_clients,
    });
    setTestResult(null);
    setOpen(true);
  };

  const testConnection = async () => {
    if (!form.host || !form.username || !form.password) {
      toast({ title: "Preencha host, usuário e senha para testar", variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("xui-proxy", {
        body: {
          action: "test_connection",
          server_config: {
            host: form.host,
            port: form.port,
            username: form.username,
            password: form.password,
          },
        },
      });

      if (res.error) throw new Error(res.error.message);

      const result = res.data;
      if (result.success) {
        setTestResult({
          success: true,
          message: `Conectado! v${result.server_info?.version || '?'} — ${result.server_info?.total_users || 0} usuários, ${result.server_info?.active_cons || 0} conexões ativas`,
        });
      } else {
        setTestResult({ success: false, message: result.error || "Falha na conexão" });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "Erro ao testar conexão" });
    } finally {
      setTesting(false);
    }
  };

  const refreshServer = async (serverId: string) => {
    try {
      const res = await supabase.functions.invoke("xui-proxy", {
        body: { action: "server_info", server_id: serverId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.success) {
        queryClient.invalidateQueries({ queryKey: ["servers"] });
        toast({ title: "Status atualizado!" });
      } else {
        // Mark offline
        await supabase.from("servers").update({ status: "offline" }).eq("id", serverId);
        queryClient.invalidateQueries({ queryKey: ["servers"] });
        toast({ title: "Servidor offline", variant: "destructive" });
      }
    } catch {
      await supabase.from("servers").update({ status: "offline" }).eq("id", serverId);
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast({ title: "Servidor offline", variant: "destructive" });
    }
  };

  const handleChange = (field: keyof ServerForm, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Servidores</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie seus servidores XUI One</p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" /> Adicionar Servidor
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  {editId ? "Editar Servidor" : "Novo Servidor XUI One"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Nome do servidor</Label>
                  <Input placeholder="Ex: Servidor Principal" className="bg-secondary border-border" value={form.name} onChange={e => handleChange("name", e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-muted-foreground text-xs">IP ou Domínio</Label>
                    <Input placeholder="192.168.1.100" className="bg-secondary border-border" value={form.host} onChange={e => handleChange("host", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Porta</Label>
                    <Input type="number" className="bg-secondary border-border" value={form.port} onChange={e => handleChange("port", parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Usuário do Painel XUI</Label>
                    <Input placeholder="admin" className="bg-secondary border-border" value={form.username} onChange={e => handleChange("username", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Senha do Painel XUI</Label>
                    <Input type="password" placeholder="••••••" className="bg-secondary border-border" value={form.password} onChange={e => handleChange("password", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">API Key (opcional)</Label>
                    <Input placeholder="Chave da API" className="bg-secondary border-border" value={form.api_key} onChange={e => handleChange("api_key", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Máx. Clientes</Label>
                    <Input type="number" className="bg-secondary border-border" value={form.max_clients} onChange={e => handleChange("max_clients", parseInt(e.target.value) || 0)} />
                  </div>
                </div>

                {testResult && (
                  <div className={`p-3 rounded-lg text-sm ${testResult.success ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {testResult.message}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1 border-border" onClick={testConnection} disabled={testing}>
                    {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
                    Testar Conexão
                  </Button>
                  <Button
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => saveMutation.mutate(form)}
                    disabled={saveMutation.isPending || !form.name || !form.host || !form.username || !form.password}
                  >
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {editId ? "Salvar Alterações" : "Adicionar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : servers.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum servidor cadastrado</h3>
            <p className="text-sm text-muted-foreground mt-1">Adicione seu primeiro servidor XUI One para começar</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {servers.map((server) => (
              <div key={server.id} className="glass-card p-5 flex items-center justify-between animate-slide-in">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${server.status === "online" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {server.status === "online" ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{server.name}</h3>
                    <p className="text-sm text-muted-foreground font-mono">{server.host}:{server.port}</p>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Máx. Clientes</p>
                    <p className="text-sm font-semibold text-foreground">{server.max_clients}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Uptime</p>
                    <p className="text-sm font-semibold text-foreground">{server.uptime || "N/A"}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${server.status === "online" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {server.status === "online" ? "ONLINE" : "OFFLINE"}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem onClick={() => refreshServer(server.id)} className="gap-2">
                        <RefreshCw className="h-4 w-4" /> Atualizar Status
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(server)} className="gap-2">
                        <Pencil className="h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteMutation.mutate(server.id)} className="gap-2 text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
