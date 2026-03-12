import { Users, UserPlus, Server, Wifi, Eye, Loader2, AlertTriangle, DollarSign, Activity, Clock, Plus } from "lucide-react";
import { Layout } from "@/components/Layout";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const chartStyle = { fontSize: 10, fill: "hsl(215, 15%, 55%)" };
const tooltipStyle = {
  backgroundColor: "hsl(222, 22%, 9%)",
  border: "1px solid hsl(222, 20%, 15%)",
  borderRadius: "6px",
  fontSize: 11,
};

export default function Dashboard() {
  const { role } = useAuth();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [clientsRes, resellersRes, serversRes, connectionsRes, creditsRes, testsRes] = await Promise.all([
        supabase.from("clients").select("id, username, status, expiry_date, created_at, reseller_id", { count: "exact" }),
        supabase.from("resellers").select("id, balance, status, user_id", { count: "exact" }),
        supabase.from("servers").select("id, name, status, max_clients"),
        supabase.from("active_connections").select("id", { count: "exact" }),
        supabase.from("credit_transactions").select("amount, type, created_at"),
        supabase.from("test_lines").select("id, status, created_at, expires_at", { count: "exact" }),
      ]);

      const clients = clientsRes.data || [];
      const resellers = resellersRes.data || [];
      const credits = creditsRes.data || [];
      const now = new Date();

      const activeClients = clients.filter(c => c.status === "active").length;
      const expiredClients = clients.filter(c => c.status === "expired").length;

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

      const expiringList = [...recentExpired, ...expiringSoon].slice(0, 8);

      const resellerClients = clients.filter(c => c.reseller_id);
      const ownClients = clients.filter(c => !c.reseller_id);

      const servers = serversRes.data || [];
      const onlineServers = servers.filter(s => s.status === "online").length;
      const totalBalance = resellers.reduce((sum, r) => sum + (r.balance || 0), 0);
      const activeResellers = resellers.filter(r => r.status === "active").length;

      const creditsPurchased = credits.filter(c => c.type === "purchase").reduce((s, c) => s + c.amount, 0);
      const creditsUsed = credits.filter(c => c.type === "usage").reduce((s, c) => s + Math.abs(c.amount), 0);

      // Low balance resellers
      const lowBalanceResellers = resellers.filter(r => r.balance < 10).slice(0, 10);

      // Chart data (30 days)
      const clientGrowth: { name: string; value: number }[] = [];
      const creditsData: { name: string; created: number; used: number }[] = [];
      const creditsUsedData: { name: string; value: number }[] = [];
      const resellerGrowth: { name: string; value: number }[] = [];
      const testGrowth: { name: string; value: number }[] = [];
      const connectionGrowth: { name: string; value: number }[] = [];

      for (let i = 29; i >= 0; i--) {
        const day = subDays(new Date(), i);
        const dayStr = format(day, "dd");
        const dayISO = format(day, "yyyy-MM-dd");
        
        clientGrowth.push({ name: dayStr, value: clients.filter(c => new Date(c.created_at) <= day).length });
        
        const dc = credits.filter(c => c.type === "purchase" && c.created_at.startsWith(dayISO)).reduce((s, c) => s + c.amount, 0);
        const du = credits.filter(c => c.type === "usage" && c.created_at.startsWith(dayISO)).reduce((s, c) => s + Math.abs(c.amount), 0);
        creditsData.push({ name: dayStr, created: dc, used: du });
        creditsUsedData.push({ name: dayStr, value: du });

        resellerGrowth.push({ name: dayStr, value: resellers.length });

        const tests = testsRes.data || [];
        testGrowth.push({ name: dayStr, value: tests.filter(t => new Date(t.created_at) <= day).length });

        // Simulated connection variation
        connectionGrowth.push({ name: dayStr, value: Math.max(0, (connectionsRes.count || 0) + Math.round((Math.random() - 0.5) * 3)) });
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
        lowBalanceResellers,
        totalServers: servers.length,
        onlineServers,
        activeConnections: connectionsRes.count || 0,
        totalBalance,
        creditsPurchased,
        creditsUsed,
        totalTests: testsRes.count || 0,
        activeTests: (testsRes.data || []).filter(t => t.status === "active").length,
        clientGrowth,
        creditsData,
        creditsUsedData,
        resellerGrowth,
        testGrowth,
        connectionGrowth,
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
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-foreground">Dashboard</h1>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* ═══════ LEFT COLUMN ═══════ */}
          <div className="space-y-3">
            {/* Green balance banner */}
            <div className="rounded-lg bg-success p-4 text-success-foreground">
              <div className="flex items-center gap-2 mb-0.5">
                <DollarSign className="h-5 w-5" />
                <span className="text-2xl font-bold">R$ {(stats?.totalBalance || 0).toFixed(2)}</span>
              </div>
              <p className="text-xs opacity-80">Revendedores ativos · Créditos do sistema</p>
            </div>

            {/* Quick info bar */}
            <div className="glass-card px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>Início: <strong className="text-foreground">01/01</strong></span>
              <span>Créditos criados: <strong className="text-success">R$ {(stats?.creditsPurchased || 0).toFixed(2)}</strong></span>
              <span>Créditos usados: <strong className="text-destructive">R$ {(stats?.creditsUsed || 0).toFixed(2)}</strong></span>
              <span>Servidores: <strong className="text-foreground">{stats?.onlineServers}/{stats?.totalServers}</strong></span>
            </div>

            {/* Chart 1: Clients */}
            <ChartCard icon={<Users className="h-3.5 w-3.5 text-primary" />} title="Clientes" rightValue={String(stats?.totalClients || 0)}>
              <div className="flex gap-4 mb-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Créditos criados</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> Créditos usados</span>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={stats?.clientGrowth || []}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                  <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="value" stroke="hsl(187, 85%, 53%)" fill="url(#g1)" strokeWidth={1.5} name="Clientes" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 2: Credits created/used */}
            <ChartCard icon={<DollarSign className="h-3.5 w-3.5 text-success" />} title="Créditos" rightValue={`R$ ${(stats?.creditsPurchased || 0).toFixed(2)}`}>
              <div className="flex gap-4 mb-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> Créditos criados</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Créditos usados</span>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={stats?.creditsData || []}>
                  <defs>
                    <linearGradient id="g2a" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g2b" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                  <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="created" stroke="hsl(142, 71%, 45%)" fill="url(#g2a)" strokeWidth={1.5} name="Criados" />
                  <Area type="monotone" dataKey="used" stroke="hsl(187, 85%, 53%)" fill="url(#g2b)" strokeWidth={1.5} name="Usados" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 3: Credits used only */}
            <ChartCard icon={<Activity className="h-3.5 w-3.5 text-destructive" />} title="Créditos Usados" rightValue={`R$ ${(stats?.creditsUsed || 0).toFixed(2)}`}>
              <div className="flex gap-4 mb-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> Créditos usados</span>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={stats?.creditsUsedData || []}>
                  <defs>
                    <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                  <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="value" stroke="hsl(0, 72%, 51%)" fill="url(#g3)" strokeWidth={1.5} name="Usados" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Client breakdowns */}
            <ClientSection title="Clientes - Subrevendas" subtitle="Clientes criados pelos seus revendedores"
              total={stats?.resellerClients?.total || 0} expired={stats?.resellerClients?.expired || 0}
              active={stats?.resellerClients?.active || 0} online={0} />
            <ClientSection title="Clientes - Próprios" subtitle="Clientes criados diretamente por você"
              total={stats?.ownClients?.total || 0} expired={stats?.ownClients?.expired || 0}
              active={stats?.ownClients?.active || 0} online={0} />
            <ClientSection title="Clientes - Total" subtitle="Todos os clientes do sistema"
              total={stats?.totalClients || 0} expired={stats?.expiredClients || 0}
              active={stats?.activeClients || 0} online={stats?.activeConnections || 0} />

            {/* Expiring clients table */}
            <div className="glass-card p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3">
                Clientes que venceram nos últimos 7 dias e que irão vencer em 7 dias
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Usuário</th>
                    <th className="pb-2 font-medium">Expiração</th>
                    <th className="pb-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.expiringList || []).length === 0 ? (
                    <tr><td colSpan={3} className="py-3 text-center text-muted-foreground">Nenhum cliente expirando</td></tr>
                  ) : (
                    (stats?.expiringList || []).map((c: any) => {
                      const expired = new Date(c.expiry_date) < new Date();
                      return (
                        <tr key={c.id} className="border-b border-border/30">
                          <td className="py-2 text-foreground">{c.username || c.id.slice(0, 8)}</td>
                          <td className="py-2 text-muted-foreground">{format(new Date(c.expiry_date), "dd/MM/yyyy, HH:mm")}</td>
                          <td className="py-2 text-right">
                            <div className="inline-flex gap-0.5">
                              {["bg-success", "bg-primary", "bg-warning", "bg-destructive", "bg-purple-500"].map((color, i) => (
                                <span key={i} className={`inline-block h-5 w-5 rounded-sm ${color} opacity-80`} />
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══════ RIGHT COLUMN ═══════ */}
          <div className="space-y-3">
            {/* Testes Rápidos */}
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-2">Testes Rápidos</h3>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Testes ativos: <strong className="text-foreground">{stats?.activeTests || 0}</strong></p>
                <p>Total de testes: <strong className="text-foreground">{stats?.totalTests || 0}</strong></p>
                <p>Servidores online: <strong className="text-success">{stats?.onlineServers || 0}</strong></p>
                <p>Conexões ativas: <strong className="text-primary">{stats?.activeConnections || 0}</strong></p>
              </div>
            </div>

            {/* Adicionar Cliente button */}
            <Button className="w-full" onClick={() => navigate("/clients")}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar Cliente
            </Button>

            {/* Chart: Clients - right side (different color) */}
            <ChartCard icon={<Users className="h-3.5 w-3.5 text-primary" />} title="Clientes" rightValue="">
              <div className="flex gap-4 mb-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Créditos criados</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> Créditos usados</span>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={stats?.clientGrowth || []}>
                  <defs>
                    <linearGradient id="g4" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g4b" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(215, 15%, 55%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(215, 15%, 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                  <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="value" stroke="hsl(187, 85%, 53%)" fill="url(#g4)" strokeWidth={1.5} name="Criados" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart: Connections */}
            <ChartCard icon={<Wifi className="h-3.5 w-3.5 text-warning" />} title="Conexões" rightValue={`+${stats?.activeConnections || 0}`}>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={stats?.connectionGrowth || []}>
                  <defs>
                    <linearGradient id="g5" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                  <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="value" stroke="hsl(38, 92%, 50%)" fill="url(#g5)" strokeWidth={1.5} name="Conexões" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart: Tests (pink/magenta like QPanel) */}
            <ChartCard icon={<Clock className="h-3.5 w-3.5" />} title="Testes" rightValue="">
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={stats?.testGrowth || []}>
                  <defs>
                    <linearGradient id="g6" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(330, 70%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(330, 70%, 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                  <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="value" stroke="hsl(330, 70%, 55%)" fill="url(#g6)" strokeWidth={1.5} name="Testes" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart: Resellers (pink) */}
            <ChartCard icon={<UserPlus className="h-3.5 w-3.5 text-pink-400" />} title="Revendedores" rightValue={`S${stats?.totalResellers || 0}`}>
              <div className="flex gap-4 mb-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-400" /> Créditos criados</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> Créditos usados</span>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={stats?.resellerGrowth || []}>
                  <defs>
                    <linearGradient id="g7" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(330, 70%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(330, 70%, 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                  <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="value" stroke="hsl(330, 70%, 55%)" fill="url(#g7)" strokeWidth={1.5} name="Revendedores" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Reseller breakdowns */}
            <ClientSection title="Revendedores - Subrevendas" subtitle="Revendedores de subrevendas"
              total={0} expired={0} active={0} online={0}
              labels={{ expired: "Inativos", active: "Ativos", online: "Online" }} />
            <ClientSection title="Revendedores - Próprios" subtitle="Revendedores diretos"
              total={stats?.totalResellers || 0} expired={0} active={stats?.activeResellers || 0} online={0}
              labels={{ expired: "Inativos", active: "Ativos", online: "Online" }} />
            <ClientSection title="Revendedores - Total" subtitle="Todos os revendedores"
              total={stats?.totalResellers || 0} expired={0} active={stats?.activeResellers || 0} online={0}
              labels={{ expired: "Inativos", active: "Ativos", online: "Online" }} />

            {/* Low balance resellers table */}
            <div className="glass-card p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3">
                Revendedores com menos de 10 créditos
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Usuário</th>
                    <th className="pb-2 font-medium">Créditos</th>
                    <th className="pb-2 font-medium">Criação</th>
                    <th className="pb-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.lowBalanceResellers || []).length === 0 ? (
                    <tr><td colSpan={4} className="py-3 text-center text-muted-foreground">Nenhum revendedor com saldo baixo</td></tr>
                  ) : (
                    (stats?.lowBalanceResellers || []).map((r: any) => (
                      <tr key={r.id} className="border-b border-border/30">
                        <td className="py-2 text-foreground">{r.user_id?.slice(0, 8)}</td>
                        <td className="py-2 text-muted-foreground">{r.balance}</td>
                        <td className="py-2 text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yyyy, HH:mm")}</td>
                        <td className="py-2 text-right">
                          <div className="inline-flex gap-0.5">
                            {["primary", "success"].map((color, i) => (
                              <span key={i} className={`inline-block h-5 w-5 rounded-sm bg-${color} opacity-80`} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ── Sub-components ── */

function ChartCard({ icon, title, rightValue, children }: { icon: React.ReactNode; title: string; rightValue: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        </div>
        {rightValue && <span className="text-sm font-bold text-foreground">{rightValue}</span>}
      </div>
      {children}
    </div>
  );
}

function ClientSection({
  title, subtitle, total, expired, active, online, labels,
}: {
  title: string; subtitle: string; total: number; expired: number; active: number; online: number;
  labels?: { expired: string; active: string; online: string };
}) {
  const l = labels || { expired: "Expirados", active: "Ativos", online: "Online" };
  return (
    <div className="glass-card p-4">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <p className="text-[10px] text-muted-foreground mb-2">{subtitle}</p>
      <div className="grid grid-cols-4 gap-2">
        <StatPill icon={<Users className="h-3.5 w-3.5" />} label="Total" value={total} color="text-primary" />
        <StatPill icon={<AlertTriangle className="h-3.5 w-3.5" />} label={l.expired} value={expired} color="text-destructive" />
        <StatPill icon={<Eye className="h-3.5 w-3.5" />} label={l.active} value={active} color="text-success" />
        <StatPill icon={<Wifi className="h-3.5 w-3.5" />} label={l.online} value={online} color="text-warning" />
      </div>
    </div>
  );
}

function StatPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-md px-2.5 py-2">
      <div className={color}>{icon}</div>
      <div>
        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
        <p className="text-sm font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}
