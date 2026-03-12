import {
  LayoutDashboard, Server, Users, UserPlus, CreditCard, Wifi, ScrollText, Settings, LogOut,
  DollarSign, BarChart3, Tag
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import xsyncLogo from "@/assets/xsync-logo.png";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "reseller", "reseller_master", "reseller_ultra", "client"] },
  { title: "Servidores", url: "/servers", icon: Server, roles: ["admin"] },
  { title: "Clientes", url: "/clients", icon: Users, roles: ["admin", "reseller", "reseller_master", "reseller_ultra"] },
  { title: "Revendedores", url: "/resellers", icon: UserPlus, roles: ["admin", "reseller_master", "reseller_ultra"] },
  { title: "Planos", url: "/plans", icon: CreditCard, roles: ["admin"] },
  { title: "Conexões", url: "/connections", icon: Wifi, roles: ["admin", "reseller", "reseller_master", "reseller_ultra"] },
];

const financeItems = [
  { title: "Créditos", url: "/credits", icon: DollarSign, roles: ["admin", "reseller", "reseller_master", "reseller_ultra"] },
  { title: "Cupons", url: "/coupons", icon: Tag, roles: ["admin", "reseller", "reseller_master", "reseller_ultra"] },
  { title: "Relatórios", url: "/reports", icon: BarChart3, roles: ["admin", "reseller", "reseller_master", "reseller_ultra"] },
];

const systemItems = [
  { title: "Logs", url: "/logs", icon: ScrollText, roles: ["admin"] },
  { title: "Configurações", url: "/settings", icon: Settings, roles: ["admin"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, role } = useAuth();

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
              activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="text-sm">{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <img src={xsyncLogo} alt="xSync" className="w-8 h-8" />
        {!collapsed && (
          <div>
            <h1 className="text-lg font-bold text-sidebar-accent-foreground">xSync</h1>
            <p className="text-[10px] text-sidebar-foreground uppercase tracking-widest">Panel</p>
          </div>
        )}
      </div>
      <SidebarContent className="pt-2">
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider px-3">Principal</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(filteredMain)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {filteredFinance.length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider px-3">Financeiro</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(filteredFinance)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredSystem.length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider px-3">Sistema</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(filteredSystem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 text-sidebar-foreground hover:text-destructive transition-colors text-sm w-full rounded-lg hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
