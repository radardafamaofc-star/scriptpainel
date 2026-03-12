import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useBranding } from "@/hooks/use-branding";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const { data: branding } = useBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast.error("Erro ao entrar", { description: error.message });
    } else {
      navigate("/");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden p-4">
      {/* Ambient glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-sm relative z-10 flex flex-col items-center">
        {/* Logo */}
        {branding?.logo_url && (
          <div className="mb-2">
            <img
              src={branding.logo_url}
              alt="Logo"
              className="w-28 h-28 sm:w-36 sm:h-36 object-contain drop-shadow-[0_0_30px_hsl(var(--primary)/0.3)]"
            />
          </div>
        )}

        {/* Panel name */}
        {branding?.panel_name && (
          <h1 className="text-xl font-bold text-foreground mb-6 tracking-tight">
            {branding.panel_name}
          </h1>
        )}

        {/* Card */}
        <div className="w-full rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl shadow-black/20 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                required
                className="bg-secondary/50 border-border/50 text-foreground h-11 rounded-xl focus:border-primary/50 focus:ring-primary/20 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Senha</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="bg-secondary/50 border-border/50 text-foreground h-11 rounded-xl pr-10 focus:border-primary/50 focus:ring-primary/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-sm shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.99]"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" /> Entrar
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="text-[11px] text-muted-foreground/40 mt-6 text-center">
          Acesso restrito a usuários autorizados
        </p>
      </div>
    </div>
  );
}
