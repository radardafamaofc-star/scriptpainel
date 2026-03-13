import { Layout } from "@/components/Layout";
import { Plus, Search, Loader2, Users, Pencil, Trash2, RefreshCw, Ban, CheckCircle, Copy, Key, Eye, MessageCircle, List, Wifi, Bell, ArrowUpCircle, Minus, Info, Lock, User, Calendar, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { DEFAULT_TEMPLATE, renderTemplate } from "@/lib/template";
import { generateUsername as genUser, generatePassword as genPass } from "@/lib/credentials";
import { Textarea } from "@/components/ui/textarea";

interface ClientForm {
  username: string;
  password: string;
  email: string;
  plan_id: string;
  server_id: string;
  max_connections: number;
  expiry_date: string;
  name: string;
  telegram: string;
  whatsapp: string;
  notes: string;
  custom_price: string;
}

const emptyForm: ClientForm = {
  username: "", password: "", email: "", plan_id: "", server_id: "", max_connections: 1, expiry_date: "",
  name: "", telegram: "", whatsapp: "", notes: "", custom_price: "",
};


export default function Clients() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterServer, setFilterServer] = useState<string>("all");
  const [detailsClient, setDetailsClient] = useState<any>(null);
  const [convertDialog, setConvertDialog] = useState<any>(null);
  const [convertPlanId, setConvertPlanId] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, plans(name, duration_days, max_connections, price, template, server_id), servers(name, host, dns, template)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: testLines = [] } = useQuery({
    queryKey: ["test-lines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("test_lines")
        .select("*, servers(name, host, dns, template)")
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
      const { data, error } = await supabase.from("servers").select("id, name, dns").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch creator profiles for clients
  const creatorIds = [...new Set([...clients.map((c: any) => c.created_by), ...testLines.map((t: any) => t.created_by)])].filter(Boolean);
  const { data: creatorProfiles = {} } = useQuery({
    queryKey: ["creator-profiles", creatorIds.join(",")],
    queryFn: async () => {
      if (creatorIds.length === 0) return {};
      const { data } = await supabase.from("profiles").select("user_id, display_name, email").in("user_id", creatorIds);
      const map: Record<string, any> = {};
      (data || []).forEach((p: any) => { map[p.user_id] = p; });
      return map;
    },
    enabled: creatorIds.length > 0,
    staleTime: 10000,
  });

  const [lastCreatedClient, setLastCreatedClient] = useState<any>(null);

  const saveMutation = useMutation({
    mutationFn: async (f: ClientForm) => {
      const selectedPlan = plans.find((p: any) => p.id === f.plan_id);
      const isTestPlan = selectedPlan?.is_test === true;

      // Convert local datetime to proper ISO string with timezone
      let expiryISO: string | null = null;
      if (f.expiry_date) {
        const d = new Date(f.expiry_date);
        expiryISO = d.toISOString();
      }

      if (editId) {
        // Edit always goes to clients table
        const payload = {
          username: f.username,
          password: f.password || undefined,
          email: f.email || null,
          plan_id: f.plan_id || null,
          server_id: f.server_id || null,
          max_connections: f.max_connections,
          expiry_date: expiryISO,
        };
        if (!f.password) delete payload.password;
        const { error } = await supabase.from("clients").update(payload).eq("id", editId);
        if (error) throw error;
        return { data: null, isTest: false };
      }

      if (isTestPlan) {
        // Insert into test_lines
        const totalHours = getPlanDurationHours(selectedPlan);
        const testPayload = {
          username: f.username,
          password: f.password,
          server_id: f.server_id || null,
          duration_hours: totalHours,
          expires_at: expiryISO!,
          created_by: user!.id,
        };
        const { data, error } = await supabase
          .from("test_lines")
          .insert(testPayload)
          .select("*, servers(name, host, dns, template)")
          .single();
        if (error) throw error;

        // Provision on XUI
        if (f.server_id) {
          const expTimestamp = Math.floor(new Date(expiryISO!).getTime() / 1000);
          const packageId = String((selectedPlan as any)?.package_id ?? "").trim();
          const { data: xuiRes, error: xuiErr } = await supabase.functions.invoke("xui-proxy", {
            body: {
              action: "xui_command",
              server_id: f.server_id,
              xui_action: "user_create",
              xui_params: {
                username: f.username,
                password: f.password,
                max_connections: "1",
                exp_date: String(expTimestamp),
                package_id: packageId,
              },
            },
          });

          const xuiMessage = xuiErr?.message || (xuiRes && !xuiRes.success ? xuiRes.error : null);
          if (xuiMessage) {
            await supabase.from("test_lines").delete().eq("id", data.id);
            throw new Error(`Falha ao criar no XUI: ${xuiMessage}`);
          }
        }

        return { data, isTest: true };
      } else {
        // Insert into clients
        const payload = {
          username: f.username,
          password: f.password,
          email: f.email || null,
          plan_id: f.plan_id || null,
          server_id: f.server_id || null,
          max_connections: f.max_connections,
          expiry_date: expiryISO,
          created_by: user!.id,
        };
        const { data, error } = await supabase
          .from("clients")
          .insert(payload)
          .select("*, plans(name, duration_days, max_connections, price, template, server_id), servers(name, host, dns, template)")
          .single();
        if (error) throw error;

        // Provision on XUI
        if (f.server_id) {
          const expTimestamp = expiryISO ? Math.floor(new Date(expiryISO).getTime() / 1000) : 0;
          const packageId = String((selectedPlan as any)?.package_id ?? "").trim();
          const { data: xuiRes, error: xuiErr } = await supabase.functions.invoke("xui-proxy", {
            body: {
              action: "xui_command",
              server_id: f.server_id,
              xui_action: "user_create",
              xui_params: {
                username: f.username,
                password: f.password,
                max_connections: String(f.max_connections),
                exp_date: String(expTimestamp),
                package_id: packageId,
              },
            },
          });

          const xuiMessage = xuiErr?.message || (xuiRes && !xuiRes.success ? xuiRes.error : null);
          if (xuiMessage) {
            await supabase.from("clients").delete().eq("id", data.id);
            throw new Error(`Falha ao criar no XUI: ${xuiMessage}`);
          }
        }

        return { data, isTest: false };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["test-lines"] });
      
      if (!editId && result?.data) {
        toast({ title: result.isTest ? "Teste criado!" : "Cliente criado!" });
        if (!stayOpen) {
          setDetailsClient({ ...result.data, _type: result.isTest ? "test" : "client" });
          closeDialog();
        } else {
          genUser().then(u => genPass().then(p => setForm(prev => ({ ...prev, username: u, password: p, email: "" }))));
        }
      } else {
        toast({ title: "Cliente atualizado!" });
        closeDialog();
      }
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

  const deleteTestMutation = useMutation({
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

  const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{ type: "expired" | "active" | "tests"; count: number } | null>(null);

  const bulkDeleteMutation = useMutation({
    mutationFn: async (type: "expired" | "active" | "tests") => {
      if (type === "tests") {
        const ids = testLines.map((t: any) => t.id);
        if (ids.length === 0) return;
        const { error } = await supabase.from("test_lines").delete().in("id", ids);
        if (error) throw error;
      } else if (type === "expired") {
        const expiredIds = clients.filter((c: any) => getClientStatus(c) === "expired").map((c: any) => c.id);
        if (expiredIds.length === 0) return;
        const { error } = await supabase.from("clients").delete().in("id", expiredIds);
        if (error) throw error;
      } else if (type === "active") {
        const activeIds = clients.filter((c: any) => getClientStatus(c) === "active").map((c: any) => c.id);
        if (activeIds.length === 0) return;
        const { error } = await supabase.from("clients").delete().in("id", activeIds);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["test-lines"] });
      toast({ title: "Itens removidos com sucesso!" });
      setBulkDeleteDialog(null);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handleBulkDelete = (type: "expired" | "active" | "tests") => {
    let count = 0;
    if (type === "tests") count = testLines.length;
    else if (type === "expired") count = clients.filter((c: any) => getClientStatus(c) === "expired").length;
    else if (type === "active") count = clients.filter((c: any) => getClientStatus(c) === "active").length;
    if (count === 0) {
      toast({ title: "Nenhum item encontrado para remover." });
      return;
    }
    setBulkDeleteDialog({ type, count });
  };

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

  const toggleTestStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "active" ? "blocked" : "active";
      const { error } = await supabase.from("test_lines").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-lines"] });
      toast({ title: "Status do teste atualizado!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const renewMutation = useMutation({
    mutationFn: async (client: any) => {
      const plan = client.plans;
      const totalHours = plan ? getPlanDurationHours(plan) : 30 * 24;
      const baseDate = client.expiry_date && new Date(client.expiry_date) > new Date()
        ? new Date(client.expiry_date)
        : new Date();
      const newExpiry = new Date(baseDate.getTime() + totalHours * 60 * 60 * 1000);
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

  const convertTestMutation = useMutation({
    mutationFn: async ({ testLine, planId }: { testLine: any; planId: string }) => {
      const plan = plans.find((p: any) => p.id === planId);
      if (!plan) throw new Error("Plano não encontrado");
      const totalHours = getPlanDurationHours(plan);
      const expiry = new Date(Date.now() + totalHours * 60 * 60 * 1000);
      const { error: insertErr } = await supabase.from("clients").insert({
        username: testLine.username,
        password: testLine.password,
        plan_id: planId,
        server_id: testLine.server_id,
        max_connections: plan.max_connections,
        expiry_date: expiry.toISOString(),
        created_by: user!.id,
      });
      if (insertErr) throw insertErr;
      const { error: deleteErr } = await supabase.from("test_lines").delete().eq("id", testLine.id);
      if (deleteErr) throw deleteErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["test-lines"] });
      toast({ title: "Teste convertido em cliente!" });
      setConvertDialog(null);
      setConvertPlanId("");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const openNew = async () => {
    setEditId(null);
    const [username, password] = await Promise.all([genUser(), genPass()]);
    setForm({ ...emptyForm, username, password });
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
      expiry_date: client.expiry_date ? format(new Date(client.expiry_date), "yyyy-MM-dd'T'HH:mm") : "",
      name: "", telegram: "", whatsapp: "", notes: "", custom_price: "",
    });
    setOpen(true);
  };

  const [stayOpen, setStayOpen] = useState(false);

  const getPlanDurationHours = (plan: any): number => {
    if (plan.duration_hours && plan.duration_hours > 0 && plan.duration_hours !== 720) return plan.duration_hours;
    if (plan.duration_days && plan.duration_days > 0) return plan.duration_days * 24;
    return plan.duration_hours || 720;
  };

  const onPlanChange = (planId: string) => {
    const plan = plans.find((p: any) => p.id === planId);
    if (plan) {
      const totalHours = getPlanDurationHours(plan);
      const expiry = new Date();
      expiry.setTime(expiry.getTime() + totalHours * 60 * 60 * 1000);
      setForm(prev => ({
        ...prev,
        plan_id: planId,
        max_connections: plan.max_connections,
        server_id: plan.server_id || prev.server_id,
        expiry_date: format(expiry, "yyyy-MM-dd'T'HH:mm"),
      }));
    } else {
      setForm(prev => ({ ...prev, plan_id: planId }));
    }
  };

  const formatPlanDuration = (plan: any): string => {
    const hours = getPlanDurationHours(plan);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} dias`;
    const months = Math.round(days / 30);
    if (months <= 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`;
    const years = Math.round(months / 12);
    return `${years} ${years === 1 ? 'ano' : 'anos'}`;
  };

  const filteredPlans = plans.filter((p: any) => !form.server_id || p.server_id === form.server_id);
  const paidPlans = filteredPlans.filter((p: any) => !p.is_test);
  const testPlansForDialog = filteredPlans.filter((p: any) => p.is_test);

  const getServerName = (serverId: string) => {
    const s = servers.find((sv: any) => sv.id === serverId);
    return s?.name || "";
  };

  const copyCredentials = (client: any) => {
    const text = `Usuário: ${client.username}\nSenha: ${client.password}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Credenciais copiadas!" });
  };

  const getDnsFromServer = (server: any) => {
    if (!server) return { dns: "", dnsHost: "" };
    const dnsValue = server.dns || server.host || "";
    let dns = dnsValue;
    let dnsHost = dnsValue;
    try {
      const parsed = new URL(dnsValue);
      dns = `${parsed.protocol}//${parsed.host}`;
      dnsHost = parsed.host;
    } catch {
      try {
        const parsed = new URL(server.host);
        dns = `${parsed.protocol}//${parsed.host}`;
        dnsHost = parsed.host;
      } catch { /* keep raw */ }
    }
    return { dns, dnsHost };
  };

  const getClientTemplate = (client: any): string => {
    const planTemplate = client.plans?.template;
    const serverTemplate = client.servers?.template;
    return planTemplate || serverTemplate || DEFAULT_TEMPLATE;
  };

  const getRenderedTemplate = (client: any): string => {
    const template = getClientTemplate(client);
    const { dns, dnsHost } = getDnsFromServer(client.servers);
    return renderTemplate(template, {
      username: client.username || "",
      password: client.password || "",
      package: client.plans?.name || "",
      pay_url: "",
      plan_price: client.plans?.price ? `R$ ${Number(client.plans.price).toFixed(2)}` : "R$ 0,00",
      expires_at: client.expiry_date ? format(new Date(client.expiry_date), "dd/MM/yyyy HH:mm:ss") : "",
      connections: String(client.max_connections || 1),
      dns,
      dns_host: dnsHost,
    });
  };

  const getTestRenderedTemplate = (test: any): string => {
    const template = test.servers?.template || DEFAULT_TEMPLATE;
    const { dns, dnsHost } = getDnsFromServer(test.servers);
    return renderTemplate(template, {
      username: test.username || "",
      password: test.password || "",
      package: "Teste",
      pay_url: "",
      plan_price: "Grátis",
      expires_at: test.expires_at ? format(new Date(test.expires_at), "dd/MM/yyyy HH:mm:ss") : "",
      connections: "1",
      dns,
      dns_host: dnsHost,
    });
  };

  const copyTemplate = (client: any) => {
    const text = getRenderedTemplate(client);
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  };

  const copyTestTemplate = (test: any) => {
    const text = getTestRenderedTemplate(test);
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  };

  const sendWhatsApp = (client: any) => {
    const text = encodeURIComponent(getRenderedTemplate(client));
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const sendTestWhatsApp = (test: any) => {
    const text = encodeURIComponent(getTestRenderedTemplate(test));
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  // Merge clients and test lines into a unified list
  const unifiedList = [
    ...clients.map((c: any) => ({ ...c, _type: "client" as const })),
    ...testLines.map((t: any) => ({ ...t, _type: "test" as const, max_connections: 1 })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const getCreatorName = (item: any) => {
    const id = item.created_by;
    if (!id) return "—";
    const profile = (creatorProfiles as any)[id];
    return profile?.display_name || profile?.email || "—";
  };

  const filtered = unifiedList.filter((item: any) => {
    const matchSearch = item.username.toLowerCase().includes(search.toLowerCase()) ||
      (item.email && item.email.toLowerCase().includes(search.toLowerCase()));
    const itemStatus = item._type === "test" ? item.status : getClientStatus(item);
    const matchStatus = filterStatus === "all" ||
      (filterStatus === "test" && item._type === "test") ||
      (filterStatus !== "test" && itemStatus === filterStatus);
    const matchServer = filterServer === "all" || item.server_id === filterServer;
    return matchSearch && matchStatus && matchServer;
  });

  const statusStyle: Record<string, string> = {
    active: "bg-success/10 text-success",
    expired: "bg-warning/10 text-warning",
    suspended: "bg-destructive/10 text-destructive",
    blocked: "bg-destructive/10 text-destructive",
  };
  const statusLabel: Record<string, string> = { active: "Ativo", expired: "Expirado", suspended: "Suspenso", blocked: "Bloqueado" };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1">{clients.length} clientes · {testLines.length} testes</p>
          </div>
          <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" /> Novo Cliente
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por usuário ou email..." className="pl-10 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="flex-1 sm:w-40 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="expired">Expirados</SelectItem>
              <SelectItem value="suspended">Suspensos</SelectItem>
              <SelectItem value="blocked">Bloqueados</SelectItem>
              <SelectItem value="test">Testes</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterServer} onValueChange={setFilterServer}>
            <SelectTrigger className="flex-1 sm:w-44 bg-card border-border">
              <SelectValue placeholder="Servidor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Servidores</SelectItem>
              {servers.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4 mr-1" /> Apagar em Massa
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleBulkDelete("expired")} className="text-warning">
                <AlertTriangle className="h-4 w-4 mr-2" /> Todos Expirados
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBulkDelete("active")} className="text-success">
                <CheckCircle className="h-4 w-4 mr-2" /> Todos Ativos
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleBulkDelete("tests")} className="text-primary">
                <Key className="h-4 w-4 mr-2" /> Todos Testes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        {/* Bulk delete confirmation */}
        <AlertDialog open={!!bulkDeleteDialog} onOpenChange={(v) => { if (!v) setBulkDeleteDialog(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">Confirmar exclusão em massa</AlertDialogTitle>
              <AlertDialogDescription>
                Você está prestes a apagar <strong>{bulkDeleteDialog?.count}</strong>{" "}
                {bulkDeleteDialog?.type === "expired" ? "clientes expirados" : bulkDeleteDialog?.type === "active" ? "clientes ativos" : "testes"}.
                <br />Esta ação é <strong>irreversível</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => bulkDeleteDialog && bulkDeleteMutation.mutate(bulkDeleteDialog.type)}
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Apagar {bulkDeleteDialog?.count} itens
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog for create/edit */}
        <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
          <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">{editId ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              {/* Server Select */}
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Servidor <span className="text-destructive">*</span></Label>
                <Select value={form.server_id} onValueChange={v => setForm(prev => ({ ...prev, server_id: v, plan_id: "" }))}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione o servidor" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Plan Select */}
              {form.server_id && (
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Plano <span className="text-destructive">*</span></Label>
                  <Select value={form.plan_id} onValueChange={onPlanChange}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Selecione o plano" />
                    </SelectTrigger>
                    <SelectContent>
                      {paidPlans.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-xs text-muted-foreground uppercase tracking-wider">Pago</SelectLabel>
                          {paidPlans.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {getServerName(p.server_id)} • {p.name} • {formatPlanDuration(p)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {testPlansForDialog.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-xs text-muted-foreground uppercase tracking-wider">Teste</SelectLabel>
                          {testPlansForDialog.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {getServerName(p.server_id)} • {p.name} • {formatPlanDuration(p)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* === Plan details section — shown after plan is selected === */}
              {form.plan_id && (() => {
                const selectedPlan = plans.find((p: any) => p.id === form.plan_id);
                if (!selectedPlan) return null;
                const isTest = selectedPlan.is_test;
                const planPrice = Number(selectedPlan.price || 0);
                const totalPrice = form.custom_price ? Number(form.custom_price) : planPrice * form.max_connections;

                return (
                  <>
                    {/* Connections */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Conexões <span className="text-destructive">*</span></Label>
                      <div className="flex items-center gap-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-r-none border-border"
                          onClick={() => setForm(prev => ({ ...prev, max_connections: Math.max(1, prev.max_connections - 1) }))}
                          disabled={form.max_connections <= 1}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          className="bg-secondary border-border rounded-none text-center w-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={form.max_connections}
                          onChange={e => setForm(prev => ({ ...prev, max_connections: Math.max(1, parseInt(e.target.value) || 1) }))}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-l-none border-border"
                          onClick={() => setForm(prev => ({ ...prev, max_connections: prev.max_connections + 1 }))}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                        <Info className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                        Este pacote vem com {selectedPlan.max_connections} conexão(ões). Você pode ajustar conforme necessário.
                      </div>
                    </div>

                    {/* Credits info */}
                    {selectedPlan.bouquets > 0 && (
                      <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent-foreground">
                        <Info className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                        Custo: {selectedPlan.bouquets} crédito(s) por conexão
                      </div>
                    )}

                    {/* Username */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Usuário <span className="text-destructive">*</span></Label>
                      <div className="flex gap-1">
                        <Input className="bg-secondary border-border font-mono" value={form.username} onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))} />
                        {!editId && (
                          <Button variant="outline" size="icon" className="shrink-0 border-border" onClick={async () => { const u = await genUser(); setForm(prev => ({ ...prev, username: u })); }}>
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                        <p>• Pode conter letras, números e traços</p>
                        <p>• Mínimo de 6 caracteres</p>
                      </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{editId ? "Nova Senha (vazio = manter)" : "Senha"} <span className="text-destructive">*</span></Label>
                      <div className="flex gap-1">
                        <Input className="bg-secondary border-border font-mono" value={form.password} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} />
                        <Button variant="outline" size="icon" className="shrink-0 border-border" onClick={async () => { const p = await genPass(); setForm(prev => ({ ...prev, password: p })); }}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                        <p>• Pode conter letras, números, traços e underline</p>
                        <p>• Mínimo de 6 caracteres</p>
                      </div>
                    </div>

                    {/* Expiry Date */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Vencimento (Opcional)</Label>
                      <p className="text-xs text-muted-foreground">Deixe em branco para calcular a data com base na duração do plano.</p>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                          type="datetime-local"
                          className="bg-secondary border-border pl-10"
                          value={form.expiry_date}
                          onChange={e => setForm(prev => ({ ...prev, expiry_date: e.target.value }))}
                        />
                      </div>
                    </div>

                    {/* Custom Price */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Valor do Plano</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={`Opcional, usar valor do plano (R$ ${planPrice.toFixed(2)})`}
                        className="bg-secondary border-border"
                        value={form.custom_price}
                        onChange={e => setForm(prev => ({ ...prev, custom_price: e.target.value }))}
                      />
                    </div>

                    {/* Price summary */}
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-primary font-medium">
                      <Info className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                      O cliente pagará <strong>R$ {totalPrice.toFixed(2)}</strong> por {form.max_connections} conexão(ões) — calculado com base nas configurações atuais do plano.
                    </div>

                    {/* Separator */}
                    <div className="border-t border-border" />

                    {/* Personal data section */}
                    <div className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-muted-foreground">
                      <Lock className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                      Apenas você pode visualizar os dados pessoais deste cliente.
                    </div>

                    {/* Name */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Nome</Label>
                      <Input placeholder="Opcional" className="bg-secondary border-border" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">E-mail</Label>
                      <Input type="email" placeholder="Opcional" className="bg-secondary border-border" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} />
                    </div>

                    {/* Telegram */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Telegram</Label>
                      <Input placeholder="Opcional" className="bg-secondary border-border" value={form.telegram} onChange={e => setForm(prev => ({ ...prev, telegram: e.target.value }))} />
                    </div>

                    {/* WhatsApp */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">WhatsApp</Label>
                      <Input placeholder="Opcional" className="bg-secondary border-border" value={form.whatsapp} onChange={e => setForm(prev => ({ ...prev, whatsapp: e.target.value }))} />
                      <p className="text-xs text-muted-foreground">Incluindo o código do país - com ou sem espaço e traços - ex. 55 11 99999 3333</p>
                    </div>

                    {/* Observations */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Observações</Label>
                      <Textarea placeholder="Opcional" className="bg-secondary border-border min-h-[80px]" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} />
                    </div>
                  </>
                );
              })()}
            </div>

            <DialogFooter className="flex-col items-center gap-3 mt-4">
              <div className="flex gap-2 w-full justify-center">
                <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => saveMutation.mutate(form)}
                  disabled={saveMutation.isPending || !form.username || (!editId && !form.password) || !form.server_id || !form.plan_id}
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  💾 Salvar
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={stayOpen} onChange={e => setStayOpen(e.target.checked)} className="rounded border-border" />
                Continue nesta tela após clicar em salvar
              </label>
            </DialogFooter>
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
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Usuário</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Datas</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Situação</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Detalhes</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Servidor</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Criado por</th>
                  <th className="px-5 py-3 text-right text-muted-foreground font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item: any) => {
                  if (item._type === "test") {
                    const testStatus = item.expires_at && new Date(item.expires_at) < new Date() ? "expired" : (item.status === "blocked" ? "blocked" : "active");
                    return (
                      <tr key={`test-${item.id}`} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                        <td className="px-5 py-3">
                          <div>
                            <p className="font-medium text-primary">{item.username}</p>
                            <p className="text-xs text-muted-foreground">Teste · {item.duration_hours}h</p>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div>
                            <p className="text-foreground text-xs">
                              {item.expires_at ? format(new Date(item.expires_at), "dd/MM/yyyy, HH:mm:ss") : "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Criado em {format(new Date(item.created_at), "dd/MM/yyyy, HH:mm:ss")}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-block w-fit px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle[testStatus]}`}>
                              {statusLabel[testStatus] || testStatus}
                            </span>
                            <span className="inline-block w-fit px-2.5 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                              Teste
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-foreground text-xs">
                          Conexões: 1
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{item.servers?.name || "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{getCreatorName(item)}</td>
                        <td className="px-5 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="border-border">
                                Ações
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-card border-border w-52">
                              <DropdownMenuItem onClick={() => setDetailsClient({ ...item, _type: "test" })} className="gap-2">
                                <Eye className="h-4 w-4" /> Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyTestTemplate(item)} className="gap-2">
                                <Copy className="h-4 w-4" /> Copiar Template
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => sendTestWhatsApp(item)} className="gap-2">
                                <MessageCircle className="h-4 w-4" /> WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setConvertDialog(item); setConvertPlanId(""); }} className="gap-2">
                                <ArrowUpCircle className="h-4 w-4" /> Converter em Plano
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleTestStatusMutation.mutate({ id: item.id, status: item.status })} className="gap-2">
                                {item.status === "active" ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                                {item.status === "active" ? "Bloquear" : "Desbloquear"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toast({ title: "Sincronizando...", description: "Sincronização com o servidor em andamento" })} className="gap-2">
                                <Wifi className="h-4 w-4" /> Sincronizar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => deleteTestMutation.mutate(item.id)} className="gap-2 text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4" /> Remover
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  }

                  // Regular client
                  const status = getClientStatus(item);
                  return (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-primary">{item.username}</p>
                          <p className="text-xs text-muted-foreground">{item.email || "—"}</p>
                          {item.plans?.name && <p className="text-xs text-muted-foreground">{item.plans.name}</p>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div>
                          <p className="text-foreground text-xs">
                            {item.expiry_date ? format(new Date(item.expiry_date), "dd/MM/yyyy, HH:mm:ss") : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Criado em {format(new Date(item.created_at), "dd/MM/yyyy, HH:mm:ss")}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-block w-fit px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle[status]}`}>
                            {statusLabel[status] || status}
                          </span>
                          <span className="inline-block w-fit px-2.5 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                            IPTV
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-foreground">
                        <div>
                          {item.plans?.price && <p>Plano: R$ {Number(item.plans.price).toFixed(2)}</p>}
                          <p>Conexões: {item.max_connections}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{item.servers?.name || "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{getCreatorName(item)}</td>
                      <td className="px-5 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="border-border">
                              Ações
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border w-52">
                            <DropdownMenuItem onClick={() => setDetailsClient(item)} className="gap-2">
                              <Eye className="h-4 w-4" /> Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyCredentials(item)} className="gap-2">
                              <Copy className="h-4 w-4" /> Copiar Credenciais
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyTemplate(item)} className="gap-2">
                              <Copy className="h-4 w-4" /> Copiar Template
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => sendWhatsApp(item)} className="gap-2">
                              <MessageCircle className="h-4 w-4" /> WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEdit(item)} className="gap-2">
                              <Pencil className="h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => renewMutation.mutate(item)} className="gap-2">
                              <RefreshCw className="h-4 w-4" /> Renovar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({ id: item.id, status: item.status })} className="gap-2">
                              {item.status === "active" ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                              {item.status === "active" ? "Bloquear" : "Ativar"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast({ title: "Sincronizando...", description: "Sincronização com o servidor em andamento" })} className="gap-2">
                              <Wifi className="h-4 w-4" /> Sincronizar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast({ title: "Playlist", description: `M3U: ${getDnsFromServer(item.servers).dns}/get.php?username=${item.username}&password=${item.password}&type=m3u_plus&output=mpegts` })} className="gap-2">
                              <List className="h-4 w-4" /> Ver Playlist
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast({ title: "Lembrete enviado!", description: "Lembrete de renovação será enviado ao cliente" })} className="gap-2">
                              <Bell className="h-4 w-4" /> Lembrete de Renovação
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(item.id)} className="gap-2 text-destructive focus:text-destructive">
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

        {/* Client/Test Details Dialog */}
        <Dialog open={!!detailsClient} onOpenChange={(v) => { if (!v) setDetailsClient(null); }}>
          <DialogContent className="bg-card border-border sm:max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {detailsClient?._type === "test" ? "Detalhes do Teste" : "Detalhes do Cliente"}
              </DialogTitle>
            </DialogHeader>
            {detailsClient && (
              <div className="space-y-4 flex-1 min-h-0">
                <div className="rounded-lg bg-secondary/50 border border-border p-4 text-xs text-foreground whitespace-pre-wrap break-all leading-relaxed overflow-y-auto max-h-[55vh]">
                  {detailsClient._type === "test" ? getTestRenderedTemplate(detailsClient) : getRenderedTemplate(detailsClient)}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    className="bg-success hover:bg-success/90 text-success-foreground"
                    onClick={() => detailsClient._type === "test" ? sendTestWhatsApp(detailsClient) : sendWhatsApp(detailsClient)}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    className="border-primary text-primary hover:bg-primary/10"
                    onClick={() => detailsClient._type === "test" ? copyTestTemplate(detailsClient) : copyTemplate(detailsClient)}
                  >
                    <Copy className="h-4 w-4 mr-2" /> Copiar
                  </Button>
                </div>
                <DialogFooter className="flex gap-2 sm:justify-center">
                  <Button variant="ghost" onClick={() => setDetailsClient(null)}>Fechar</Button>
                  <Button
                    className="bg-primary text-primary-foreground"
                    onClick={() => {
                      detailsClient._type === "test" ? copyTestTemplate(detailsClient) : copyTemplate(detailsClient);
                      setDetailsClient(null);
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" /> Copiar e Fechar
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Convert Test to Plan Dialog */}
        <Dialog open={!!convertDialog} onOpenChange={(v) => { if (!v) { setConvertDialog(null); setConvertPlanId(""); } }}>
          <DialogContent className="bg-card border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Converter Teste em Plano</DialogTitle>
            </DialogHeader>
            {convertDialog && (
              <div className="space-y-4 mt-2">
                <p className="text-sm text-muted-foreground">
                  Converter <span className="text-foreground font-medium">{convertDialog.username}</span> de teste para cliente com plano ativo.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Selecione o Plano</Label>
                  <Select value={convertPlanId} onValueChange={setConvertPlanId}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Escolha um plano" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — R$ {Number(p.price).toFixed(2)} · {p.duration_days}d
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setConvertDialog(null); setConvertPlanId(""); }}>
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={!convertPlanId || convertTestMutation.isPending}
                    onClick={() => convertTestMutation.mutate({ testLine: convertDialog, planId: convertPlanId })}
                  >
                    {convertTestMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Converter
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function getClientStatus(client: any) {
  if (client.status === "suspended") return "suspended";
  if (client.expiry_date && new Date(client.expiry_date) < new Date()) return "expired";
  return client.status;
}
