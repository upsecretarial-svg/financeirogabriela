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
  Sparkles,
} from "lucide-react";
import logoAsset from "@/assets/logo-kronhardt.png.asset.json";
import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/theme-toggle";

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
    items: [{ to: "/", label: "Painel", icon: LayoutDashboard }],
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
      { to: "/painel-contas", label: "Painel de Contas", icon: BarChart3 },
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCollapsed(window.localStorage.getItem("sidebar-collapsed") === "1");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
          <Loader2 className="relative h-8 w-8 animate-spin text-primary" />
        </div>
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
          "flex flex-col items-center gap-3 px-3 py-6 text-center",
          collapsed && !isMobile && "px-2 py-4",
        )}
      >
        <div className="relative">
          <div
            className={cn(
              "absolute inset-0 rounded-full bg-primary/30 blur-xl",
              collapsed && !isMobile ? "h-10 w-10" : "h-20 w-20",
            )}
          />
          <div
            className={cn(
              "relative flex items-center justify-center rounded-full ring-1 ring-white/10",
              collapsed && !isMobile ? "h-10 w-10" : "h-20 w-20",
            )}
          >
            <img
              src={logoAsset.url}
              alt="Dra. Gabriela Kronhardt"
              className="h-full w-full rounded-full object-contain"
            />
          </div>
        </div>
        {(!collapsed || isMobile) && (
          <div className="leading-tight">
            <div className="text-sm font-bold text-gradient-primary" style={{ fontFamily: "Urbanist" }}>
              Dra. Gabriela
            </div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Controle Financeiro
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((n) => {
            if (n.superAdminOnly && !isSuperAdmin) return false;
            if (n.adminOnly && !isAdmin) return false;
            return true;
          });
          if (!items.length) return null;
          return (
            <div key={group.label} className="space-y-1">
              {(!collapsed || isMobile) && (
                <div className="px-3 pb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60">
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
                      "group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      collapsed && !isMobile && "justify-center px-2",
                      active
                        ? "text-white"
                        : "text-sidebar-foreground/70 hover:text-white",
                    )}
                  >
                    {active && (
                      <motion.div
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/40 via-primary/25 to-transparent ring-1 ring-primary/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-0 -z-10 rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100",
                        !active && "bg-white/[0.04]",
                      )}
                    />
                    <Icon
                      className={cn(
                        "relative h-4 w-4 shrink-0 transition-all duration-200",
                        active ? "text-primary-foreground drop-shadow-[0_0_8px_rgba(129,140,248,0.9)]" : "text-muted-foreground group-hover:text-primary",
                      )}
                    />
                    {(!collapsed || isMobile) && <span className="relative truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-3">
        {(!collapsed || isMobile) && (
          <div className="mb-3 rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
            <div className="truncate text-xs font-semibold text-sidebar-foreground">{user?.email}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
              <Sparkles className="h-2.5 w-2.5" />
              {isSuperAdmin ? "Super Admin" : isAdmin ? "Administrador" : "Veterinária"}
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full text-sidebar-foreground/70 hover:bg-destructive/15 hover:text-destructive",
            collapsed && !isMobile ? "justify-center px-0" : "justify-start",
          )}
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
    <div className="relative flex min-h-screen">
      {/* Ambient orbs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="floating-orb left-[-8%] top-[-6%] h-[380px] w-[380px] bg-primary/30" />
        <div className="floating-orb right-[-10%] top-[30%] h-[420px] w-[420px] bg-[#6d28d9]/25" style={{ animationDelay: "3s" }} />
        <div className="floating-orb bottom-[-10%] left-[30%] h-[500px] w-[500px] bg-[#312e81]/40" style={{ animationDelay: "6s" }} />
        <div className="absolute inset-0 bg-grid-lines opacity-40" />
      </div>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative hidden flex-col border-r border-white/5 bg-sidebar/70 backdrop-blur-2xl transition-[width] duration-300 md:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
          className="absolute -right-3 top-8 z-10 grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-card text-muted-foreground shadow-lg transition-all hover:scale-110 hover:text-primary"
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
        <SidebarInner />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <motion.aside
              className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-white/10 bg-sidebar/95 backdrop-blur-2xl shadow-2xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
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
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/5 bg-background/40 px-4 backdrop-blur-2xl md:px-8">
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
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Online
              </span>
            </div>
            <div className="truncate text-sm font-bold text-white" style={{ fontFamily: "Urbanist" }}>
              {currentTitle || "Painel"}
            </div>
          </div>
          <ThemeToggle />
          <div className="hidden text-xs text-muted-foreground sm:block">{user?.email}</div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={path}
            className="mx-auto w-full max-w-[88rem] px-4 py-6 md:px-8 md:py-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
