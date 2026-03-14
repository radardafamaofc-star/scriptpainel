import {
  LayoutDashboard, Server, Users, UserPlus, CreditCard, Wifi, ScrollText, Settings, LogOut,
  DollarSign, BarChart3, Tag, Palette, Sun, Moon, Megaphone } from
"lucide-react";
import { useTheme } from "next-themes";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/hooks/use-branding";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar } from
"@/components/ui/sidebar";

const mainItems = [
{ title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "reseller", "reseller_master", "reseller_ultra", "client"] },
{ title: "Servidores", url: "/servers", icon: Server, roles: ["admin"] },
{ title: "Clientes", url: "/clients", icon: Users, roles: ["admin", "reseller", "reseller_master", "reseller_ultra"] },
{ title: "Revendedores", url: "/resellers", icon: UserPlus, roles: ["admin", "reseller_master", "reseller_ultra"] },
{ title: "Planos", url: "/plans", icon: CreditCard, roles: ["admin"] },
{ title: "Conexões", url: "/connections", icon: Wifi, roles: ["admin", "reseller", "reseller_master", "reseller_ultra"] }];


const financeItems = [
{ title: "Créditos", url: "/credits", icon: DollarSign, roles: ["admin", "reseller", "reseller_master", "reseller_ultra"] },
{ title: "Cupons", url: "/coupons", icon: Tag, roles: ["admin", "reseller", "reseller_master", "reseller_ultra"] },
{ title: "Relatórios", url: "/reports", icon: BarChart3, roles: ["admin", "reseller", "reseller_master", "reseller_ultra"] }];


const systemItems = [
{ title: "Logs", url: "/logs", icon: ScrollText, roles: ["admin"] },
{ title: "Estilo", url: "/estilo", icon: Palette, roles: ["admin"] },
{ title: "Configurações", url: "/settings", icon: Settings, roles: ["admin"] }];


export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, role, user, loading } = useAuth();
  const { theme, setTheme } = useTheme();

  const { data: branding } = useBranding();

  const logoSrc = branding?.logo_url || null;
  const panelName = branding?.panel_name || "";

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuário";

  const { data: myBalance = 0 } = useQuery({
    queryKey: ["my-reseller-balance", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data } = await supabase.
      from("resellers").
      select("balance").
      eq("user_id", user.id).
      maybeSingle();
      return Number(data?.balance || 0);
    },
    enabled: !!user && !loading && role !== "admin" && role !== "reseller_ultra",
    staleTime: 30000
  });

  const creditsLabel = loading ?
  "Carregando créditos..." :
  role === "admin" || role === "reseller_ultra" ?
  "∞ créditos ilimitados" :
  `${myBalance.toLocaleString("pt-BR")} créditos`;

  const filterByRole = (items: typeof mainItems) =>
  items.filter((item) => !role || item.roles.includes(role));

  const filteredMain = filterByRole(mainItems);
  const filteredFinance = filterByRole(financeItems);
  const filteredSystem = filterByRole(systemItems);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const renderItems = (items: typeof mainItems) =>
  items.map((item) => {
    const active = location.pathname === item.url;
    return (
      <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild>
            <NavLink
            to={item.url}
            end
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
            
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="text-sm">{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>);

  });

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {(logoSrc || panelName) && (
        <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
          {logoSrc && <img src={logoSrc} alt={panelName || "Painel"} className="w-12 h-12 object-contain" />}
          {!collapsed && panelName && (
            <h1 className="text-lg font-bold text-sidebar-accent-foreground">{panelName}</h1>
          )}
        </div>
      )}

      {!collapsed && user &&
      <div className="px-4 py-3 border-b border-sidebar-border">
          <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{displayName}</p>
          <p className="text-xs mt-0.5 text-white">{creditsLabel}</p>
        </div>
      }

      <SidebarContent className="pt-2">
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider px-3">Principal</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(filteredMain)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {filteredFinance.length > 0 &&
        <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider px-3">Financeiro</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(filteredFinance)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        }

        {filteredSystem.length > 0 &&
        <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider px-3">Sistema</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(filteredSystem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        }
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3 space-y-1">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center gap-3 px-3 py-2 text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors text-sm w-full rounded-lg hover:bg-sidebar-accent">
          {theme === "dark" ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          {!collapsed && <span>{theme === "dark" ? "Modo Claro" : "Modo Escuro"}</span>}
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 text-sidebar-foreground hover:text-destructive transition-colors text-sm w-full rounded-lg hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </SidebarFooter>
    </Sidebar>);

}