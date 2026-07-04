import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  ClipboardList,
  Stethoscope,
  AlertTriangle,
  Building2,
  CreditCard,
  Users,
  History,
  BarChart3,
  FileText,
  Wallet,
  LogOut,
  Loader2,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  KeyRound,
  Receipt,
  Menu,
  X,
} from "lucide-react";
import logoAsset from "@/assets/logo-kronhardt.png.asset.json";
import { useEffect, useState, type ReactNode } from "react";

const SUPER_ADMIN_EMAIL = "upsecretarial@gmail.com";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}


interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Visão geral",
    items: [
      { to: "/", label: "Painel", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operação",
    items: [
      { to: "/atendimentos", label: "Novo Atendimento", icon: ClipboardList },
      { to: "/pendencias", label: "Pendências", icon: AlertTriangle },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { to: "/notas-fiscais", label: "Notas Fiscais", icon: FileText },
      { to: "/recebimentos", label: "Recebimentos", icon: Wallet },
      { to: "/contas-pagar", label: "Contas a Pagar", icon: Receipt },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
      { to: "/formas-pagamento", label: "Formas de Pagamento", icon: CreditCard, adminOnly: true },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { to: "/clinicas", label: "Clínicas", icon: Building2, adminOnly: true },
      { to: "/servicos", label: "Serviços", icon: Stethoscope },
      { to: "/usuarios", label: "Usuários", icon: Users, superAdminOnly: true },
    ],
  },
  {
    label: "Administração",
    items: [
      { to: "/auditoria", label: "Histórico", icon: History },
      { to: "/lixeira", label: "Lixeira", icon: Trash2, adminOnly: true },
      { to: "/links-acesso", label: "Links de Acesso", icon: KeyRound, superAdminOnly: true },
    ],
  },
];


export function AppShell({ children }: { children: ReactNode }) {
  const { loading, user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar-collapsed") === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  const isSuperAdmin = (user?.email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL;

  const currentTitle =
    NAV_GROUPS.flatMap((g) => g.items).find(
      (i) => path === i.to || (i.to !== "/" && path.startsWith(i.to)),
    )?.label ?? "";

  const SidebarInner = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      <div
        className={cn(
          "flex flex-col items-center gap-2 px-3 py-6 text-center",
          collapsed && !isMobile && "px-2 py-4",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center",
            collapsed && !isMobile ? "h-10 w-10" : "h-20 w-20",
          )}
        >
          <img
            src={logoAsset.url}
            alt="Dra. Gabriela Kronhardt"
            className="h-full w-full object-contain"
          />
        </div>
        {(!collapsed || isMobile) && (
          <div className="leading-tight">
            <div className="text-sm font-semibold text-sidebar-foreground">Dra. Gabriela</div>
            <div className="text-xs text-muted-foreground">Controle Financeiro</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((n) => {
            if (n.superAdminOnly && !isSuperAdmin) return false;
            if (n.adminOnly && !isAdmin) return false;
            return true;
          });
          if (!items.length) return null;
          return (
            <div key={group.label} className="space-y-0.5">
              {(!collapsed || isMobile) && (
                <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                  {group.label}
                </div>
              )}
              {items.map((item) => {
                const active = path === item.to || (item.to !== "/" && path.startsWith(item.to));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    title={collapsed && !isMobile ? item.label : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
                      collapsed && !isMobile && "justify-center px-2",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-sidebar-primary transition-opacity",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        active ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground",
                      )}
                    />
                    {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {(!collapsed || isMobile) && (
          <div className="mb-2 px-2 text-xs">
            <div className="truncate font-medium text-sidebar-foreground">{user?.email}</div>
            <div className="text-muted-foreground">{isAdmin ? "Administrador" : "Veterinária"}</div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn("w-full", collapsed && !isMobile ? "justify-center px-0" : "justify-start")}
          onClick={handleSignOut}
          title={collapsed && !isMobile ? "Sair" : undefined}
        >
          <LogOut className={cn("h-4 w-4", (!collapsed || isMobile) && "mr-2")} />
          {(!collapsed || isMobile) && "Sair"}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
          className="absolute -right-3 top-6 z-10 grid h-6 w-6 place-items-center rounded-full border border-sidebar-border bg-background text-muted-foreground shadow-xs transition-colors hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
        <SidebarInner />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-sidebar-border bg-sidebar shadow-lg">
            <div className="flex items-center justify-end px-3 pt-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarInner isMobile />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/85 px-4 backdrop-blur-md md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {currentTitle || "Painel"}
            </div>
          </div>
          <div className="hidden text-xs text-muted-foreground sm:block">
            {user?.email}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
