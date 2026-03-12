import { Users, UserPlus, Server, Wifi, Monitor, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Layout } from "@/components/Layout";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const clientGrowth = [
  { name: "Jan", value: 120 }, { name: "Fev", value: 180 }, { name: "Mar", value: 250 },
  { name: "Abr", value: 310 }, { name: "Mai", value: 420 }, { name: "Jun", value: 580 },
  { name: "Jul", value: 690 },
];

const connectionsByDay = [
  { name: "Seg", connections: 820 }, { name: "Ter", connections: 932 }, { name: "Qua", connections: 1101 },
  { name: "Qui", connections: 1034 }, { name: "Sex", connections: 1290 }, { name: "Sáb", connections: 1430 },
  { name: "Dom", connections: 1520 },
];

const serverConsumption = [
  { name: "Srv 1", usage: 78 }, { name: "Srv 2", usage: 45 }, { name: "Srv 3", usage: 92 },
  { name: "Srv 4", usage: 34 }, { name: "Srv 5", usage: 67 },
];

const chartStyle = { fontSize: 11, fill: "hsl(215, 15%, 55%)" };

export default function Dashboard() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral do sistema xSync Panel</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard title="Clientes" value="1.247" change="+12% este mês" changeType="positive" icon={Users} />
          <StatCard title="Revendedores" value="38" change="+3 novos" changeType="positive" icon={UserPlus} />
          <StatCard title="Conexões Ativas" value="892" change="67% capacidade" changeType="neutral" icon={Wifi} />
          <StatCard title="Linhas IPTV" value="2.461" change="+89 hoje" changeType="positive" icon={Monitor} />
          <StatCard title="Servidores" value="5" change="4 online" changeType="positive" icon={Server} />
          <StatCard title="Consumo" value="73%" change="+5% vs ontem" changeType="negative" icon={TrendingUp} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Crescimento de Clientes</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={clientGrowth}>
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
            <h3 className="text-sm font-semibold text-foreground mb-4">Conexões por Dia</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={connectionsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
                <XAxis dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} />
                <YAxis tick={chartStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(222, 22%, 9%)", border: "1px solid hsl(222, 20%, 15%)", borderRadius: "8px", fontSize: 12 }} />
                <Bar dataKey="connections" fill="hsl(187, 85%, 53%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Consumo por Servidor</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={serverConsumption} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 15%)" />
              <XAxis type="number" tick={chartStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
              <YAxis type="category" dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} width={60} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(222, 22%, 9%)", border: "1px solid hsl(222, 20%, 15%)", borderRadius: "8px", fontSize: 12 }} />
              <Bar dataKey="usage" fill="hsl(187, 85%, 53%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Layout>
  );
}
