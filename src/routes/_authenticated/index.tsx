import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  TrendingUp,
  Wallet,
  Clock,
  ClipboardCheck,
  Target,
  Trophy,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Card3D } from "@/components/card-3d";
import { cn } from "@/lib/utils";

const ALERT_DAYS = 7;

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Sistema Financeiro" }] }),
  component: Dashboard,
});

function brl(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Dashboard() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", selectedMonth],
    queryFn: async () => {
      const [y, m] = selectedMonth.split("-").map(Number);
      const startMes = new Date(y, m - 1, 1);
      const endMes = new Date(y, m, 0, 23, 59, 59, 999);
      
      const startPrev = new Date(y, m - 2, 1);
      const endPrev = new Date(y, m - 1, 0, 23, 59, 59, 999);

      const inicio = startMes.toISOString().slice(0, 10);
      const fim = endMes.toISOString().slice(0, 10);
      const inicioPrev = startPrev.toISOString().slice(0, 10);
      const fimPrev = endPrev.toISOString().slice(0, 10);

      const { data: mes } = await supabase
        .from("appointments")
        .select("valor, valor_recebido, pago, nf_emitida")
        .is("deleted_at", null)
        .gte("data_atendimento", inicio)
        .lte("data_atendimento", fim);

      const { data: prev } = await supabase
        .from("appointments")
        .select("valor, valor_recebido")
        .is("deleted_at", null)
        .gte("data_atendimento", inicioPrev)
        .lte("data_atendimento", fimPrev);

      const { count: pendCount } = await supabase
        .from("pendencias_view")
        .select("*", { count: "exact", head: true });

      const faturado = (mes ?? []).reduce((s, a) => s + Number(a.valor ?? 0), 0);
      const recebido = (mes ?? []).reduce((s, a) => s + Number(a.valor_recebido ?? 0), 0);
      
      const faturadoPrev = (prev ?? []).reduce((s, a) => s + Number(a.valor ?? 0), 0);
      const recebidoPrev = (prev ?? []).reduce((s, a) => s + Number(a.valor_recebido ?? 0), 0);

      const calcVar = (curr: number, old: number) => {
        if (old === 0) return { pct: curr > 0 ? 100 : 0, abs: curr };
        return {
          pct: ((curr - old) / old) * 100,
          abs: curr - old,
        };
      };

      const varFat = calcVar(faturado, faturadoPrev);
      const varRec = calcVar(recebido, recebidoPrev);

      return {
        faturado,
        recebido,
        pendente: faturado - recebido,
        qtd: mes?.length ?? 0,
        nfPendentes: (mes ?? []).filter((a) => !a.nf_emitida).length,
        pendencias: pendCount ?? 0,
        varFaturado: varFat.pct,
        absFaturado: varFat.abs,
        varRecebido: varRec.pct,
        absRecebido: varRec.abs,
      };
    },
  });

  const { data: contasVencendo } = useQuery({
    queryKey: ["payables-alert"],
    queryFn: async () => {
      const hoje = new Date();
      const limite = new Date();
      limite.setDate(hoje.getDate() + ALERT_DAYS);
      const { data } = await supabase
        .from("payables")
        .select("id, fornecedor, valor, data_vencimento, status")
        .is("deleted_at", null)
        .in("status", ["pendente", "vencido", "agendado"])
        .lte("data_vencimento", limite.toISOString().slice(0, 10))
        .order("data_vencimento", { ascending: true })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: chart } = useQuery({
    queryKey: ["dashboard-chart"],
    queryFn: async () => {
      const start = new Date();
      start.setMonth(start.getMonth() - 5);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("appointments")
        .select("data_atendimento, valor, valor_recebido")
        .is("deleted_at", null)
        .gte("data_atendimento", start.toISOString().slice(0, 10));
      const buckets: Record<string, { mes: string; faturado: number; recebido: number }> = {};
      for (let i = 0; i < 6; i++) {
        const d = new Date(start);
        d.setMonth(start.getMonth() + i);
        const key = d.toISOString().slice(0, 7);
        buckets[key] = {
          mes: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
          faturado: 0,
          recebido: 0,
        };
      }
      (data ?? []).forEach((a) => {
        const key = (a.data_atendimento as string).slice(0, 7);
        if (buckets[key]) {
          buckets[key].faturado += Number(a.valor ?? 0);
          buckets[key].recebido += Number(a.valor_recebido ?? 0);
        }
      });
      return Object.values(buckets);
    },
  });

  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [metaDraft, setMetaDraft] = useState<string>("");
  const [notified, setNotified] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("meta_mensal").maybeSingle();
      return data;
    },
  });

  const meta = Number(settings?.meta_mensal ?? 0);
  const recebido = stats?.recebido ?? 0;
  const progresso = meta > 0 ? Math.min(100, (recebido / meta) * 100) : 0;
  const metaAtingida = meta > 0 && recebido >= meta;

  useEffect(() => {
    if (!metaAtingida) return;
    const key = `meta-notif-${new Date().toISOString().slice(0, 7)}`;
    if (sessionStorage.getItem(key) || notified) return;
    sessionStorage.setItem(key, "1");
    setNotified(true);
    toast.success("🎉 Meta mensal atingida!", {
      description: `Você recebeu ${brl(recebido)} este mês.`,
      duration: 6000,
    });
  }, [metaAtingida, recebido, notified]);

  const saveMeta = useMutation({
    mutationFn: async (valor: number) => {
      const { error } = await supabase
        .from("app_settings")
        .update({ meta_mensal: valor, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Meta atualizada.");
      setMetaDraft("");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const now = new Date();
  const mesAtual = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const kpis: {
    label: string;
    value: string;
    icon: any;
    tone: "primary" | "success" | "warning" | "destructive";
    sub: string;
    gradient: string;
    variation?: number;
    absVariation?: number;
  }[] = [
    { label: "Faturado", value: brl(stats?.faturado), icon: TrendingUp, tone: "primary", sub: `${stats?.qtd ?? 0} atendimentos`, gradient: "from-indigo-500/30 to-blue-500/10", variation: stats?.varFaturado, absVariation: stats?.absFaturado },
    { label: "Recebido", value: brl(stats?.recebido), icon: Wallet, tone: "success", sub: stats?.faturado ? `${Math.round(((stats?.recebido ?? 0) / stats.faturado) * 100)}% do faturado` : "—", gradient: "from-emerald-500/30 to-teal-500/10", variation: stats?.varRecebido, absVariation: stats?.absRecebido },
    { label: "Em aberto", value: brl(stats?.pendente), icon: Clock, tone: "warning", sub: `${stats?.nfPendentes ?? 0} NF pendentes`, gradient: "from-amber-500/25 to-orange-500/10" },
    
  ];

  const maxBar = Math.max(1, ...((chart ?? []).flatMap((c) => [c.faturado, c.recebido])));

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card/50 p-8 backdrop-blur-xl dark:border-white/10 dark:bg-gradient-to-br dark:from-indigo-950/60 dark:via-[#141432]/70 dark:to-[#0a0a1a]/40"
      >
        <div className="absolute inset-0 bg-grid-lines opacity-50" />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[#7c3aed]/30 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
              <Sparkles className="h-3 w-3" />
              Painel Executivo
            </div>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white md:text-5xl" style={{ fontFamily: "Urbanist" }}>
              Performance Financeira
            </h1>
            <div className="mt-2 flex items-center gap-3">
              <p className="text-sm font-bold capitalize text-muted-foreground">{mesAtual}</p>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-10 w-44 border-border bg-background/50 text-sm font-bold text-foreground"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-background/30 px-4 py-2 text-xs text-muted-foreground backdrop-blur dark:border-white/10 dark:bg-white/[0.03]">
            <Zap className="h-3.5 w-3.5 text-primary" />
            Sistema atualizado em tempo real
          </div>
        </div>
      </motion.header>

      {contasVencendo && contasVencendo.length > 0 && <PayablesAlert rows={contasVencendo} />}

      {/* KPIs bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpis.map((c, i) => {
          const Icon = c.icon;
          const toneColor =
            c.tone === "success" ? "text-success" :
            c.tone === "warning" ? "text-warning" :
            c.tone === "destructive" ? "text-destructive" :
            "text-primary";
          return (
            <motion.div
              key={c.label}
              className="relative"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              <Card3D className="h-full">
                <div className={`absolute inset-0 bg-gradient-to-br ${c.gradient} opacity-40 dark:opacity-70`} />
                <div className="relative p-6">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/90">
                      {c.label}
                    </p>
                    <div className={`grid h-9 w-9 place-items-center rounded-xl bg-background/80 ring-1 ring-border shadow-sm ${toneColor} dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-6 flex items-baseline justify-between gap-2">
                    <p className={`number-display text-4xl font-black ${toneColor}`}>
                      {isLoading ? "—" : c.value}
                    </p>
                    {c.variation !== undefined && (
                      <div className="flex flex-col items-end">
                        <div className={cn(
                          "flex items-center gap-1 rounded-full bg-background/50 px-2 py-0.5 text-sm font-black tracking-tight shadow-sm dark:bg-white/5",
                          c.variation >= 0 ? "text-success" : "text-destructive"
                        )}>
                          {c.variation >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3 rotate-90" />}
                          {Math.abs(c.variation).toFixed(1)}%
                        </div>
                        {c.absVariation !== undefined && (
                          <div className={cn(
                            "text-xs font-bold",
                            c.absVariation >= 0 ? "text-success" : "text-destructive"
                          )}>
                            {c.absVariation >= 0 ? "+" : ""}{brl(c.absVariation)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium text-muted-foreground">{c.sub}</p>
                </div>
              </Card3D>
            </motion.div>
          );
        })}
      </div>

      {/* Gráfico + Meta bento */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div
          className="lg:col-span-8"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <Card3D intensity={4} className="h-full">
            <div className="p-6 md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                    Tendência
                  </div>
                  <h3 className="mt-1 text-xl font-bold text-foreground" style={{ fontFamily: "Urbanist" }}>
                    Faturamento × Recebido
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">Últimos 6 meses</p>
                </div>
                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-primary shadow-[0_0_10px_rgba(129,140,248,0.7)]" />
                    <span className="text-muted-foreground">Faturado</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-success shadow-[0_0_10px_rgba(74,222,128,0.7)]" />
                    <span className="text-muted-foreground">Recebido</span>
                  </div>
                </div>
              </div>
              <div className="mt-8 flex h-52 items-end justify-between gap-4">
                {(chart ?? []).map((c, idx) => {
                  const isLast = idx === (chart ?? []).length - 1;
                  const hF = Math.max(4, (c.faturado / maxBar) * 100);
                  const hR = Math.max(4, (c.recebido / maxBar) * 100);
                  return (
                    <div key={idx} className="flex flex-1 flex-col items-center gap-3">
                      <div className="flex h-40 w-full items-end justify-center gap-1.5" title={`${brl(c.faturado)} / ${brl(c.recebido)}`}>
                        <motion.div
                          className="w-3 rounded-t-md bg-gradient-to-t from-primary to-primary/50 shadow-[0_0_20px_rgba(129,140,248,0.4)]"
                          initial={{ height: 0 }}
                          animate={{ height: `${hF}%` }}
                          transition={{ delay: 0.5 + idx * 0.06, duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                          style={{ opacity: isLast ? 1 : 0.85 }}
                        />
                        <motion.div
                          className="w-3 rounded-t-md bg-gradient-to-t from-success to-success/50 shadow-[0_0_20px_rgba(74,222,128,0.4)]"
                          initial={{ height: 0 }}
                          animate={{ height: `${hR}%` }}
                          transition={{ delay: 0.55 + idx * 0.06, duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                          style={{ opacity: isLast ? 1 : 0.85 }}
                        />
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isLast ? "text-primary" : "text-muted-foreground/70"}`}>
                        {c.mes}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card3D>
        </motion.div>

        {/* Meta */}
        <motion.div
          className="lg:col-span-4"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Card3D glow className="h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-primary/15 to-transparent" />
            <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-primary/30 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between gap-6 p-6 md:p-8">
              <div className="flex items-center gap-2">
                {metaAtingida ? (
                  <Trophy className="h-4 w-4 text-warning drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                ) : (
                  <Target className="h-4 w-4 text-primary" />
                )}
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
                  Meta Mensal
                </h3>
              </div>
              <div>
                <p className="number-display text-6xl font-black tracking-tighter text-foreground">
                  {meta > 0 ? `${progresso.toFixed(0)}%` : "—"}
                </p>
                <p className="mt-2 text-xs text-white/70">
                  {meta > 0
                    ? `${brl(recebido)} de ${brl(meta)}`
                    : isAdmin
                      ? "Defina uma meta abaixo"
                      : "Nenhuma meta definida"}
                </p>
              </div>
              <div className="space-y-3">
                {meta > 0 && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/30 ring-1 ring-white/10">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-indigo-400 to-primary shadow-[0_0_12px_rgba(129,140,248,0.8)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${progresso}%` }}
                      transition={{ duration: 1, ease: [0.19, 1, 0.22, 1] }}
                    />
                  </div>
                )}
                {isAdmin && (
                  <form
                    className="flex items-center gap-2 pt-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = Number(metaDraft);
                      if (!isNaN(v) && v >= 0) saveMeta.mutate(v);
                    }}
                  >
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={meta ? brl(meta) : "Definir meta"}
                      value={metaDraft}
                      onChange={(e) => setMetaDraft(e.target.value)}
                      className="h-9 border-white/15 bg-white/5 text-xs text-white placeholder:text-white/40"
                    />
                    <Button type="submit" size="sm" disabled={!metaDraft || saveMeta.isPending} className="h-9">
                      Salvar
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </Card3D>
        </motion.div>
      </div>

      {/* Quick actions bento */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="bento-grid"
      >
        {[
          { to: "/atendimentos", label: "Novo atendimento", icon: ClipboardCheck, color: "from-indigo-500/40 to-blue-500/10" },
          { to: "/recebimentos", label: "Recebimentos", icon: Wallet, color: "from-emerald-500/40 to-teal-500/10" },
          { to: "/notas-fiscais", label: "Notas Fiscais", icon: TrendingUp, color: "from-purple-500/40 to-pink-500/10" },
          { to: "/relatorios", label: "Relatórios", icon: Target, color: "from-amber-500/40 to-orange-500/10" },
        ].map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.to} to={q.to} className="bento-quarter">
              <Card3D intensity={5} className="h-full">
                <div className={`absolute inset-0 bg-gradient-to-br ${q.color} opacity-60`} />
                <div className="relative flex items-center justify-between gap-3 p-5">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-semibold text-white">{q.label}</span>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-white/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </Card3D>
            </Link>
          );
        })}
      </motion.div>
    </div>
  );
}

type PayableAlertRow = {
  id: string;
  fornecedor: string;
  valor: number;
  data_vencimento: string;
  status: string;
};

function PayablesAlert({ rows }: { rows: PayableAlertRow[] }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidas = rows.filter((r) => r.data_vencimento < hoje);
  const proximas = rows.filter((r) => r.data_vencimento >= hoje);
  const total = rows.reduce((s, r) => s + Number(r.valor), 0);
  const fmtDate = (d: string) => d.split("-").reverse().join("/");
  const diasAte = (d: string) => {
    const diff = Math.round((new Date(d).getTime() - new Date(hoje).getTime()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)}d vencida`;
    if (diff === 0) return "vence hoje";
    if (diff === 1) return "vence amanhã";
    return `em ${diff}d`;
  };
  const critical = vencidas.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative overflow-hidden rounded-2xl border p-6 backdrop-blur-xl ${
        critical
          ? "border-destructive/40 bg-destructive/[0.08] pulse-glow"
          : "border-warning/40 bg-warning/[0.08]"
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`grid h-11 w-11 place-items-center rounded-xl ring-1 ${critical ? "bg-destructive/20 text-destructive ring-destructive/40" : "bg-warning/20 text-warning ring-warning/40"}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className={`text-base font-bold ${critical ? "text-destructive" : "text-warning"}`} style={{ fontFamily: "Urbanist" }}>
              {critical
                ? `${vencidas.length} conta${vencidas.length > 1 ? "s" : ""} vencida${vencidas.length > 1 ? "s" : ""}`
                : `${proximas.length} conta${proximas.length > 1 ? "s" : ""} a vencer em até ${ALERT_DAYS} dias`}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Total: <span className="font-semibold text-white">{brl(total)}</span>
              {critical && proximas.length > 0 && ` · +${proximas.length} próximas`}
            </p>
          </div>
        </div>
        <Link
          to="/contas-pagar"
          className={`flex items-center gap-1 text-xs font-semibold hover:underline ${critical ? "text-destructive" : "text-warning"}`}
        >
          Ver todas <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="divide-y divide-white/5">
        {rows.slice(0, 5).map((r) => {
          const isVenc = r.data_vencimento < hoje;
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{r.fornecedor}</div>
                <div className="text-xs text-muted-foreground">Vence em {fmtDate(r.data_vencimento)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold tabular-nums text-white">{brl(Number(r.valor))}</span>
                <Badge
                  variant="outline"
                  className={
                    isVenc
                      ? "border-destructive/50 bg-destructive/15 text-destructive"
                      : "border-warning/50 bg-warning/15 text-warning"
                  }
                >
                  {diasAte(r.data_vencimento)}
                </Badge>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > 5 && (
        <p className="pt-3 text-center text-xs text-muted-foreground">+{rows.length - 5} outras contas</p>
      )}
    </motion.div>
  );
}
