import { Layout } from "@/components/Layout";
import { Plus, Loader2, Package, Copy, Search, FileText } from "lucide-react";
import { DEFAULT_TEMPLATE } from "@/lib/template";
import { Textarea } from "@/components/ui/textarea";
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

type DurationUnit = "hours" | "days" | "months" | "years";

interface PlanForm {
  name: string;
  server_id: string;
  order: number;
  status: "active" | "inactive";
  is_test: boolean;
  price: number;
  credits: number;
  package_id: string;
  duration_value: number;
  duration_unit: DurationUnit;
  max_connections: number;
  bouquets: number;
  template: string;
}

const emptyForm: PlanForm = {
  name: "", server_id: "", order: 0, status: "active", is_test: false,
  price: 0, credits: 1, package_id: "", duration_value: 1, duration_unit: "months",
  max_connections: 2, bouquets: 0, template: "",
};

function durationToHours(value: number, unit: DurationUnit): number {
  switch (unit) {
    case "hours": return value;
    case "days": return value * 24;
    case "months": return value * 30 * 24;
    case "years": return value * 365 * 24;
  }
}

function durationToDays(value: number, unit: DurationUnit): number {
  return Math.floor(durationToHours(value, unit) / 24);
}

function durationLabel(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "1 Dia";
  if (days < 30) return `${days} Dias`;
  if (days < 60) return "1 Mês";
  if (days < 365) return `${Math.round(days / 30)} Meses`;
  if (days === 365) return "1 Ano";
  return `${Math.round(days / 365)} Anos`;
}

export default function Plans() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*, servers(name)").order("created_at", { ascending: true });
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

  // Fetch XUI packages when a server is selected
  const { data: xuiPackages = [], isLoading: packagesLoading } = useQuery({
    queryKey: ["xui-packages", form.server_id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const res = await supabase.functions.invoke("xui-proxy", {
        body: {
          action: "xui_command",
          server_id: form.server_id,
          xui_action: "get_packages",
        },
      });
      if (res.error) throw res.error;
      const result = res.data;
      if (!result?.success || !result?.data) return [];
      // XUI returns packages in various formats
      const pkgs = result.data;
      console.log("[XUI Packages raw]", JSON.stringify(pkgs).substring(0, 1000));
      
      const extractName = (p: any): string => {
        if (!p || typeof p !== "object") return `Package`;
        // Try all known XUI field names for package name
        return p.package_name || p.name || p.output_name || p.title || p.packageName || `Package ${p.id || "?"}`;
      };

      if (Array.isArray(pkgs)) {
        return pkgs.map((p: any) => ({
          id: String(p.id),
          name: extractName(p),
        }));
      }
      return Object.entries(pkgs).map(([key, p]: [string, any]) => {
        // Some XUI versions return { "1": { id: 1, package_name: "X" } }
        // Others return { "1": "PackageName" }
        if (typeof p === "string") return { id: key, name: p };
        return {
          id: String(p?.id ?? key),
          name: extractName(p),
        };
      });
    },
    enabled: !!form.server_id && open,
    staleTime: 30000,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: async (f: PlanForm) => {
      const payload = {
        name: f.name,
        max_connections: f.max_connections,
        duration_days: durationToDays(f.duration_value, f.duration_unit),
        duration_hours: durationToHours(f.duration_value, f.duration_unit),
        is_test: f.is_test,
        price: f.price,
        bouquets: f.credits,
        package_id: f.package_id || null,
        server_id: f.server_id || null,
        template: f.template || null,
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

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); setSelectedPackageId(""); };

  const openEdit = (plan: any) => {
    const hours = plan.duration_hours || (plan.duration_days * 24);
    let unit: DurationUnit = "hours";
    let value = hours;
    if (hours >= 365 * 24 && hours % (365 * 24) === 0) { unit = "years"; value = hours / (365 * 24); }
    else if (hours >= 30 * 24 && hours % (30 * 24) === 0) { unit = "months"; value = hours / (30 * 24); }
    else if (hours >= 24 && hours % 24 === 0) { unit = "days"; value = hours / 24; }

    setEditId(plan.id);
    setForm({
      name: plan.name,
      server_id: plan.server_id || "",
      order: 0,
      status: "active",
      is_test: Boolean(plan.is_test),
      price: Number(plan.price),
      credits: plan.bouquets || 0,
      package_id: String((plan as any).package_id || ""),
      duration_value: value,
      duration_unit: unit,
      max_connections: plan.max_connections,
      bouquets: plan.bouquets,
      template: (plan as any).template || "",
    });
    setSelectedPackageId(String((plan as any).package_id || ""));
    setOpen(true);
  };

  const handleChange = (field: keyof PlanForm, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const filtered = plans.filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">Planos</h1>
          <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" /> Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-foreground">{editId ? "Editar Plano" : "Adicionar Plano"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {/* Nome */}
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">Nome *</Label>
                  <Input placeholder="Obrigatório" className="bg-secondary border-border" value={form.name} onChange={e => handleChange("name", e.target.value)} />
                  <p className="text-[10px] text-primary">O nome do plano ficará visível para clientes e revendas.</p>
                </div>

                {/* Servidor */}
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">Servidor *</Label>
                  <div className="space-y-1.5">
                    {servers.map(s => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="server" className="accent-primary" checked={form.server_id === s.id}
                          onChange={() => {
                            handleChange("server_id", s.id);
                            handleChange("package_id", "");
                            setSelectedPackageId("");
                          }} />
                        <span className="text-sm text-foreground">{s.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-warning">O servidor não pode ser alterado depois de salvo.</p>
                </div>

                {/* ID do Plano no Servidor (XUI Packages) */}
                {form.server_id && (
                  <div className="space-y-1.5">
                    <Label className="text-foreground text-xs">ID do Plano no Servidor *</Label>
                    {packagesLoading ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Carregando pacotes do servidor...</span>
                      </div>
                    ) : xuiPackages.length === 0 ? (
                      <div className="p-2 rounded bg-warning/10 border border-warning/30">
                        <p className="text-xs text-warning">Nenhum pacote encontrado neste servidor. Verifique a configuração da API.</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {xuiPackages.map((pkg: any) => (
                          <label key={pkg.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="xui_package"
                              className="accent-primary"
                              checked={selectedPackageId === pkg.id}
                              onChange={() => {
                                setSelectedPackageId(pkg.id);
                                handleChange("package_id", pkg.id);
                              }}
                            />
                            <span className="text-sm text-foreground">{pkg.name}</span>
                            <span className="text-xs text-muted-foreground">(ID {pkg.id})</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-primary">Selecione o pacote (package) configurado no XUI One para este plano.</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">Ordem</Label>
                  <Input type="number" className="bg-secondary border-border" value={form.order} onChange={e => handleChange("order", parseInt(e.target.value) || 0)} />
                  <p className="text-[10px] text-primary">A ordem é por número, um número maior irá fazer com que seja mostrado no topo.</p>
                </div>

                {/* Situação */}
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">Situação *</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="status" className="accent-primary" checked={form.status === "active"} onChange={() => handleChange("status", "active")} />
                      <span className="text-sm text-foreground">Ativo</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="status" className="accent-primary" checked={form.status === "inactive"} onChange={() => handleChange("status", "inactive")} />
                      <span className="text-sm text-foreground">Inativo</span>
                    </label>
                  </div>
                </div>

                {/* Teste */}
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">Teste *</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="is_test" className="accent-primary" checked={!form.is_test} onChange={() => handleChange("is_test", false)} />
                      <span className="text-sm text-foreground">Não</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="is_test" className="accent-primary" checked={form.is_test} onChange={() => handleChange("is_test", true)} />
                      <span className="text-sm text-foreground">Sim</span>
                    </label>
                  </div>
                </div>

                {/* Valor do Plano */}
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">Valor do Plano *</Label>
                  <Input type="number" step="0.01" min={0} placeholder="Obrigatório, 0 é permitido" className="bg-secondary border-border"
                    value={form.price} onChange={e => handleChange("price", parseFloat(e.target.value) || 0)} />
                </div>

                {/* Créditos */}
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">Créditos *</Label>
                  <Input type="number" min={0} className="bg-secondary border-border"
                    value={form.credits} onChange={e => handleChange("credits", parseInt(e.target.value) || 0)} />
                </div>

                {/* Conexões */}
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">Conexões</Label>
                  <Input type="number" min={1} className="bg-secondary border-border"
                    value={form.max_connections} onChange={e => handleChange("max_connections", parseInt(e.target.value) || 1)} />
                </div>

                {/* Duração */}
                <div className="space-y-2 border border-dashed border-border rounded-lg p-3">
                  <Label className="text-foreground text-xs">Duração *</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => handleChange("duration_value", Math.max(1, form.duration_value - 1))}>−</Button>
                    <Input type="number" min={1} className="bg-secondary border-border w-20 text-center"
                      value={form.duration_value} onChange={e => handleChange("duration_value", parseInt(e.target.value) || 1)} />
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => handleChange("duration_value", form.duration_value + 1)}>+</Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-foreground text-xs">Duração Em *</Label>
                    {(["hours", "days", "months", "years"] as DurationUnit[]).map(u => (
                      <label key={u} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="duration_unit" className="accent-primary"
                          checked={form.duration_unit === u} onChange={() => handleChange("duration_unit", u)} />
                        <span className="text-sm text-foreground">
                          {u === "hours" ? "Horas" : u === "days" ? "Dias" : u === "months" ? "Meses" : "Anos"}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-primary mt-1">
                    Esse plano será renovado por {form.duration_value} {form.duration_unit === "hours" ? "Hora(s)" : form.duration_unit === "days" ? "Dia(s)" : form.duration_unit === "months" ? "Mês(es)" : "Ano(s)"}
                  </p>
                </div>

                {/* Template (Opcional) */}
                <div className="space-y-1.5 border border-dashed border-border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-foreground text-xs">Template (Opcional)</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] border-primary text-primary hover:bg-primary/10"
                      onClick={() => handleChange("template", DEFAULT_TEMPLATE)}
                    >
                      <FileText className="h-3 w-3 mr-1" /> Aplicar Modelo
                    </Button>
                  </div>
                  <p className="text-[10px] text-warning">Deixe em branco para usar o padrão no cadastro do servidor</p>
                  <textarea
                    className="w-full min-h-[120px] rounded-lg bg-secondary border border-border p-3 text-xs text-foreground font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.template}
                    onChange={e => handleChange("template", e.target.value)}
                    placeholder="Deixe em branco para usar o padrão no cadastro do servidor"
                  />
                  {!form.is_test && form.price > 0 && form.credits === 0 && (
                    <div className="p-2 rounded bg-warning/10 border border-warning/30 text-xs text-warning">
                      Você definiu este plano como um plano pago, mas não está cobrando nenhum crédito por este plano. Tem certeza de que deseja fazer isso?
                    </div>
                  )}
                </div>

                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => saveMutation.mutate(form)}
                  disabled={saveMutation.isPending || !form.name || !form.server_id || !form.package_id}
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editId ? "Salvar Alterações" : "Adicionar Plano"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar" className="pl-9 bg-secondary border-border"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Plans table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum plano encontrado</h3>
          </div>
        ) : (
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-medium">Servidor</th>
                  <th className="px-4 py-3 font-medium">Plano</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                  <th className="px-4 py-3 font-medium">Teste</th>
                  <th className="px-4 py-3 font-medium">Valor do Plano</th>
                  <th className="px-4 py-3 font-medium">Créditos</th>
                  <th className="px-4 py-3 font-medium">Conexões</th>
                  <th className="px-4 py-3 font-medium">Duração</th>
                  <th className="px-4 py-3 font-medium">Ordem</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((plan: any) => (
                  <tr key={plan.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground">{plan.servers?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-primary font-medium">{plan.servers?.name || ""} • {plan.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-success/15 text-success border border-success/30">
                        Ativo
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                        plan.is_test
                          ? "bg-warning/15 text-warning border border-warning/30"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}>
                        {plan.is_test ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {Number(plan.price) === 0 ? "-" : `R$ ${Number(plan.price).toFixed(2)}`}
                    </td>
                    <td className="px-4 py-3 text-foreground">{plan.bouquets || 0}</td>
                    <td className="px-4 py-3 text-foreground">{plan.max_connections}</td>
                    <td className="px-4 py-3 text-foreground">{durationLabel(plan.duration_hours || plan.duration_days * 24)}</td>
                    <td className="px-4 py-3 text-foreground">0</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-xs bg-warning/15 text-warning border-warning/30 hover:bg-warning/25"
                          onClick={() => {
                            navigator.clipboard.writeText(plan.name);
                            toast({ title: "Copiado!" });
                          }}>
                          <Copy className="h-3 w-3 mr-1" /> Copiar
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
                              Ações
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border">
                            <DropdownMenuItem onClick={() => openEdit(plan)}>Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(plan.id)} className="text-destructive focus:text-destructive">
                              Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-muted-foreground text-right">
              1 até {filtered.length} de {filtered.length}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
