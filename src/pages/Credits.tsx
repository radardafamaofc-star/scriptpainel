import { Layout } from "@/components/Layout";
import { DollarSign, Loader2, ArrowUpRight, ArrowDownRight, Plus } from "lucide-react";
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

export default function Credits() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("purchase");
  const [desc, setDesc] = useState("");
  const { toast } = useToast();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  // Can manage credits (add/edit transactions)
  const canManage = role === "admin" || role === "reseller_master" || role === "reseller_ultra";

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["credit-transactions"],
    queryFn: async () => {
      const query = supabase.from("credit_transactions").select("*").order("created_at", { ascending: false }).limit(100);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const balance = transactions.reduce((acc: number, t: any) => {
    if (t.type === "purchase" || t.type === "refund") return acc + Number(t.amount);
    if (t.type === "usage" || t.type === "transfer") return acc - Math.abs(Number(t.amount));
    return acc;
  }, 0);

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("credit_transactions").insert({
        user_id: user!.id,
        amount: parseFloat(amount),
        type,
        description: desc || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-transactions"] });
      toast({ title: "Transação registrada!" });
      setOpen(false);
      setAmount("");
      setDesc("");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const typeLabels: Record<string, string> = {
    purchase: "Compra",
    usage: "Uso",
    transfer: "Transferência",
    refund: "Reembolso",
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Créditos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {canManage ? "Gerencie créditos" : "Acompanhe seus créditos"}
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" /> Registrar Transação
            </Button>
          )}
        </div>

        {/* Balance card */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-4">
            <div className="p-4 rounded-xl bg-primary/10">
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo Atual</p>
              <p className="text-3xl font-bold text-foreground">{balance.toFixed(2)} <span className="text-sm text-muted-foreground font-normal">créditos</span></p>
            </div>
          </div>
        </div>

        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="bg-card border-border sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-foreground">Nova Transação</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Tipo</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase">Compra</SelectItem>
                      <SelectItem value="usage">Uso</SelectItem>
                      <SelectItem value="transfer">Transferência</SelectItem>
                      <SelectItem value="refund">Reembolso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Quantidade</Label>
                  <Input type="number" step="0.01" placeholder="10" className="bg-secondary border-border" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Descrição (opcional)</Label>
                  <Input placeholder="Compra de créditos" className="bg-secondary border-border" value={desc} onChange={e => setDesc(e.target.value)} />
                </div>
                <Button className="w-full bg-primary text-primary-foreground" onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !amount}>
                  {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Registrar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Transactions list */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Histórico de Transações</h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-muted-foreground">Nenhuma transação registrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((t: any) => {
                const isPositive = t.type === "purchase" || t.type === "refund";
                return (
                  <div key={t.id} className="glass-card px-5 py-3 flex items-center justify-between animate-slide-in">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isPositive ? "bg-success/10" : "bg-destructive/10"}`}>
                        {isPositive ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownRight className="h-4 w-4 text-destructive" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{typeLabels[t.type] || t.type}</p>
                        <p className="text-xs text-muted-foreground">{t.description || "—"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${isPositive ? "text-success" : "text-destructive"}`}>
                        {isPositive ? "+" : "-"}{Math.abs(Number(t.amount)).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">{format(new Date(t.created_at), "dd/MM/yyyy HH:mm")}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
