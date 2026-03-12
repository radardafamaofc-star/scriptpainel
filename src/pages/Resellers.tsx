import { Layout } from "@/components/Layout";
import { Plus, MoreVertical, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const mockResellers = [
  { id: 1, username: "revenda_sp", balance: 450.00, clients: 120, limit: 200, status: "active" },
  { id: 2, username: "revenda_rj", balance: 230.50, clients: 85, limit: 150, status: "active" },
  { id: 3, username: "revenda_mg", balance: 0, clients: 45, limit: 100, status: "suspended" },
  { id: 4, username: "revenda_ba", balance: 890.00, clients: 200, limit: 300, status: "active" },
];

export default function Resellers() {
  const [open, setOpen] = useState(false);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Revendedores</h1>
            <p className="text-sm text-muted-foreground mt-1">{mockResellers.length} revendedores ativos</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4 mr-2" /> Novo Revendedor</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="text-foreground">Criar Revendedor</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <Input placeholder="Usuário" className="bg-secondary border-border" />
                <Input placeholder="Senha" type="password" className="bg-secondary border-border" />
                <Input placeholder="Saldo inicial" type="number" className="bg-secondary border-border" />
                <Input placeholder="Limite de clientes" type="number" className="bg-secondary border-border" />
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Criar Revendedor</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mockResellers.map(r => (
            <div key={r.id} className="glass-card p-5 animate-slide-in">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {r.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{r.username}</h3>
                    <span className={`text-xs font-medium ${r.status === "active" ? "text-success" : "text-destructive"}`}>
                      {r.status === "active" ? "Ativo" : "Suspenso"}
                    </span>
                  </div>
                </div>
                <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1"><Wallet className="h-3 w-3 text-primary" /> R$ {r.balance.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Clientes</p>
                  <p className="text-sm font-semibold text-foreground">{r.clients}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Limite</p>
                  <p className="text-sm font-semibold text-foreground">{r.limit}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
