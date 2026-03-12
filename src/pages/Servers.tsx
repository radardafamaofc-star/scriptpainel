import { Layout } from "@/components/Layout";
import { Server, Plus, Wifi, WifiOff, MoreVertical, TestTube } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const mockServers = [
  { id: 1, name: "Servidor Principal", host: "192.168.1.100", port: 25461, status: "online", clients: 420, capacity: 500, uptime: "99.8%" },
  { id: 2, name: "Servidor US-East", host: "us-east.example.com", port: 25461, status: "online", clients: 312, capacity: 400, uptime: "99.5%" },
  { id: 3, name: "Servidor EU-West", host: "eu-west.example.com", port: 25461, status: "offline", clients: 0, capacity: 300, uptime: "0%" },
  { id: 4, name: "Servidor BR-South", host: "br-south.example.com", port: 25461, status: "online", clients: 145, capacity: 200, uptime: "98.9%" },
  { id: 5, name: "Servidor Backup", host: "backup.example.com", port: 25461, status: "online", clients: 15, capacity: 100, uptime: "99.9%" },
];

export default function Servers() {
  const [open, setOpen] = useState(false);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Servidores</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie seus servidores IPTV</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" /> Adicionar Servidor
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Novo Servidor</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <Input placeholder="Nome do servidor" className="bg-secondary border-border" />
                <Input placeholder="IP ou domínio" className="bg-secondary border-border" />
                <Input placeholder="Porta" type="number" defaultValue={25461} className="bg-secondary border-border" />
                <Input placeholder="Usuário do painel" className="bg-secondary border-border" />
                <Input placeholder="Senha do painel" type="password" className="bg-secondary border-border" />
                <Input placeholder="API Key (opcional)" className="bg-secondary border-border" />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-border">
                    <TestTube className="h-4 w-4 mr-2" /> Testar Conexão
                  </Button>
                  <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                    Salvar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {mockServers.map((server) => (
            <div key={server.id} className="glass-card p-5 flex items-center justify-between animate-slide-in">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${server.status === "online" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  {server.status === "online" ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{server.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{server.host}:{server.port}</p>
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Clientes</p>
                  <p className="text-sm font-semibold text-foreground">{server.clients}/{server.capacity}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Uptime</p>
                  <p className="text-sm font-semibold text-foreground">{server.uptime}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${server.status === "online" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  {server.status === "online" ? "ONLINE" : "OFFLINE"}
                </span>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
