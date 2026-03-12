import { Users, UserPlus, Server, Wifi, TrendingUp, Loader2, AlertTriangle, DollarSign, Eye, Clock, Activity } from "lucide-react";
import { Layout } from "@/components/Layout";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays } from "date-fns";

const chartStyle = { fontSize: 11, fill: "hsl(215, 15%, 55%)" };
const tooltipStyle = {
  backgroundColor: "hsl(222, 22%, 9%)",
  border: "1px solid hsl(222, 20%, 15%)",
  borderRadius: "8px",
  fontSize: 12,
};

export default function Dashboard() {
  const { role } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [clientsRes, resellersRes, serversRes, connectionsRes, creditsRes] = await Promise.all([
        supabase.from("clients").select("id, status, expiry_date, created_at, reseller_id", { count: "exact" }),
        supabase.from("resellers").select("id, balance, status, user_id", { count: "exact" }),
        supabase.from("servers").select("id, name, status, max_clients"),
        supabase.from("active_connections").select("id", { count: "exact" }),
        supabase.from("credit_transactions").select("amount, type, created_at"),
      ]);

      const clients = clientsRes.data || [];
      const resellers = resellersRes.data || [];
      const credits = creditsRes.data || [];

      const activeClients = clients.filter(c => c.status === "active").length;
      const expiredClients = clients.filter(c => c.status === "expired").length;
      const now = new Date();

      const expiringSoon = clients.filter(c => {
        if (!c.expiry_date) return false;
        const exp = new Date(c.expiry_date);
        const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diff > 0 && diff <= 7;
      });

      const recentExpired = clients.filter(c => {
        if (!c.expiry_date) return false;
        const exp = new Date(c.expiry_date);
        const diff = (now.getTime() - exp.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      });

      const expiringList = [...recentExpired, ...expiringSoon].slice(0, 10);

      // Clients by reseller vs own
      const resellerClients = clients.filter(c => c.reseller_id);
      const ownClients = clients.filter(c => !c.reseller_id);

      const servers = serversRes.data || [];
      const onlineServers = servers.filter(s => s.status === "online").length;

      // Total balance
      const totalBalance = resellers.reduce((sum, r) => sum + (r.balance || 0), 0);
      const activeResellers = resellers.filter(r => r.status === "active").length;

      // Credits data (last 30 days)
      const creditsPurchased = credits.filter(c => c.type === "purchase").reduce((s, c) => s + c.amount, 0);
      const creditsUsed = credits.filter(c => c.type === "usage").reduce((s, c) => s + Math.abs(c.amount), 0);

      // Build chart data (last 30 days)
      const clientGrowth = [];
      const creditsCreatedData = [];
      const creditsUsedData = [];
      for (let i = 29; i >= 0; i--) {
        const day = subDays(new Date(), i);
        const dayStr = format(day, "dd/MM");
        const dayISO = format(day, "yyyy-MM-dd");
        const count = clients.filter(c => new Date(c.created_at) <= day).length;
        clientGrowth.push({ name: dayStr, value: count });

        const dayCreditsCreated = credits
          .filter(c => c.type === "purchase" && c.created_at.startsWith(dayISO))
          .reduce((s, c) => s + c.amount, 0);
        const dayCreditsUsed = credits
          .filter(c => c.type === "usage" && c.created_at.startsWith(dayISO))
          .reduce((s, c) => s + Math.abs(c.amount), 0);

        creditsCreatedData.push({ name: dayStr, created: dayCreditsCreated, used: dayCreditsUsed });
        creditsUsedData.push({ name: dayStr, value: dayCreditsUsed });
      }

      return {
        totalClients: clientsRes.count || 0,
        activeClients,
        expiredClients,
        expiringSoon: expiringSoon.length,
        expiringList,
        resellerClients: {
          total: resellerClients.length,
          active: resellerClients.filter(c => c.status === "active").length,
          expired: resellerClients.filter(c => c.status === "expired").length,
        },
        ownClients: {
          total: ownClients.length,
          active: ownClients.filter(c => c.status === "active").length,
          expired: ownClients.filter(c => c.status === "expired").length,
        },
        totalResellers: resellersRes.count || 0,
        activeResellers,
        totalServers: servers.length,
        onlineServers,
        activeConnections: connectionsRes.count || 0,
        totalBalance,
        creditsPurchased,
        creditsUsed,
        clientGrowth,
        creditsCreatedData,
        creditsUsedData,
      };
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral do sistema xSync Panel</p>
        </div>

        {/* Banner de saldo total - estilo QPanel */}
        <div className="rounded-xl bg-success p-5 text-success-foreground">
          <div className="flex items-center gap-3 mb-1">
            <DollarSign className="h-6 w-6" />
            <span className="text-3xl font-bold">R$ {(stats?.totalBalance || 0).toFixed(2)}</span>
          </div>
          <p className="text-sm opacity-90">Saldo total dos revendedores · Créditos do sistema</p>
        </div>

        {/* Grid de resumo rápido */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Revendedores ativos" value={stats?.activeResellers || 0} />
          <MiniStat label="Créditos criados" value={`R$ ${(stats?.creditsPurchased || 0).toFixed(2)}`} />
          <MiniStat label="Créditos usados" value={`R$ ${(stats?.creditsUsed || 0).toFixed(2)}`} />
          <MiniStat label="Conexões ativas" value={stats?.activeConnections || 0} />
        </div>

        {/* Charts section */}
        <div className="space-y-4">
          {/* Chart 1: Crescimento de Clientes */}
          <ChartCard title="Clientes" icon={<Users className="h-4 w-4 text-primary" />} value={stats?.totalClients || 0}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats?.clientGrowth || []}>
                <defs>
                  <linearGradient id="gradClients" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="value" stroke="hsl(187, 85%, 53%)" fillOpacity={1} fill="url(#gradClients)" strokeWidth={2} name="Clientes" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Chart 2: Créditos criados vs usados */}
          <ChartCard title="Créditos" icon={<DollarSign className="h-4 w-4 text-success" />} value={`R$ ${(stats?.creditsPurchased || 0).toFixed(2)}`}>
            <div className="flex gap-4 mb-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-success" /> Créditos criados
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Créditos usados
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats?.creditsCreatedData || []}>
                <defs>
                  <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradUsed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="created" stroke="hsl(142, 71%, 45%)" fillOpacity={1} fill="url(#gradCreated)" strokeWidth={2} name="Criados" />
                <Area type="monotone" dataKey="used" stroke="hsl(187, 85%, 53%)" fillOpacity={1} fill="url(#gradUsed)" strokeWidth={2} name="Usados" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Chart 3: Créditos usados isolado */}
          <ChartCard title="Créditos Usados" icon={<Activity className="h-4 w-4 text-destructive" />} value={`R$ ${(stats?.creditsUsed || 0).toFixed(2)}`}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={stats?.creditsUsedData || []}>
                <defs>
                  <linearGradient id="gradUsedOnly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="value" stroke="hsl(0, 72%, 51%)" fillOpacity={1} fill="url(#gradUsedOnly)" strokeWidth={2} name="Créditos Usados" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Client breakdown sections - QPanel style */}
        <div className="space-y-3">
          <ClientSection
            title="Clientes - Subrevendas"
            subtitle="Clientes criados pelos seus revendedores"
            total={stats?.resellerClients?.total || 0}
            expired={stats?.resellerClients?.expired || 0}
            active={stats?.resellerClients?.active || 0}
            online={0}
          />
          <ClientSection
            title="Clientes - Próprios"
            subtitle="Clientes criados diretamente por você"
            total={stats?.ownClients?.total || 0}
            expired={stats?.ownClients?.expired || 0}
            active={stats?.ownClients?.active || 0}
            online={0}
          />
          <ClientSection
            title="Clientes - Total"
            subtitle="Todos os clientes do sistema"
            total={stats?.totalClients || 0}
            expired={stats?.expiredClients || 0}
            active={stats?.activeClients || 0}
            online={stats?.activeConnections || 0}
          />
        </div>

        {/* Tabela de clientes expirando */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Clientes que venceram nos últimos 7 dias e que irão vencer em 7 dias
          </h3>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Usuário</th>
                  <th className="pb-2 font-medium">Expiração</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.expiringList || []).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-muted-foreground">
                      Nenhum cliente expirando
                    </td>
                  </tr>
                ) : (
                  (stats?.expiringList || []).map((client: any) => {
                    const isExpired = new Date(client.expiry_date) < new Date();
                    return (
                      <tr key={client.id} className="border-b border-border/50">
                        <td className="py-2.5 text-foreground font-medium">{client.username || client.id.slice(0, 8)}</td>
                        <td className="py-2.5 text-muted-foreground">
                          {client.expiry_date ? format(new Date(client.expiry_date), "dd/MM/yyyy HH:mm") : "—"}
                        </td>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            isExpired
                              ? "bg-destructive/10 text-destructive"
                              : "bg-warning/10 text-warning"
                          }`}>
                            {isExpired ? "Expirado" : "Expirando"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resumo de revendedores */}
        <div className="space-y-3">
          <ClientSection
            title="Revendedores - Total"
            subtitle="Todos os revendedores do sistema"
            total={stats?.totalResellers || 0}
            expired={0}
            active={stats?.activeResellers || 0}
            online={0}
            labels={{ expired: "Inativos", active: "Ativos", online: "Online" }}
          />
        </div>
      </div>
    </Layout>
  );
}

/* ── Sub-components ── */

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass-card p-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function ChartCard({ title, icon, value, children }: { title: string; icon: React.ReactNode; value: string | number; children: React.ReactNode }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <span className="text-lg font-bold text-foreground">{value}</span>
      </div>
      {children}
    </div>
  );
}

function ClientSection({
  title,
  subtitle,
  total,
  expired,
  active,
  online,
  labels,
}: {
  title: string;
  subtitle: string;
  total: number;
  expired: number;
  active: number;
  online: number;
  labels?: { expired: string; active: string; online: string };
}) {
  const l = labels || { expired: "Expirados", active: "Ativos", online: "Online" };
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatPill icon={<Users className="h-4 w-4" />} label="Total" value={total} color="text-primary" />
        <StatPill icon={<AlertTriangle className="h-4 w-4" />} label={l.expired} value={expired} color="text-destructive" />
        <StatPill icon={<Eye className="h-4 w-4" />} label={l.active} value={active} color="text-success" />
        <StatPill icon={<Wifi className="h-4 w-4" />} label={l.online} value={online} color="text-warning" />
      </div>
    </div>
  );
}

function StatPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5 bg-muted/50 rounded-lg px-3 py-2.5">
      <div className={color}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-base font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}
