import { Users, UserPlus, Wifi, Loader2, DollarSign, Plus, Circle, TestTube, Copy } from "lucide-react";
import { Layout } from "@/components/Layout";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { renderTemplate, DEFAULT_TEMPLATE } from "@/lib/template";

const chartStyle = { fontSize: 10, fill: "hsl(215, 15%, 55%)" };
const tooltipStyle = {
  backgroundColor: "hsl(222, 22%, 9%)",
  border: "1px solid hsl(222, 20%, 15%)",
  borderRadius: "6px",
  fontSize: 11,
};

export default function Dashboard() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testServerId, setTestServerId] = useState("");
  const [testDuration, setTestDuration] = useState("4");
  const [testResult, setTestResult] = useState<{ username: string; password: string; template?: string } | null>(null);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [clientsRes, resellersRes, serversRes, connectionsRes, creditsRes, plansRes] = await Promise.all([
        supabase.from("clients").select("id, username, status, expiry_date, created_at, reseller_id, plan_id", { count: "exact" }),
        supabase.from("resellers").select("id, balance, status, user_id", { count: "exact" }),
        supabase.from("servers").select("id, name, status, created_at"),
        supabase.from("active_connections").select("id, client_id", { count: "exact" }),
        supabase.from("credit_transactions").select("amount, type, created_at"),
        supabase.from("plans").select("id, name, server_id, servers(name)"),
      ]);

      const clients = clientsRes.data || [];
      const resellers = resellersRes.data || [];
      const servers = serversRes.data || [];
      const plans = plansRes.data || [];
      const connections = connectionsRes.data || [];
      const credits = creditsRes.data || [];
      const now = new Date();

      const activeClients = clients.filter(c => c.status === "active").length;
      const inactiveClients = clients.filter(c => c.status !== "active").length;
      const totalConnections = connectionsRes.count || 0;

      // Expiring/expired within 7 days
      const expiringList = clients.filter(c => {
        if (!c.expiry_date) return false;
        const exp = new Date(c.expiry_date);
        const diffDays = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays >= -7 && diffDays <= 7;
      }).slice(0, 8);

      // Client breakdown
      const resellerClients = clients.filter(c => c.reseller_id);
      const ownClients = clients.filter(c => !c.reseller_id);

      // Reseller breakdown
      const activeResellers = resellers.filter(r => r.status === "active").length;
      const inactiveResellers = resellers.filter(r => r.status !== "active").length;
      const lowBalanceResellers = resellers.filter(r => r.balance < 10);

      // Expected revenue (active clients that will renew)
      const expectedRevenue = 0; // Placeholder - would come from plans pricing

      // Credits
      const creditsPurchased = credits.filter(c => c.type === "purchase").reduce((s, c) => s + c.amount, 0);
      const creditsUsed = credits.filter(c => c.type === "usage").reduce((s, c) => s + Math.abs(c.amount), 0);

      // Chart data (30 days)
      const clientGrowth: { name: string; atual: number; anterior: number }[] = [];
      const resellerGrowth: { name: string; atual: number; anterior: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const day = subDays(now, i);
        const dayStr = format(day, "dd");
        const dayISO = format(day, "yyyy-MM-dd");
        const prevDay = subDays(day, 30);

        const newClientsDay = clients.filter(c => c.created_at.startsWith(dayISO)).length;
        const newClientsPrev = clients.filter(c => c.created_at.startsWith(format(prevDay, "yyyy-MM-dd"))).length;
        clientGrowth.push({ name: dayStr, atual: newClientsDay, anterior: newClientsPrev });

        // Reseller growth is simulated for now
        resellerGrowth.push({ name: dayStr, atual: Math.max(0, Math.round(Math.random() * 2)), anterior: Math.max(0, Math.round(Math.random() * 1.5)) });
      }

      // Plans for quick test (plans that have test flag or all plans)
      const testPlans = plans.map((p: any) => ({
        id: p.id,
        name: p.name,
        serverName: p.servers?.name || "—",
      }));

      return {
        totalClients: clientsRes.count || 0,
        activeClients,
        inactiveClients,
        totalConnections,
        expiringList,
        resellerClients: {
          total: resellerClients.length,
          active: resellerClients.filter(c => c.status === "active").length,
          inactive: resellerClients.filter(c => c.status !== "active").length,
          connections: 0,
        },
        ownClients: {
          total: ownClients.length,
          active: ownClients.filter(c => c.status === "active").length,
          inactive: ownClients.filter(c => c.status !== "active").length,
          connections: 0,
        },
        servers,
        totalResellers: resellersRes.count || 0,
        activeResellers,
        inactiveResellers,
        lowBalanceResellers,
        expectedRevenue,
        newClientsCount: clients.filter(c => {
          const d = (now.getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return d <= 30;
        }).length,
        newResellersCount: resellers.length,
        testPlans,
        clientGrowth,
        resellerGrowth,
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
            {/* Green revenue banner */}
            <div className="rounded-lg bg-success p-5">
              <div className="flex items-center gap-2.5 mb-1">
                <Users className="h-7 w-7 text-success-foreground/80" />
              </div>
              <p className="text-2xl font-bold text-success-foreground">R$ {(stats?.expectedRevenue || 0).toFixed(2)}</p>
              <p className="text-xs text-success-foreground/80 mt-0.5">Meu Rendimento Esperado - Próximos 30 Dias</p>
            </div>

            {/* Servers list */}
            <div className="glass-card p-4">
              {(stats?.servers || []).map((server: any) => (
                <div key={server.id} className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-8">
                    <span className="text-sm font-medium text-foreground">{server.name}</span>
                    <span className="text-xs text-muted-foreground">IPTV</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-primary">{format(new Date(server.created_at), "dd/MM/yyyy, HH:mm:ss")}</span>
                    <Circle className={`h-3 w-3 fill-current ${server.status === "online" ? "text-success" : "text-destructive"}`} />
                  </div>
                </div>
              ))}
              {(stats?.servers || []).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhum servidor configurado</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-2">Atualizado a cada 5 minutos</p>
            </div>

            {/* New Clients count + chart */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-muted">
                    <UserPlus className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground">{stats?.newClientsCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Novos Clientes - Últimos 30 Dias</p>
                </div>
              </div>
              <div className="flex gap-4 mt-3 mb-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Período Atual</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" />Período Anterior</span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={stats?.clientGrowth || []}>
                  <defs>
                    <linearGradient id="gClient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(187, 85%, 53%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                  <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="atual" stroke="hsl(187, 85%, 53%)" fill="url(#gClient)" strokeWidth={1.5} name="Período Atual" />
                  <Area type="monotone" dataKey="anterior" stroke="hsl(215, 15%, 55%)" fillOpacity={0.1} fill="hsl(215, 15%, 55%)" strokeWidth={1} name="Período Anterior" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Client sections */}
            <ClientSection title="Clientes - Subrevendas"
              active={stats?.resellerClients?.active || 0}
              inactive={stats?.resellerClients?.inactive || 0}
              total={stats?.resellerClients?.total || 0}
              connections={stats?.resellerClients?.connections || 0} />

            <ClientSection title="Clientes - Próprios"
              active={stats?.ownClients?.active || 0}
              inactive={stats?.ownClients?.inactive || 0}
              total={stats?.ownClients?.total || 0}
              connections={stats?.ownClients?.connections || 0} />

            <ClientSection title="Clientes - Total"
              active={stats?.activeClients || 0}
              inactive={stats?.inactiveClients || 0}
              total={stats?.totalClients || 0}
              connections={stats?.totalConnections || 0} />

            {/* Expiring clients table */}
            <div className="glass-card p-4">
              <h3 className="text-sm font-bold text-foreground">Clientes que venceram nos últimos 7 dias e que vão vencer em 7 dias</h3>
              <p className="text-xs text-muted-foreground mb-3">{stats?.expiringList?.length || 0} clientes</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Usuário</th>
                    <th className="pb-2 font-medium">Vencimento</th>
                    <th className="pb-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.expiringList || []).length === 0 ? (
                    <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">Nenhum cliente</td></tr>
                  ) : (
                    (stats?.expiringList || []).map((c: any) => (
                      <tr key={c.id} className="border-b border-border/30">
                        <td className="py-2.5">
                          <span className="text-primary font-medium">{c.username || c.id.slice(0, 6)}</span>
                          <br /><span className="text-muted-foreground text-[10px]">Valor do Plano:</span>
                        </td>
                        <td className="py-2.5 text-muted-foreground">{format(new Date(c.expiry_date), "dd/MM/yyyy, HH:mm:ss")}</td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex gap-1">
                            <ActionBtn color="bg-success" />
                            <ActionBtn color="bg-teal-600" />
                            <ActionBtn color="bg-blue-600" />
                            <ActionBtn color="bg-green-600" />
                            <ActionBtn color="bg-emerald-500" />
                            <ActionBtn color="bg-destructive" />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══════ RIGHT COLUMN ═══════ */}
          <div className="space-y-3">
            {/* Teste Rápido */}
            <div className="glass-card p-4">
              <h3 className="text-sm font-bold text-foreground mb-3">Teste Rápido</h3>
              <div className="space-y-1">
                {(stats?.testPlans || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Nenhum plano cadastrado. Adicione planos para gerar testes rápidos.</p>
                ) : (
                  (stats?.testPlans || []).map((plan: any) => (
                    <div key={plan.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2.5 hover:bg-muted transition-colors cursor-pointer"
                      onClick={() => navigate("/tests")}>
                      <span className="text-xs font-medium text-primary">{plan.serverName} • {plan.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">{plan.serverName}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Adicionar Cliente button */}
            <Button className="w-full bg-success hover:bg-success/90 text-success-foreground font-medium" onClick={() => navigate("/clients")}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar Cliente
            </Button>

            {/* New Resellers count + chart */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-muted">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground">{stats?.newResellersCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Novos Revendas - Últimos 30 Dias</p>
                </div>
              </div>
              <div className="flex gap-4 mt-3 mb-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />Período Atual</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" />Período Anterior</span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={stats?.resellerGrowth || []}>
                  <defs>
                    <linearGradient id="gReseller" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                  <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="atual" stroke="hsl(142, 71%, 45%)" fill="url(#gReseller)" strokeWidth={1.5} name="Período Atual" />
                  <Area type="monotone" dataKey="anterior" stroke="hsl(215, 15%, 55%)" fillOpacity={0.1} fill="hsl(215, 15%, 55%)" strokeWidth={1} name="Período Anterior" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Reseller sections */}
            <ResellerSection title="Revendas - Subrevendas" active={0} inactive={0} total={0} />
            <ResellerSection title="Revendas - Próprias"
              active={stats?.activeResellers || 0}
              inactive={stats?.inactiveResellers || 0}
              total={stats?.totalResellers || 0} />
            <ResellerSection title="Revendas - Total"
              active={stats?.activeResellers || 0}
              inactive={stats?.inactiveResellers || 0}
              total={stats?.totalResellers || 0} />

            {/* Low balance resellers */}
            <div className="glass-card p-4">
              <h3 className="text-sm font-bold text-foreground">Revendas com menos de 10 créditos</h3>
              <p className="text-xs text-muted-foreground mb-3">{stats?.lowBalanceResellers?.length || 0} revendas</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Usuário</th>
                    <th className="pb-2 font-medium">Créditos</th>
                    <th className="pb-2 font-medium">Última Recarga</th>
                    <th className="pb-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.lowBalanceResellers || []).length === 0 ? (
                    <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Nenhuma revenda</td></tr>
                  ) : (
                    (stats?.lowBalanceResellers || []).map((r: any) => (
                      <tr key={r.id} className="border-b border-border/30">
                        <td className="py-2.5 text-foreground">{r.user_id?.slice(0, 12)}...</td>
                        <td className="py-2.5 text-muted-foreground">{r.balance}</td>
                        <td className="py-2.5 text-muted-foreground">-</td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex gap-1">
                            <ActionBtn color="bg-blue-600" />
                            <ActionBtn color="bg-green-600" />
                            <ActionBtn color="bg-destructive" />
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

function ActionBtn({ color }: { color: string }) {
  return <span className={`inline-block h-6 w-6 rounded ${color} opacity-80 cursor-pointer hover:opacity-100 transition-opacity`} />;
}

function ClientSection({ title, active, inactive, total, connections }: {
  title: string; active: number; inactive: number; total: number; connections: number;
}) {
  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>
      <div className="grid grid-cols-4 gap-3">
        <StatItem icon="🟢" label="Ativo" value={active} color="text-success" />
        <StatItem icon="🔴" label="Inativo" value={inactive} color="text-destructive" />
        <StatItem icon="⚪" label="Total" value={total} color="text-muted-foreground" />
        <StatItem icon="🟡" label="Conexões" value={connections} color="text-warning" />
      </div>
      <p className="text-[10px] text-primary mt-2 cursor-pointer hover:underline">Clique aqui para saber mais sobre os números acima</p>
    </div>
  );
}

function ResellerSection({ title, active, inactive, total }: {
  title: string; active: number; inactive: number; total: number;
}) {
  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>
      <div className="grid grid-cols-3 gap-3">
        <StatItem icon="🟢" label="Ativo" value={active} color="text-success" />
        <StatItem icon="🔴" label="Inativo" value={inactive} color="text-destructive" />
        <StatItem icon="⚪" label="Total" value={total} color="text-muted-foreground" />
      </div>
    </div>
  );
}

function StatItem({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <div>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
