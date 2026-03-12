import { Layout } from "@/components/Layout";
import { Plus, Search, MoreVertical, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const mockClients = [
  { id: 1, username: "joao_silva", email: "joao@email.com", plan: "Premium", connections: 3, maxConn: 3, expiry: "2026-04-15", server: "Servidor Principal", status: "active" },
  { id: 2, username: "maria_santos", email: "maria@email.com", plan: "Básico", connections: 1, maxConn: 1, expiry: "2026-03-25", server: "Servidor US-East", status: "active" },
  { id: 3, username: "pedro_lima", email: "pedro@email.com", plan: "Premium", connections: 0, maxConn: 3, expiry: "2026-02-10", server: "Servidor Principal", status: "expired" },
  { id: 4, username: "ana_costa", email: "ana@email.com", plan: "Básico", connections: 1, maxConn: 1, expiry: "2026-05-01", server: "Servidor BR-South", status: "active" },
  { id: 5, username: "carlos_rocha", email: "carlos@email.com", plan: "Ultra", connections: 2, maxConn: 5, expiry: "2026-06-20", server: "Servidor Principal", status: "active" },
  { id: 6, username: "lucia_ferreira", email: "lucia@email.com", plan: "Básico", connections: 0, maxConn: 1, expiry: "2026-01-05", server: "Servidor EU-West", status: "suspended" },
];

export default function Clients() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = mockClients.filter(c => c.username.includes(search) || c.email.includes(search));

  const statusStyle: Record<string, string> = {
    active: "bg-success/10 text-success",
    expired: "bg-warning/10 text-warning",
    suspended: "bg-destructive/10 text-destructive",
  };
  const statusLabel: Record<string, string> = { active: "Ativo", expired: "Expirado", suspended: "Suspenso" };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1">{mockClients.length} clientes registrados</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" /> Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="text-foreground">Criar Cliente</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <Input placeholder="Usuário" className="bg-secondary border-border" />
                <Input placeholder="Senha" type="password" className="bg-secondary border-border" />
                <Input placeholder="Email" type="email" className="bg-secondary border-border" />
                <Input placeholder="Nº de conexões" type="number" className="bg-secondary border-border" />
                <Input placeholder="Data de expiração" type="date" className="bg-secondary border-border" />
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Criar Cliente</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar clientes..." className="pl-10 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

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
              {filtered.map(client => (
                <tr key={client.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                  <td className="px-5 py-3">
                    <div>
                      <p className="font-medium text-foreground">{client.username}</p>
                      <p className="text-xs text-muted-foreground">{client.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-foreground">{client.plan}</td>
                  <td className="px-5 py-3 text-foreground font-mono">{client.connections}/{client.maxConn}</td>
                  <td className="px-5 py-3 text-foreground">{client.expiry}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{client.server}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[client.status]}`}>
                      {statusLabel[client.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
