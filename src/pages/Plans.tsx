import { Layout } from "@/components/Layout";
import { Plus, Wifi, Clock, DollarSign, MoreVertical } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const mockPlans = [
  { id: 1, name: "Básico", connections: 1, duration: 30, price: 25.00, server: "Servidor Principal", bouquets: 5 },
  { id: 2, name: "Premium", connections: 3, duration: 30, price: 45.00, server: "Servidor Principal", bouquets: 12 },
  { id: 3, name: "Ultra", connections: 5, duration: 30, price: 69.90, server: "Servidor US-East", bouquets: 20 },
  { id: 4, name: "Teste", connections: 1, duration: 1, price: 0, server: "Servidor Backup", bouquets: 3 },
];

export default function Plans() {
  const [open, setOpen] = useState(false);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Planos</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie os planos IPTV</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4 mr-2" /> Novo Plano</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="text-foreground">Criar Plano</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <Input placeholder="Nome do plano" className="bg-secondary border-border" />
                <Input placeholder="Nº de conexões" type="number" className="bg-secondary border-border" />
                <Input placeholder="Duração (dias)" type="number" className="bg-secondary border-border" />
                <Input placeholder="Preço (R$)" type="number" step="0.01" className="bg-secondary border-border" />
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Criar Plano</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {mockPlans.map(plan => (
            <div key={plan.id} className="glass-card p-5 animate-slide-in group hover:glow-primary transition-all">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-foreground">{plan.name}</h3>
                <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
              <p className="text-3xl font-bold text-gradient mb-4">
                {plan.price === 0 ? "Grátis" : `R$ ${plan.price.toFixed(2)}`}
              </p>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wifi className="h-4 w-4 text-primary" /> {plan.connections} {plan.connections > 1 ? "conexões" : "conexão"}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" /> {plan.duration} dias
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4 text-primary" /> {plan.bouquets} bouquets
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">{plan.server}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
