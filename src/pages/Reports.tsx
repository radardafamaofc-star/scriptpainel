import { Layout } from "@/components/Layout";
import { BarChart3, Loader2, Users, DollarSign, RefreshCw, TestTube } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format, subDays, startOfDay } from "date-fns";

const chartStyle = { fontSize: 11, fill: "hsl(215, 15%, 55%)" };
const COLORS = ["hsl(187, 85%, 53%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)"];

export default function Reports() {
  const { role } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const [clientsRes, creditsRes, testsRes, plansRes] = await Promise.all([
        supabase.from("clients").select("id, status, plan_id, created_at, expiry_date"),
        supabase.from("credit_transactions").select("id, amount, type, created_at"),
        supabase.from("test_lines").select("id, created_at"),
        supabase.from("plans").select("id, name"),
      ]);

      const clients = clientsRes.data || [];
      const credits = creditsRes.data || [];
      const tests = testsRes.data || [];
      const plans = plansRes.data || [];

      // Clients by status
      const statusCounts = [
        { name: "Ativos", value: clients.filter(c => c.status === "active").length },
        { name: "Expirados", value: clients.filter(c => c.expiry_date && new Date(c.expiry_date) < new Date()).length },
        { name: "Suspensos", value: clients.filter(c => c.status === "suspended").length },
      ].filter(s => s.value > 0);

      // Clients by plan
      const planCounts = plans.map(p => ({
        name: p.name,
        value: clients.filter(c => c.plan_id === p.id).length,
      })).filter(p => p.value > 0);

      // Activity last 7 days
      const dailyActivity = [];
      for (let i = 6; i >= 0; i--) {
        const day = subDays(new Date(), i);
        const dayStart = startOfDay(day);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const newClients = clients.filter(c => {
          const d = new Date(c.created_at);
          return d >= dayStart && d < dayEnd;
        }).length;

        const newTests = tests.filter(t => {
          const d = new Date(t.created_at);
          return d >= dayStart && d < dayEnd;
        }).length;

        dailyActivity.push({
          name: format(day, "dd/MM"),
          clientes: newClients,
          testes: newTests,
        });
      }

      // Credit summary
      const totalPurchased = credits.filter(c => c.type === "purchase").reduce((s, c) => s + Number(c.amount), 0);
      const totalUsed = credits.filter(c => c.type === "usage").reduce((s, c) => s + Math.abs(Number(c.amount)), 0);
      const totalTransferred = credits.filter(c => c.type === "transfer").reduce((s, c) => s + Math.abs(Number(c.amount)), 0);

      return {
        totalClients: clients.length,
        totalTests: tests.length,
        totalPurchased,
        totalUsed,
        totalTransferred,
        statusCounts,
        planCounts,
        dailyActivity,
      };
    },
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
          <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Estatísticas e métricas do painel</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Total Clientes</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{data?.totalClients || 0}</p>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <TestTube className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Testes Gerados</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{data?.totalTests || 0}</p>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="h-5 w-5 text-success" />
              <span className="text-sm text-muted-foreground">Créditos Comprados</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{(data?.totalPurchased || 0).toFixed(2)}</p>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <RefreshCw className="h-5 w-5 text-warning" />
              <span className="text-sm text-muted-foreground">Créditos Usados</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{(data?.totalUsed || 0).toFixed(2)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Daily activity chart */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Atividade (7 dias)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data?.dailyActivity || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(222, 22%, 9%)", border: "1px solid hsl(222, 20%, 15%)", borderRadius: "8px", fontSize: 12 }} />
                <Bar dataKey="clientes" fill="hsl(187, 85%, 53%)" radius={[4, 4, 0, 0]} name="Clientes" />
                <Bar dataKey="testes" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} name="Testes" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Status distribution */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Clientes por Status</h3>
            {data?.statusCounts && data.statusCounts.length > 0 ? (
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={data.statusCounts} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {data.statusCounts.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "hsl(222, 22%, 9%)", border: "1px solid hsl(222, 20%, 15%)", borderRadius: "8px", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-10">Sem dados</p>
            )}
          </div>
        </div>

        {/* Plans distribution */}
        {data?.planCounts && data.planCounts.length > 0 && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Clientes por Plano</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.planCounts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                <XAxis type="number" tick={chartStyle} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(222, 22%, 9%)", border: "1px solid hsl(222, 20%, 15%)", borderRadius: "8px", fontSize: 12 }} />
                <Bar dataKey="value" fill="hsl(187, 85%, 53%)" radius={[0, 4, 4, 0]} name="Clientes" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Layout>
  );
}
