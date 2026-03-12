import {
  LayoutDashboard, Server, Users, UserPlus, CreditCard, Wifi, ScrollText, Settings, LogOut
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import xsyncLogo from "@/assets/xsync-logo.png";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Servidores", url: "/servers", icon: Server },
  { title: "Clientes", url: "/clients", icon: Users },
  { title: "Revendedores", url: "/resellers", icon: UserPlus },
  { title: "Planos", url: "/plans", icon: CreditCard },
  { title: "Conexões", url: "/connections", icon: Wifi },
  { title: "Logs", url: "/logs", icon: ScrollText },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

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
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
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
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <button className="flex items-center gap-3 px-3 py-2 text-sidebar-foreground hover:text-destructive transition-colors text-sm w-full rounded-lg hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
