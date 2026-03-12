import { Layout } from "@/components/Layout";
import { Plus, Wifi, Clock, DollarSign, MoreVertical, Pencil, Trash2, Loader2, Package } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface PlanForm {
  name: string;
  max_connections: number;
  duration_days: number;
  price: number;
  bouquets: number;
  server_id: string;
}

const emptyForm: PlanForm = {
  name: "", max_connections: 1, duration_days: 30, price: 0, bouquets: 0, server_id: "",
};

export default function Plans() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*, servers(name)").order("created_at", { ascending: false });
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
    mutationFn: async (f: PlanForm) => {
      const payload = {
        name: f.name,
        max_connections: f.max_connections,
        duration_days: f.duration_days,
        price: f.price,
        bouquets: f.bouquets,
        server_id: f.server_id || null,
      };
      if (editId) {
        const { error } = await supabase.from("plans").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("plans").insert({ ...payload, created_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast({ title: editId ? "Plano atualizado!" : "Plano criado!" });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast({ title: "Plano removido!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const openEdit = (plan: any) => {
    setEditId(plan.id);
    setForm({
      name: plan.name,
      max_connections: plan.max_connections,
      duration_days: plan.duration_days,
      price: Number(plan.price),
      bouquets: plan.bouquets,
      server_id: plan.server_id || "",
    });
    setOpen(true);
  };

  const handleChange = (field: keyof PlanForm, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Planos</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie os planos IPTV</p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" /> Novo Plano
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground">{editId ? "Editar Plano" : "Criar Plano"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Nome do plano</Label>
                  <Input placeholder="Ex: Premium" className="bg-secondary border-border" value={form.name} onChange={e => handleChange("name", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Conexões</Label>
                    <Input type="number" min={1} className="bg-secondary border-border" value={form.max_connections} onChange={e => handleChange("max_connections", parseInt(e.target.value) || 1)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Duração (dias)</Label>
                    <Input type="number" min={1} className="bg-secondary border-border" value={form.duration_days} onChange={e => handleChange("duration_days", parseInt(e.target.value) || 1)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Preço (R$)</Label>
                    <Input type="number" step="0.01" min={0} className="bg-secondary border-border" value={form.price} onChange={e => handleChange("price", parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Bouquets</Label>
                    <Input type="number" min={0} className="bg-secondary border-border" value={form.bouquets} onChange={e => handleChange("bouquets", parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Servidor</Label>
                  <Select value={form.server_id} onValueChange={v => handleChange("server_id", v)}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Selecione um servidor" />
                    </SelectTrigger>
                    <SelectContent>
                      {servers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => saveMutation.mutate(form)}
                  disabled={saveMutation.isPending || !form.name}
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editId ? "Salvar Alterações" : "Criar Plano"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : plans.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum plano cadastrado</h3>
            <p className="text-sm text-muted-foreground mt-1">Crie seu primeiro plano para começar a adicionar clientes</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan: any) => (
              <div key={plan.id} className="glass-card p-5 animate-slide-in group hover:glow-primary transition-all">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg text-foreground">{plan.name}</h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem onClick={() => openEdit(plan)} className="gap-2">
                        <Pencil className="h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteMutation.mutate(plan.id)} className="gap-2 text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-3xl font-bold text-gradient mb-4">
                  {Number(plan.price) === 0 ? "Grátis" : `R$ ${Number(plan.price).toFixed(2)}`}
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Wifi className="h-4 w-4 text-primary" /> {plan.max_connections} {plan.max_connections > 1 ? "conexões" : "conexão"}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-primary" /> {plan.duration_days} dias
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4 text-primary" /> {plan.bouquets} bouquets
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
                  {plan.servers?.name || "Sem servidor"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
