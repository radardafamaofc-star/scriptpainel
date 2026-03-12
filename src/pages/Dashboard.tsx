import { Users, UserPlus, Server, Wifi, Monitor, TrendingUp, Loader2, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Layout } from "@/components/Layout";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays } from "date-fns";

const chartStyle = { fontSize: 11, fill: "hsl(215, 15%, 55%)" };

export default function Dashboard() {
  const { role } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [clientsRes, resellersRes, serversRes, connectionsRes, logsRes] = await Promise.all([
        supabase.from("clients").select("id, status, expiry_date, created_at", { count: "exact" }),
        supabase.from("resellers").select("id", { count: "exact" }),
        supabase.from("servers").select("id, name, status, max_clients"),
        supabase.from("active_connections").select("id", { count: "exact" }),
        supabase.from("system_logs").select("id, created_at, type").order("created_at", { ascending: false }).limit(50),
      ]);

      const clients = clientsRes.data || [];
      const activeClients = clients.filter(c => c.status === "active").length;
      const expiringSoon = clients.filter(c => {
        if (!c.expiry_date) return false;
        const exp = new Date(c.expiry_date);
        const now = new Date();
        const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diff > 0 && diff <= 7;
      }).length;

      const servers = serversRes.data || [];
      const onlineServers = servers.filter(s => s.status === "online").length;

      // Build client growth data (last 7 days)
      const growth = [];
      for (let i = 6; i >= 0; i--) {
        const day = subDays(new Date(), i);
        const dayStr = format(day, "dd/MM");
        const count = clients.filter(c => new Date(c.created_at) <= day).length;
        growth.push({ name: dayStr, value: count });
      }

      // Server usage
      const serverUsage = servers.map(s => ({
        name: s.name.length > 12 ? s.name.substring(0, 12) + "…" : s.name,
        usage: Math.round(Math.random() * 100), // Placeholder until real data
      }));

      return {
        totalClients: clientsRes.count || 0,
        activeClients,
        expiringSoon,
        totalResellers: resellersRes.count || 0,
        totalServers: servers.length,
        onlineServers,
        activeConnections: connectionsRes.count || 0,
        growth,
        serverUsage,
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral do sistema xSync Panel</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard title="Clientes" value={String(stats?.totalClients || 0)} change={`${stats?.activeClients || 0} ativos`} changeType="positive" icon={Users} />
          <StatCard title="Revendedores" value={String(stats?.totalResellers || 0)} change="" changeType="neutral" icon={UserPlus} />
          <StatCard title="Conexões Ativas" value={String(stats?.activeConnections || 0)} change="" changeType="neutral" icon={Wifi} />
          <StatCard title="Expirando em 7d" value={String(stats?.expiringSoon || 0)} change={stats?.expiringSoon ? "Atenção" : "OK"} changeType={stats?.expiringSoon ? "negative" : "positive"} icon={AlertTriangle} />
          <StatCard title="Servidores" value={String(stats?.totalServers || 0)} change={`${stats?.onlineServers || 0} online`} changeType="positive" icon={Server} />
          <StatCard title="Online" value={`${stats?.onlineServers || 0}/${stats?.totalServers || 0}`} change="" changeType="neutral" icon={TrendingUp} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Crescimento de Clientes (7 dias)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={stats?.growth || []}>
                <defs>
                  <linearGradient id="colorClients" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(222, 22%, 9%)", border: "1px solid hsl(222, 20%, 15%)", borderRadius: "8px", fontSize: 12 }} />
                <Area type="monotone" dataKey="value" stroke="hsl(187, 85%, 53%)" fillOpacity={1} fill="url(#colorClients)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Uso por Servidor</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats?.serverUsage || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                <XAxis type="number" tick={chartStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
                <YAxis type="category" dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(222, 22%, 9%)", border: "1px solid hsl(222, 20%, 15%)", borderRadius: "8px", fontSize: 12 }} />
                <Bar dataKey="usage" fill="hsl(187, 85%, 53%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Layout>
  );
}
