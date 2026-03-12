import { Layout } from "@/components/Layout";
import { Wifi, Ban, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const mockConnections = [
  { id: 1, user: "joao_silva", ip: "187.45.123.89", channel: "HBO Max", server: "Srv Principal", duration: "1h 23m" },
  { id: 2, user: "ana_costa", ip: "201.12.45.67", channel: "ESPN Brasil", server: "Srv BR-South", duration: "45m" },
  { id: 3, user: "carlos_rocha", ip: "177.88.12.34", channel: "Globo HD", server: "Srv Principal", duration: "2h 10m" },
  { id: 4, user: "carlos_rocha", ip: "177.88.12.35", channel: "SporTV", server: "Srv Principal", duration: "30m" },
  { id: 5, user: "maria_santos", ip: "189.33.22.11", channel: "Discovery", server: "Srv US-East", duration: "15m" },
  { id: 6, user: "revenda_sp_c1", ip: "200.10.20.30", channel: "Fox News", server: "Srv Principal", duration: "3h 05m" },
];

export default function Connections() {
  const [search, setSearch] = useState("");
  const filtered = mockConnections.filter(c => c.user.includes(search) || c.ip.includes(search) || c.channel.toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conexões Ativas</h1>
          <p className="text-sm text-muted-foreground mt-1">{mockConnections.length} conexões em tempo real</p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por usuário, IP ou canal..." className="pl-10 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Usuário</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">IP</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Canal</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Servidor</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Duração</th>
                <th className="px-5 py-3 text-muted-foreground font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(conn => (
                <tr key={conn.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                  <td className="px-5 py-3 text-foreground font-medium flex items-center gap-2">
                    <Wifi className="h-3 w-3 text-success animate-pulse-glow" /> {conn.user}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{conn.ip}</td>
                  <td className="px-5 py-3 text-foreground">{conn.channel}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{conn.server}</td>
                  <td className="px-5 py-3 text-foreground">{conn.duration}</td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7">
                      <Ban className="h-3 w-3 mr-1" /> Desconectar
                    </Button>
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
