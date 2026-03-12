import { Layout } from "@/components/Layout";
import { Plus, Loader2, UserPlus, Pencil, Trash2, DollarSign, Ban, CheckCircle, Search, ChevronDown, ChevronUp, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ResellerForm {
  email: string;
  password: string;
  display_name: string;
  balance: number;
  client_limit: number;
  reseller_role: string;
}

const emptyForm: ResellerForm = {
  email: "", password: "", display_name: "", balance: 0, client_limit: 50, reseller_role: "reseller",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  reseller: "Revenda",
  reseller_master: "Revenda Master",
  reseller_ultra: "Revenda Ultra",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "text-destructive",
  reseller: "text-primary",
  reseller_master: "text-orange-400",
  reseller_ultra: "text-emerald-400",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR") + ", " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Resellers() {
  const [open, setOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditTarget, setCreditTarget] = useState<any>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ResellerForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editCanCreateUltra, setEditCanCreateUltra] = useState(false);
  const [editResellerRole, setEditResellerRole] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 50;
  const { toast } = useToast();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  // Fetch current user's reseller record (for can_create_ultra check)
  const { data: myReseller } = useQuery({
    queryKey: ["my-reseller-record"],
    queryFn: async () => {
      const { data } = await supabase.from("resellers").select("can_create_ultra").eq("user_id", user!.id).single();
      return data;
    },
    enabled: role === "reseller_ultra",
    staleTime: 60000,
  });

  const getAvailableRoles = () => {
    if (role === "admin") return [
      { value: "admin", label: "Administrador" },
      { value: "reseller_ultra", label: "Revendedor Ultra" },
      { value: "reseller_master", label: "Revendedor Master" },
      { value: "reseller", label: "Revendedor" },
    ];
    if (role === "reseller_ultra") {
      const roles = [
        { value: "reseller_master", label: "Revendedor Master" },
        { value: "reseller", label: "Revendedor" },
      ];
      if (myReseller?.can_create_ultra) {
        roles.unshift({ value: "reseller_ultra", label: "Revendedor Ultra" });
      }
      return roles;
    }
    if (role === "reseller_master") return [
      { value: "reseller_master", label: "Revendedor Master" },
      { value: "reseller", label: "Revendedor" },
    ];
    return [];
  };

  // Query resellers
  const { data: resellers = [], isLoading } = useQuery({
    queryKey: ["resellers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resellers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 10000,
  });

  const resellerUserIds = resellers.map((r: any) => r.user_id);

  // Profiles
  const { data: resellerProfiles = {} } = useQuery({
    queryKey: ["reseller-profiles", resellerUserIds.join(",")],
    queryFn: async () => {
      if (resellerUserIds.length === 0) return {};
      const { data } = await supabase.from("profiles").select("user_id, display_name, email").in("user_id", resellerUserIds);
      const map: Record<string, any> = {};
      (data || []).forEach((p: any) => { map[p.user_id] = p; });
      return map;
    },
    enabled: resellerUserIds.length > 0,
    staleTime: 10000,
  });

  // Roles
  const { data: resellerRoles = {} } = useQuery({
    queryKey: ["reseller-roles", resellerUserIds.join(",")],
    queryFn: async () => {
      if (resellerUserIds.length === 0) return {};
      const { data } = await supabase.from("user_roles").select("user_id, role").in("user_id", resellerUserIds);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.user_id] = r.role; });
      return map;
    },
    enabled: resellerUserIds.length > 0,
    staleTime: 10000,
  });

  // Servers (for client stats)
  const { data: servers = [] } = useQuery({
    queryKey: ["servers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("servers").select("id, name");
      return data || [];
    },
    staleTime: 30000,
  });

  // Client stats for expanded row
  const { data: clientStats } = useQuery({
    queryKey: ["reseller-client-stats", expandedRow],
    queryFn: async () => {
      if (!expandedRow) return null;
      const reseller = resellers.find((r: any) => r.id === expandedRow);
      if (!reseller) return null;

      // Get clients created by this reseller
      const { data: ownClients } = await supabase
        .from("clients")
        .select("id, server_id, status, max_connections")
        .eq("created_by", reseller.user_id);

      // Get descendant user IDs for sub-reseller stats
      const { data: descendantIds } = await supabase.rpc("get_descendant_user_ids", { _parent_id: reseller.user_id });

      let subClients: any[] = [];
      if (descendantIds && descendantIds.length > 0) {
        const { data } = await supabase
          .from("clients")
          .select("id, server_id, status, max_connections")
          .in("created_by", descendantIds);
        subClients = data || [];
      }

      // Build per-server stats
      const statsMap: Record<string, { name: string; active: number; subActive: number; connections: number; subConnections: number; tests: number }> = {};
      servers.forEach((s: any) => {
        statsMap[s.id] = { name: s.name, active: 0, subActive: 0, connections: 0, subConnections: 0, tests: 0 };
      });

      (ownClients || []).forEach((c: any) => {
        if (!c.server_id || !statsMap[c.server_id]) return;
        if (c.status === "active") statsMap[c.server_id].active++;
        statsMap[c.server_id].connections += c.max_connections || 0;
      });

      subClients.forEach((c: any) => {
        if (!c.server_id || !statsMap[c.server_id]) return;
        if (c.status === "active") statsMap[c.server_id].subActive++;
        statsMap[c.server_id].subConnections += c.max_connections || 0;
      });

      // Get test lines
      const { data: tests } = await supabase
        .from("test_lines")
        .select("server_id")
        .eq("created_by", reseller.user_id)
        .eq("status", "active");

      (tests || []).forEach((t: any) => {
        if (t.server_id && statsMap[t.server_id]) statsMap[t.server_id].tests++;
      });

      return Object.values(statsMap);
    },
    enabled: !!expandedRow,
    staleTime: 5000,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (f: ResellerForm) => {
      const res = await supabase.functions.invoke("create-reseller", {
        body: { email: f.email, password: f.password, display_name: f.display_name, reseller_role: f.reseller_role, balance: f.balance, client_limit: f.client_limit },
      });
      if (res.error) throw new Error(res.error.message || "Erro ao criar revendedor");
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellers"] });
      queryClient.invalidateQueries({ queryKey: ["reseller-roles"] });
      queryClient.invalidateQueries({ queryKey: ["reseller-profiles"] });
      toast({ title: "Revendedor criado!" });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (payload: { id: string; balance: number; client_limit: number; can_create_ultra?: boolean }) => {
      const updateData: any = { balance: payload.balance, client_limit: payload.client_limit };
      if (payload.can_create_ultra !== undefined) updateData.can_create_ultra = payload.can_create_ultra;
      const { error } = await supabase.from("resellers").update(updateData).eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellers"] });
      toast({ title: "Revendedor atualizado!" });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "active" ? "suspended" : "active";
      const { error } = await supabase.from("resellers").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellers"] });
      toast({ title: "Status atualizado!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const addCreditMutation = useMutation({
    mutationFn: async ({ id, amount, currentBalance }: { id: string; amount: number; currentBalance: number }) => {
      const { error } = await supabase.from("resellers").update({ balance: currentBalance + amount }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellers"] });
      toast({ title: "Créditos adicionados!" });
      setCreditOpen(false);
      setCreditTarget(null);
      setCreditAmount("");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resellers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellers"] });
      toast({ title: "Revendedor removido!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); setEditCanCreateUltra(false); };

  const openEdit = (r: any) => {
    const profile = (resellerProfiles as any)[r.user_id];
    const rRole = (resellerRoles as any)[r.user_id] || "reseller";
    setEditId(r.id);
    setEditResellerRole(rRole);
    setEditCanCreateUltra(!!r.can_create_ultra);
    setForm({
      email: profile?.email || "",
      password: "",
      display_name: profile?.display_name || "",
      balance: Number(r.balance),
      client_limit: r.client_limit,
      reseller_role: rRole,
    });
    setOpen(true);
  };

  const filtered = resellers.filter((r: any) => {
    const profile = (resellerProfiles as any)[r.user_id];
    const name = profile?.display_name || profile?.email || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const getParentName = (r: any) => {
    if (!r.created_by) return "—";
    const parentReseller = resellers.find((pr: any) => pr.user_id === r.created_by);
    if (!parentReseller) return "—";
    const parentProfile = (resellerProfiles as any)[parentReseller.user_id];
    return parentProfile?.display_name || parentProfile?.email || "—";
  };

  const canManageCredits = role === "admin" || role === "reseller_master" || role === "reseller_ultra";
  const creditProfile = creditTarget ? (resellerProfiles as any)[creditTarget.user_id] : null;

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Revendedores</h1>
          <Button onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" /> Novo Revendedor
          </Button>
        </div>

        {/* Search + Pagination Info */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar revendedores..." className="pl-10 bg-card border-border h-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center gap-3">
              {/* Pagination */}
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30">‹</button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 text-xs rounded ${p === page ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{p}</button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30">›</button>
              </div>
              <span className="text-xs text-muted-foreground">{(page - 1) * perPage + 1} até {Math.min(page * perPage, filtered.length)} de {filtered.length}</span>
            </div>
          )}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
          <DialogContent className="bg-card border-border sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">{editId ? "Editar Revendedor" : "Novo Revendedor"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {!editId && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Nome</Label>
                    <Input placeholder="Nome do revendedor" className="bg-secondary border-border" value={form.display_name} onChange={e => setForm(prev => ({ ...prev, display_name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Email</Label>
                    <Input type="email" placeholder="revenda@email.com" className="bg-secondary border-border" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Senha</Label>
                    <Input type="password" placeholder="Mínimo 6 caracteres" className="bg-secondary border-border" value={form.password} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Cargo</Label>
                    <Select value={form.reseller_role} onValueChange={v => setForm(prev => ({ ...prev, reseller_role: v }))}>
                      <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {getAvailableRoles().map(r => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Créditos</Label>
                <Input type="number" step="1" min={0} className="bg-secondary border-border" value={form.balance} onChange={e => setForm(prev => ({ ...prev, balance: parseInt(e.target.value) || 0 }))} />
              </div>

              {/* Toggle can_create_ultra */}
              {role === "admin" && (form.reseller_role === "reseller_ultra" || (editId && editResellerRole === "reseller_ultra")) && (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Pode criar Revendedor Ultra</p>
                    <p className="text-xs text-muted-foreground">Permite que este Ultra crie outros Ultras</p>
                  </div>
                  <Switch checked={editCanCreateUltra} onCheckedChange={setEditCanCreateUltra} />
                </div>
              )}

              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  if (editId) {
                    editMutation.mutate({
                      id: editId,
                      balance: form.balance,
                      client_limit: form.client_limit,
                      ...(role === "admin" && editResellerRole === "reseller_ultra" ? { can_create_ultra: editCanCreateUltra } : {}),
                    });
                  } else {
                    createMutation.mutate(form);
                  }
                }}
                disabled={createMutation.isPending || editMutation.isPending || (!editId && (!form.email || !form.password))}
              >
                {(createMutation.isPending || editMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editId ? "Salvar" : "Criar Revendedor"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Credits Dialog */}
        <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
          <DialogContent className="bg-card border-border sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-foreground">Adicionar Créditos</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Revendedor: <span className="text-foreground font-medium">{creditProfile?.display_name || creditProfile?.email || "—"}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Créditos atuais: <span className="text-foreground font-medium">{Number(creditTarget?.balance || 0)}</span>
              </p>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Valor</Label>
                <Input type="number" step="1" placeholder="100" className="bg-secondary border-border" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} />
              </div>
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => addCreditMutation.mutate({
                  id: creditTarget.id,
                  amount: parseInt(creditAmount) || 0,
                  currentBalance: Number(creditTarget.balance),
                })}
                disabled={addCreditMutation.isPending || !creditAmount || parseInt(creditAmount) === 0}
              >
                {addCreditMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Adicionar Créditos
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum revendedor</h3>
            <p className="text-sm text-muted-foreground mt-1">Crie seu primeiro revendedor para começar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usuário</th>
                  <th className="pb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Créditos</th>
                  <th className="pb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Datas</th>
                  <th className="pb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Situação</th>
                  <th className="pb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Revenda</th>
                  <th className="pb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((r: any) => {
                  const rRole = (resellerRoles as any)[r.user_id] || "reseller";
                  const rProfile = (resellerProfiles as any)[r.user_id];
                  const isExpanded = expandedRow === r.id;

                  return (
                    <ResellerRow
                      key={r.id}
                      r={r}
                      rRole={rRole}
                      rProfile={rProfile}
                      parentName={getParentName(r)}
                      isExpanded={isExpanded}
                      clientStats={isExpanded ? clientStats : null}
                      onToggleExpand={() => setExpandedRow(isExpanded ? null : r.id)}
                      onEdit={() => openEdit(r)}
                      onToggleStatus={() => toggleStatusMutation.mutate({ id: r.id, status: r.status })}
                      onDelete={role === "admin" ? () => deleteMutation.mutate(r.id) : undefined}
                      onAddCredits={canManageCredits ? () => { setCreditTarget(r); setCreditOpen(true); } : undefined}
                    />
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

// --- Row Component ---
function ResellerRow({
  r, rRole, rProfile, parentName, isExpanded, clientStats,
  onToggleExpand, onEdit, onToggleStatus, onDelete, onAddCredits,
}: {
  r: any; rRole: string; rProfile: any; parentName: string;
  isExpanded: boolean; clientStats: any;
  onToggleExpand: () => void; onEdit: () => void;
  onToggleStatus: () => void; onDelete?: () => void; onAddCredits?: () => void;
}) {
  return (
    <>
      <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
        {/* Usuário */}
        <td className="py-4 pr-4">
          <div>
            <span className="font-semibold text-primary cursor-pointer hover:underline">{rProfile?.display_name || rProfile?.email || "Sem nome"}</span>
            <div className="flex flex-col gap-0.5 mt-1">
              <span className={`text-xs font-medium ${ROLE_COLORS[rRole] || "text-muted-foreground"}`}>
                {ROLE_LABELS[rRole] || rRole}
              </span>
            </div>
          </div>
        </td>

        {/* Créditos */}
        <td className="py-4 pr-4">
          <span className="font-semibold text-foreground">{Number(r.balance).toLocaleString("pt-BR")}</span>
        </td>

        {/* Datas */}
        <td className="py-4 pr-4">
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>Criado em<br /><span className="text-foreground/80">{formatDate(r.created_at)}</span></p>
          </div>
        </td>

        {/* Situação */}
        <td className="py-4 pr-4">
          {r.status === "active" ? (
            <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded border border-primary/50 text-primary bg-primary/10">Ativo</span>
          ) : (
            <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded border border-destructive/50 text-destructive bg-destructive/10">Inativo</span>
          )}
          {r.status !== "active" && (
            <p className="text-[10px] text-muted-foreground mt-1">Suspenso em {formatDate(r.updated_at)}</p>
          )}
        </td>

        {/* Revenda (pai) */}
        <td className="py-4 pr-4">
          <span className="text-foreground/80">{parentName}</span>
        </td>

        {/* Ações */}
        <td className="py-4 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <button onClick={onEdit} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Editar">
              <Pencil className="h-4 w-4" />
            </button>
            {onAddCredits && (
              <button onClick={onAddCredits} className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Adicionar Créditos">
                <DollarSign className="h-4 w-4" />
              </button>
            )}
            <button onClick={onToggleStatus} className={`p-1.5 rounded transition-colors ${r.status === "active" ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"}`} title={r.status === "active" ? "Suspender" : "Ativar"}>
              {r.status === "active" ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            </button>
            {onDelete && (
              <button onClick={onDelete} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Remover">
                <Trash2 className="h-4 w-4" />
              </button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs border-border">
                  Ações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border-border">
                {onAddCredits && (
                  <DropdownMenuItem onClick={onAddCredits} className="gap-2 text-xs">
                    <DollarSign className="h-3.5 w-3.5" /> Adicionar Créditos
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onEdit} className="gap-2 text-xs">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onToggleStatus} className="gap-2 text-xs">
                  {r.status === "active" ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  {r.status === "active" ? "Suspender" : "Ativar"}
                </DropdownMenuItem>
                {onDelete && (
                  <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Ver número de clientes */}
          <button
            onClick={onToggleExpand}
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary border border-primary/30 rounded px-2.5 py-1 hover:bg-primary/10 transition-colors"
          >
            <Users className="h-3 w-3" />
            Ver número de clientes
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </td>
      </tr>

      {/* Expanded client stats */}
      {isExpanded && (
        <tr>
          <td colSpan={6} className="py-3 px-4 bg-card border-b border-border">
            {!clientStats ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
              </div>
            ) : clientStats.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum servidor encontrado.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {clientStats.map((s: any, i: number) => (
                  <div key={i} className="rounded-lg border border-border p-3 bg-secondary">
                    <p className="text-xs font-bold text-foreground uppercase mb-2">{s.name}</p>
                    <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                      <span className="text-muted-foreground">Ativo: <span className="text-primary font-semibold">{s.active}</span></span>
                      <span className="text-muted-foreground">Ativos Subrevendas: <span className="text-primary font-semibold">{s.subActive}</span></span>
                      <span className="text-muted-foreground">Total Ativo: <span className="text-primary font-semibold">{s.active + s.subActive}</span></span>
                      <span></span>
                      <span className="text-muted-foreground">Conexões: <span className="text-primary font-semibold">{s.connections}</span></span>
                      <span className="text-muted-foreground">Conexões Subrevendas: <span className="text-primary font-semibold">{s.subConnections}</span></span>
                      <span className="text-muted-foreground">Total de Conexões: <span className="text-primary font-semibold">{s.connections + s.subConnections}</span></span>
                      <span></span>
                      <span className="text-muted-foreground">Teste: <span className="text-primary font-semibold">{s.tests}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
