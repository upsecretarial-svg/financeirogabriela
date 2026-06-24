import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  Building2,
  CreditCard,
  Users,
  History,
  BarChart3,
  LogOut,
  Loader2,
  Trash2,
} from "lucide-react";
import logoAsset from "@/assets/logo-kronhardt.png.asset.json";
import type { ReactNode } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/atendimentos", label: "Atendimentos", icon: ClipboardList },
  { to: "/pendencias", label: "Pendências", icon: AlertTriangle },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/clinicas", label: "Clínicas", icon: Building2, adminOnly: true },
  { to: "/formas-pagamento", label: "Formas de Pagamento", icon: CreditCard, adminOnly: true },
  { to: "/usuarios", label: "Usuários", icon: Users, adminOnly: true },
  { to: "/auditoria", label: "Histórico", icon: History },
  { to: "/lixeira", label: "Lixeira", icon: Trash2, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
          <div className="flex h-24 w-24 items-center justify-center">
            <img src={logoAsset.url} alt="Dra. Gabriela Kronhardt" className="h-full w-full object-contain" />
          </div>

          <div className="leading-tight">
            <div className="text-sm font-semibold text-sidebar-foreground">Dra. Gabriela</div>
            <div className="text-xs text-muted-foreground">Controle Financeiro</div>
          </div>
        </div>


        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
            const active = path === item.to || (item.to !== "/" && path.startsWith(item.to));
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-2 text-xs">
            <div className="truncate font-medium text-sidebar-foreground">{user?.email}</div>
            <div className="text-muted-foreground">{isAdmin ? "Administrador" : "Veterinária"}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
