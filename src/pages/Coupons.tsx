import { Layout } from "@/components/Layout";
import { Tag, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

interface CouponForm {
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses: number;
  valid_until: string;
}

const emptyForm: CouponForm = {
  code: "", discount_type: "percentage", discount_value: 10, max_uses: 50, valid_until: "",
};

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function Coupons() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const { toast } = useToast();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  // Only admin and reseller_ultra can create/edit/delete coupons
  const canManage = role === "admin" || role === "reseller_ultra";

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ["coupons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (f: CouponForm) => {
      const payload = {
        code: f.code,
        discount_type: f.discount_type,
        discount_value: f.discount_value,
        max_uses: f.max_uses,
        valid_until: f.valid_until || null,
      };
      if (editId) {
        const { error } = await supabase.from("coupons").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coupons").insert({ ...payload, created_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      toast({ title: editId ? "Cupom atualizado!" : "Cupom criado!" });
      closeDialog();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      toast({ title: "Cupom removido!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const closeDialog = () => { setOpen(false); setEditId(null); setForm(emptyForm); };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      code: c.code,
      discount_type: c.discount_type,
      discount_value: Number(c.discount_value),
      max_uses: c.max_uses,
      valid_until: c.valid_until ? format(new Date(c.valid_until), "yyyy-MM-dd") : "",
    });
    setOpen(true);
  };

  // Filter active/valid coupons for view-only roles
  const displayCoupons = canManage
    ? coupons
    : coupons.filter((c: any) => {
        if (c.used_count >= c.max_uses) return false;
        if (c.valid_until && new Date(c.valid_until) < new Date()) return false;
        return true;
      });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Cupons</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {canManage ? "Gerencie cupons de desconto" : "Cupons disponíveis"}
            </p>
          </div>
          {canManage && (
            <Button onClick={() => { setEditId(null); setForm({ ...emptyForm, code: generateCode() }); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" /> Novo Cupom
            </Button>
          )}
        </div>

        {canManage && (
          <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
            <DialogContent className="bg-card border-border sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground">{editId ? "Editar Cupom" : "Novo Cupom"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Código</Label>
                  <div className="flex gap-2">
                    <Input className="bg-secondary border-border font-mono uppercase" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
                    <Button variant="outline" size="sm" className="border-border" onClick={() => setForm(p => ({ ...p, code: generateCode() }))}>Gerar</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Tipo de Desconto</Label>
                    <Select value={form.discount_type} onValueChange={v => setForm(p => ({ ...p, discount_type: v }))}>
                      <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentual (%)</SelectItem>
                        <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Valor</Label>
                    <Input type="number" step="0.01" className="bg-secondary border-border" value={form.discount_value} onChange={e => setForm(p => ({ ...p, discount_value: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Uso Máximo</Label>
                    <Input type="number" min={1} className="bg-secondary border-border" value={form.max_uses} onChange={e => setForm(p => ({ ...p, max_uses: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Válido até</Label>
                    <Input type="date" className="bg-secondary border-border" value={form.valid_until} onChange={e => setForm(p => ({ ...p, valid_until: e.target.value }))} />
                  </div>
                </div>
                <Button className="w-full bg-primary text-primary-foreground" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.code}>
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editId ? "Salvar" : "Criar Cupom"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : displayCoupons.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">
              {canManage ? "Nenhum cupom" : "Nenhum cupom disponível"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {canManage ? "Crie cupons de desconto para seus clientes" : "Não há cupons ativos no momento"}
            </p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Código</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Desconto</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Usos</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Validade</th>
                  {canManage && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody>
                {displayCoupons.map((c: any) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                    <td className="px-5 py-3 text-foreground font-mono font-semibold">{c.code}</td>
                    <td className="px-5 py-3 text-foreground">
                      {c.discount_type === "percentage" ? `${Number(c.discount_value)}%` : `R$ ${Number(c.discount_value).toFixed(2)}`}
                    </td>
                    <td className="px-5 py-3 text-foreground">{c.used_count}/{c.max_uses}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">
                      {c.valid_until ? format(new Date(c.valid_until), "dd/MM/yyyy") : "Sem limite"}
                    </td>
                    {canManage && (
                      <td className="px-5 py-3 flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(c)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
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
