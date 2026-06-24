import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapAdmin } from "@/lib/admin.functions";
import { logLoginEvent } from "@/lib/log-login-event";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logoAsset from "@/assets/logo-kronhardt.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Sistema Financeiro" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const runBootstrap = useServerFn(bootstrapAdmin);

  useEffect(() => {
    supabase.rpc("has_any_admin").then(({ data }) => {
      const exists = data === true;
      setHasAdmin(exists);
      setMode(exists ? "login" : "bootstrap");
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Falha no login", { description: error.message });
      return;
    }
    await logLoginEvent("login");
    toast.success("Bem-vinda!");
    navigate({ to: "/" });
  };

  const handleRecover = async () => {
    if (!email) {
      toast.error("Digite seu e-mail no campo acima.");
      return;
    }
    setRecovering(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setRecovering(false);
    if (error) {
      toast.error("Não foi possível enviar", { description: error.message });
      return;
    }
    toast.success("E-mail enviado!", {
      description: "Verifique sua caixa de entrada para redefinir a senha.",
    });
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setGoogleLoading(false);
      toast.error("Falha no login com Google", { description: (result.error as Error).message });
      return;
    }
    if (result.redirected) return;
    await logLoginEvent("login");
    setGoogleLoading(false);
    navigate({ to: "/" });
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await runBootstrap({ data: { email, password, nome } });
      toast.success("Administrador criado. Fazendo login...");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await logLoginEvent("bootstrap");
      navigate({ to: "/" });
    } catch (err) {
      toast.error("Erro", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  if (hasAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-secondary to-accent/40 px-4">
      <Card className="w-full max-w-md border-border/60 shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-32 w-32 items-center justify-center">
            <img src={logoAsset.url} alt="Dra. Gabriela Kronhardt — Medicina Veterinária" className="h-full w-full object-contain" />
          </div>

          <CardTitle className="text-2xl">
            {mode === "bootstrap" ? "Criar administrador" : "Sistema Financeiro"}
          </CardTitle>
          <CardDescription>
            {mode === "bootstrap"
              ? "Cadastre a primeira conta de administrador do sistema."
              : "Dra. Gabriela Kronhardt — Medicina Veterinária"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={mode === "bootstrap" ? handleBootstrap : handleLogin} className="space-y-4">
            {mode === "bootstrap" && (
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "bootstrap" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "bootstrap" ? "Criar e entrar" : "Entrar"}
            </Button>
            {mode === "login" && (
              <Button
                type="button"
                variant="link"
                className="w-full text-sm"
                onClick={handleRecover}
                disabled={recovering}
              >
                {recovering ? "Enviando…" : "Esqueci minha senha"}
              </Button>
            )}
            {mode === "login" && (
              <>
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogle}
                  disabled={googleLoading}
                >
                  {googleLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
                    </svg>
                  )}
                  Entrar com Google
                </Button>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
