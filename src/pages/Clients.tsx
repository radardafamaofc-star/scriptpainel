import { Layout } from "@/components/Layout";
import { Plus, Search, MoreVertical, Loader2, Users, Pencil, Trash2, RefreshCw, Ban, CheckCircle, Copy, Key, Eye, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { DEFAULT_TEMPLATE, renderTemplate } from "@/lib/template";

interface ClientForm {
  username: string;
  password: string;
  email: string;
  plan_id: string;
  server_id: string;
  max_connections: number;
  expiry_date: string;
}

const emptyForm: ClientForm = {
  username: "", password: "", email: "", plan_id: "", server_id: "", max_connections: 1, expiry_date: "",
};

function generatePassword(length = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function generateUsername() {
  return "user_" + Math.random().toString(36).substring(2, 8);
}

export default function Clients() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, plans(name, duration_days, max_connections), servers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: servers = [] } = useQuery({
    queryKey: ["servers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servers").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (f: ClientForm) => {
      const payload = {
        username: f.username,
        password: f.password,
        email: f.email || null,
        plan_id: f.plan_id || null,
        server_id: f.server_id || null,
        max_connections: f.max_connections,
        expiry_date: f.expiry_date || null,
      };
      if (editId) {
        const updatePayload: any = { ...payload };
        if (!f.password) delete updatePayload.password;
        const { error } = await supabase.from("clients").update(updatePayload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert({ ...payload, created_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: editId ? "Cliente atualizado!" : "Cliente criado!" });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente removido!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "active" ? "suspended" : "active";
      const { error } = await supabase.from("clients").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Status atualizado!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const renewMutation = useMutation({
    mutationFn: async (client: any) => {
      const days = client.plans?.duration_days || 30;
      const baseDate = client.expiry_date && new Date(client.expiry_date) > new Date()
        ? new Date(client.expiry_date)
        : new Date();
      const newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + days);
      const { error } = await supabase.from("clients").update({
        expiry_date: newExpiry.toISOString(),
        status: "active",
      }).eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente renovado!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const openNew = () => {
    setEditId(null);
    setForm({ ...emptyForm, username: generateUsername(), password: generatePassword() });
    setOpen(true);
  };

  const openEdit = (client: any) => {
    setEditId(client.id);
    setForm({
      username: client.username,
      password: "",
      email: client.email || "",
      plan_id: client.plan_id || "",
      server_id: client.server_id || "",
      max_connections: client.max_connections,
      expiry_date: client.expiry_date ? format(new Date(client.expiry_date), "yyyy-MM-dd") : "",
    });
    setOpen(true);
  };

  const onPlanChange = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + plan.duration_days);
      setForm(prev => ({
        ...prev,
        plan_id: planId,
        max_connections: plan.max_connections,
        server_id: plan.server_id || prev.server_id,
        expiry_date: format(expiry, "yyyy-MM-dd"),
      }));
    } else {
      setForm(prev => ({ ...prev, plan_id: planId }));
    }
  };

  const copyCredentials = (client: any) => {
    const text = `Usuário: ${client.username}\nSenha: ${client.password}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Credenciais copiadas!" });
  };

  const filtered = clients.filter((c: any) => {
    const matchSearch = c.username.toLowerCase().includes(search.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusStyle: Record<string, string> = {
    active: "bg-success/10 text-success",
    expired: "bg-warning/10 text-warning",
    suspended: "bg-destructive/10 text-destructive",
  };
  const statusLabel: Record<string, string> = { active: "Ativo", expired: "Expirado", suspended: "Suspenso" };

  const getClientStatus = (client: any) => {
    if (client.status === "suspended") return "suspended";
    if (client.expiry_date && new Date(client.expiry_date) < new Date()) return "expired";
    return client.status;
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1">{clients.length} clientes registrados</p>
          </div>
          <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" /> Novo Cliente
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por usuário ou email..." className="pl-10 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="expired">Expirados</SelectItem>
              <SelectItem value="suspended">Suspensos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dialog for create/edit */}
        <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
          <DialogContent className="bg-card border-border sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-foreground">{editId ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Usuário</Label>
                  <div className="flex gap-1">
                    <Input className="bg-secondary border-border" value={form.username} onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))} />
                    {!editId && (
                      <Button variant="outline" size="icon" className="shrink-0 border-border" onClick={() => setForm(prev => ({ ...prev, username: generateUsername() }))}>
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">{editId ? "Nova Senha (vazio = manter)" : "Senha"}</Label>
                  <div className="flex gap-1">
                    <Input className="bg-secondary border-border font-mono" value={form.password} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} />
                    <Button variant="outline" size="icon" className="shrink-0 border-border" onClick={() => setForm(prev => ({ ...prev, password: generatePassword() }))}>
                      <Key className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Email (opcional)</Label>
                <Input type="email" placeholder="cliente@email.com" className="bg-secondary border-border" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Plano</Label>
                  <Select value={form.plan_id} onValueChange={onPlanChange}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} — R$ {Number(p.price).toFixed(2)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Servidor</Label>
                  <Select value={form.server_id} onValueChange={v => setForm(prev => ({ ...prev, server_id: v }))}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {servers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Máx. Conexões</Label>
                  <Input type="number" min={1} className="bg-secondary border-border" value={form.max_connections} onChange={e => setForm(prev => ({ ...prev, max_connections: parseInt(e.target.value) || 1 }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Data de Expiração</Label>
                  <Input type="date" className="bg-secondary border-border" value={form.expiry_date} onChange={e => setForm(prev => ({ ...prev, expiry_date: e.target.value }))} />
                </div>
              </div>
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending || !form.username || (!editId && !form.password)}
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editId ? "Salvar Alterações" : "Criar Cliente"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">
              {search || filterStatus !== "all" ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || filterStatus !== "all" ? "Tente ajustar os filtros" : "Crie seu primeiro cliente para começar"}
            </p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Usuário</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Plano</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Conexões</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Expira</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Servidor</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((client: any) => {
                  const status = getClientStatus(client);
                  return (
                    <tr key={client.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-foreground">{client.username}</p>
                          <p className="text-xs text-muted-foreground">{client.email || "—"}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-foreground">{client.plans?.name || "—"}</td>
                      <td className="px-5 py-3 text-foreground font-mono">{client.max_connections}</td>
                      <td className="px-5 py-3 text-foreground">
                        {client.expiry_date ? format(new Date(client.expiry_date), "dd/MM/yyyy") : "—"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{client.servers?.name || "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[status] || statusStyle.active}`}>
                          {statusLabel[status] || status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border">
                            <DropdownMenuItem onClick={() => copyCredentials(client)} className="gap-2">
                              <Copy className="h-4 w-4" /> Copiar Credenciais
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(client)} className="gap-2">
                              <Pencil className="h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => renewMutation.mutate(client)} className="gap-2">
                              <RefreshCw className="h-4 w-4" /> Renovar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({ id: client.id, status: client.status })} className="gap-2">
                              {client.status === "active" ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                              {client.status === "active" ? "Suspender" : "Ativar"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(client.id)} className="gap-2 text-destructive focus:text-destructive">
                              <Trash2 className="h-4 w-4" /> Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
