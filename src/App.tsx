import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Servers from "./pages/Servers";
import Clients from "./pages/Clients";
import Resellers from "./pages/Resellers";
import Plans from "./pages/Plans";
import Connections from "./pages/Connections";
import Credits from "./pages/Credits";
import Coupons from "./pages/Coupons";
import Reports from "./pages/Reports";
import Logs from "./pages/Logs";
import SettingsPage from "./pages/SettingsPage";
import Estilo from "./pages/Estilo";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <div className="dark">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/servers" element={<ProtectedRoute allowedRoles={["admin"]}><Servers /></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute allowedRoles={["admin", "reseller", "reseller_master", "reseller_ultra"]}><Clients /></ProtectedRoute>} />
              <Route path="/resellers" element={<ProtectedRoute allowedRoles={["admin", "reseller_master", "reseller_ultra"]}><Resellers /></ProtectedRoute>} />
              <Route path="/plans" element={<ProtectedRoute allowedRoles={["admin"]}><Plans /></ProtectedRoute>} />
              <Route path="/connections" element={<ProtectedRoute allowedRoles={["admin", "reseller", "reseller_master", "reseller_ultra"]}><Connections /></ProtectedRoute>} />
              <Route path="/credits" element={<ProtectedRoute allowedRoles={["admin", "reseller", "reseller_master", "reseller_ultra"]}><Credits /></ProtectedRoute>} />
              <Route path="/coupons" element={<ProtectedRoute allowedRoles={["admin", "reseller", "reseller_master", "reseller_ultra"]}><Coupons /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin", "reseller", "reseller_master", "reseller_ultra"]}><Reports /></ProtectedRoute>} />
              <Route path="/logs" element={<ProtectedRoute allowedRoles={["admin"]}><Logs /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin"]}><SettingsPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
