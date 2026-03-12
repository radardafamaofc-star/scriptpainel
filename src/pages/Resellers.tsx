import { Layout } from "@/components/Layout";
import { Plus, MoreVertical, Wallet, Loader2, UserPlus, Pencil, Trash2, DollarSign, Ban, CheckCircle, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
}

const emptyForm: ResellerForm = {
  email: "", password: "", display_name: "", balance: 0, client_limit: 50,
};

export default function Resellers() {
  const [open, setOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditTarget, setCreditTarget] = useState<any>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ResellerForm>(emptyForm);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: resellers = [], isLoading } = useQuery({
    queryKey: ["resellers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("resellers").select("*, profiles(display_name, email)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Count clients per reseller
  const { data: clientCounts = {} } = useQuery({
    queryKey: ["reseller-client-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("reseller_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((c: any) => { if (c.reseller_id) counts[c.reseller_id] = (counts[c.reseller_id] || 0) + 1; });
      return counts;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (f: ResellerForm) => {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: f.email,
        password: f.password,
        options: { data: { display_name: f.display_name } },
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error("Falha ao criar usuário");

      // 2. Update role to reseller
      const { error: roleError } = await supabase.from("user_roles").update({ role: "reseller" as any }).eq("user_id", authData.user.id);
      if (roleError) throw roleError;

      // 3. Create reseller record
      const { error: resellerError } = await supabase.from("resellers").insert({
        user_id: authData.user.id,
        balance: f.balance,
        client_limit: f.client_limit,
      });
      if (resellerError) throw resellerError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellers"] });
      toast({ title: "Revendedor criado!" });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, balance, client_limit }: { id: string; balance: number; client_limit: number }) => {
      const { error } = await supabase.from("resellers").update({ balance, client_limit }).eq("id", id);
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

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const openEdit = (r: any) => {
    setEditId(r.id);
    setForm({
      email: r.profiles?.email || "",
      password: "",
      display_name: r.profiles?.display_name || "",
      balance: Number(r.balance),
      client_limit: r.client_limit,
    });
    setOpen(true);
  };

  const filtered = resellers.filter((r: any) => {
    const name = r.profiles?.display_name || r.profiles?.email || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Revendedores</h1>
            <p className="text-sm text-muted-foreground mt-1">{resellers.length} revendedores</p>
          </div>
          <Button onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" /> Novo Revendedor
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar revendedores..." className="pl-10 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
          <DialogContent className="bg-card border-border sm:max-w-md">
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
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Saldo Inicial (R$)</Label>
                  <Input type="number" step="0.01" min={0} className="bg-secondary border-border" value={form.balance} onChange={e => setForm(prev => ({ ...prev, balance: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Limite de Clientes</Label>
                  <Input type="number" min={1} className="bg-secondary border-border" value={form.client_limit} onChange={e => setForm(prev => ({ ...prev, client_limit: parseInt(e.target.value) || 1 }))} />
                </div>
              </div>
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  if (editId) {
                    editMutation.mutate({ id: editId, balance: form.balance, client_limit: form.client_limit });
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
                Revendedor: <span className="text-foreground font-medium">{creditTarget?.profiles?.display_name || creditTarget?.profiles?.email}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Saldo atual: <span className="text-foreground font-medium">R$ {Number(creditTarget?.balance || 0).toFixed(2)}</span>
              </p>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Valor (R$)</Label>
                <Input type="number" step="0.01" placeholder="100.00" className="bg-secondary border-border" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} />
              </div>
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => addCreditMutation.mutate({
                  id: creditTarget.id,
                  amount: parseFloat(creditAmount) || 0,
                  currentBalance: Number(creditTarget.balance),
                })}
                disabled={addCreditMutation.isPending || !creditAmount || parseFloat(creditAmount) === 0}
              >
                {addCreditMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Adicionar Créditos
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
            <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum revendedor</h3>
            <p className="text-sm text-muted-foreground mt-1">Crie seu primeiro revendedor para começar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((r: any) => (
              <div key={r.id} className="glass-card p-5 animate-slide-in">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {(r.profiles?.display_name || r.profiles?.email || "R").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{r.profiles?.display_name || r.profiles?.email}</h3>
                      <span className={`text-xs font-medium ${r.status === "active" ? "text-success" : "text-destructive"}`}>
                        {r.status === "active" ? "Ativo" : "Suspenso"}
                      </span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem onClick={() => { setCreditTarget(r); setCreditOpen(true); }} className="gap-2">
                        <DollarSign className="h-4 w-4" /> Adicionar Créditos
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(r)} className="gap-2">
                        <Pencil className="h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({ id: r.id, status: r.status })} className="gap-2">
                        {r.status === "active" ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        {r.status === "active" ? "Suspender" : "Ativar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteMutation.mutate(r.id)} className="gap-2 text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Saldo</p>
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                      <Wallet className="h-3 w-3 text-primary" /> R$ {Number(r.balance).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Clientes</p>
                    <p className="text-sm font-semibold text-foreground">{(clientCounts as any)[r.user_id] || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Limite</p>
                    <p className="text-sm font-semibold text-foreground">{r.client_limit}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
