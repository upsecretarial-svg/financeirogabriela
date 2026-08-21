import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Card3D } from "@/components/card-3d";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Wallet,
  TrendingUp,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel-contas")({
  head: () => ({ meta: [{ title: "Painel · Contas a Pagar" }] }),
  component: Page,
});

type Period = "month" | "quarter" | "year";
type StatusFilter = "all" | "pago" | "pendente" | "vencido";

interface Payable {
  id: string;
  fornecedor: string;
  categoria: string | null;
  valor: number;
  status: string;
  data_vencimento: string;
  data_pagamento: string | null;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

function periodRange(period: Period): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "month") {
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), label: from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  }
  if (period === "quarter") {
    const qStart = Math.floor(m / 3) * 3;
    const from = new Date(y, qStart, 1);
    const to = new Date(y, qStart + 3, 0);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), label: `T${Math.floor(m / 3) + 1} · ${y}` };
  }
  const from = new Date(y, 0, 1);
  const to = new Date(y, 11, 31);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), label: `${y}` };
}

function Page() {
  const [period, setPeriod] = useState<Period>("month");
  const [status, setStatus] = useState<StatusFilter>("all");
  const range = useMemo(() => periodRange(period), [period]);

  const { data, isLoading } = useQuery({
    queryKey: ["painel-contas", range.from, range.to],
    queryFn: async () => {
      // Current period
      const { data: current, error } = await supabase
        .from("payables")
        .select("id,fornecedor,categoria,valor,status,data_vencimento,data_pagamento")
        .is("deleted_at", null)
        .or(`and(data_vencimento.gte.${range.from},data_vencimento.lte.${range.to}),and(data_pagamento.gte.${range.from},data_pagamento.lte.${range.to})`)
        .order("data_vencimento", { ascending: true });
      if (error) throw error;

      // Previous period for comparison
      const dFrom = new Date(range.from);
      const dTo = new Date(range.to);
      const diff = dTo.getTime() - dFrom.getTime();
      const prevFrom = new Date(dFrom.getTime() - diff - 86400000).toISOString().slice(0, 10);
      const prevTo = new Date(dFrom.getTime() - 86400000).toISOString().slice(0, 10);

      const { data: prev } = await supabase
        .from("payables")
        .select("valor,status")
        .is("deleted_at", null)
        .or(`and(data_vencimento.gte.${prevFrom},data_vencimento.lte.${prevTo}),and(data_pagamento.gte.${prevFrom},data_pagamento.lte.${prevTo})`);

      const totalCurrent = (current ?? []).filter(r => r.status !== 'cancelado').reduce((s, r) => s + Number(r.valor), 0);
      const totalPrev = (prev ?? []).filter(r => r.status !== 'cancelado').reduce((s, r) => s + Number(r.valor), 0);
      
      const variation = totalPrev === 0 ? (totalCurrent > 0 ? 100 : 0) : ((totalCurrent - totalPrev) / totalPrev) * 100;

      return {
        rows: (current ?? []) as Payable[],
        totalVariation: variation
      };
    },
  });

  const rows = data?.rows ?? [];
  const totalVariation = data?.totalVariation ?? 0;
  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    let pagoTotal = 0, pagoQtd = 0;
    let pendenteTotal = 0, pendenteQtd = 0;
    let vencidoTotal = 0, vencidoQtd = 0;
    for (const r of rows) {
      if (r.status === "pago") { pagoTotal += Number(r.valor); pagoQtd++; }
      else if (r.status === "cancelado") continue;
      else if (r.data_vencimento < today) { vencidoTotal += Number(r.valor); vencidoQtd++; }
      else { pendenteTotal += Number(r.valor); pendenteQtd++; }
    }
    return { pagoTotal, pagoQtd, pendenteTotal, pendenteQtd, vencidoTotal, vencidoQtd, total: pagoTotal + pendenteTotal + vencidoTotal };
  }, [rows, today]);

  const filtered = useMemo(() => {
    if (status === "all") return rows;
    return rows.filter((r) => {
      if (status === "pago") return r.status === "pago";
      if (status === "vencido") return r.status !== "pago" && r.status !== "cancelado" && r.data_vencimento < today;
      if (status === "pendente") return r.status !== "pago" && r.status !== "cancelado" && r.data_vencimento >= today;
      return true;
    });
  }, [rows, status, today]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const key = r.categoria || "Sem categoria";
      map.set(key, (map.get(key) ?? 0) + Number(r.valor));
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [filtered]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { mes: string; pago: number; pendente: number; vencido: number }>();
    for (const r of rows) {
      const key = (r.data_pagamento ?? r.data_vencimento).slice(0, 7);
      const cur = map.get(key) ?? { mes: key, pago: 0, pendente: 0, vencido: 0 };
      if (r.status === "pago") cur.pago += Number(r.valor);
      else if (r.status === "cancelado") { /* skip */ }
      else if (r.data_vencimento < today) cur.vencido += Number(r.valor);
      else cur.pendente += Number(r.valor);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [rows, today]);

  const pieColors = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#0ea5e9", "#a855f7"];

  return (
    <div className="space-y-8">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/10 via-indigo-500/5 to-transparent p-8"
      >
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-emerald-200">
              <Sparkles className="h-3.5 w-3.5" /> Dashboard Executivo
            </div>
            <h1 className="bg-gradient-to-r from-foreground via-emerald-600 to-indigo-600 bg-clip-text text-4xl font-black tracking-tight text-transparent dark:from-foreground dark:via-emerald-100 dark:to-indigo-200">
              Painel de Contas
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Visão consolidada de pagamentos, pendências e vencidos — {range.label}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-2xl border border-white/10 bg-white/[0.02] p-1 backdrop-blur-xl">
              {(["month", "quarter", "year"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "relative rounded-xl px-4 py-2 text-xs font-semibold transition-colors",
                    period === p ? "text-white" : "text-muted-foreground hover:text-white",
                  )}
                >
                  {period === p && (
                    <motion.span
                      layoutId="period-halo"
                      className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-emerald-500/30 to-indigo-500/20 shadow-[0_0_24px_rgba(16,185,129,0.35)] ring-1 ring-emerald-400/40"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  {p === "month" ? "Mês" : p === "quarter" ? "Trimestre" : "Ano"}
                </button>
              ))}
            </div>
            <Link to="/contas-pagar">
              <Button
                variant="outline"
                size="sm"
                className="group relative gap-1.5 overflow-hidden rounded-xl border-border bg-background/50 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:shadow-[0_10px_30px_-10px_rgba(16,185,129,0.5)] dark:border-white/10 dark:bg-white/[0.03]"
              >
                <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                Gerenciar
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </div>
        </div>
      </motion.header>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pago" icon={CheckCircle2} value={brl(stats.pagoTotal)} sub={`${stats.pagoQtd} conta(s)`} tone="emerald" delay={0.05} share={stats.total ? stats.pagoTotal / stats.total : 0} />
        <KpiCard label="Pendente" icon={Clock} value={brl(stats.pendenteTotal)} sub={`${stats.pendenteQtd} a vencer`} tone="amber" delay={0.1} share={stats.total ? stats.pendenteTotal / stats.total : 0} />
        <KpiCard label="Vencido" icon={AlertTriangle} value={brl(stats.vencidoTotal)} sub={`${stats.vencidoQtd} em atraso`} tone="rose" delay={0.15} share={stats.total ? stats.vencidoTotal / stats.total : 0} />
        <KpiCard label="Total do período" icon={Wallet} value={brl(stats.total)} sub={`${rows.length} lançamento(s)`} tone="indigo" delay={0.2} share={1} variation={totalVariation} />
      </div>


      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="xl:col-span-2">
          <Card3D className="h-full p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Evolução mensal</div>
                <div className="mt-1 text-lg font-bold text-foreground">Pago vs Pendente vs Vencido</div>
              </div>
              <TrendingUp className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.1)" />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(240 15% 10%)", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                    formatter={(v: number) => brl(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="pago" name="Pago" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pendente" name="Pendente" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="vencido" name="Vencido" stackId="a" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card3D>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card3D className="h-full p-6">
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-fuchsia-300">Distribuição</div>
              <div className="mt-1 text-lg font-bold text-foreground">Por categoria</div>
            </div>
            {byCategory.length === 0 ? (
              <div className="grid h-64 place-items-center text-sm text-muted-foreground">Sem dados no período.</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                      {byCategory.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "hsl(240 15% 10%)", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                      formatter={(v: number) => brl(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-4 space-y-2">
              {byCategory.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: pieColors[i % pieColors.length] }} />
                    <span className="truncate text-muted-foreground">{c.name}</span>
                  </div>
                  <span className="font-mono text-white">{brl(c.value)}</span>
                </div>
              ))}
            </div>
          </Card3D>
        </motion.div>
      </div>

      {/* Filters + table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-white/[0.02] p-1 backdrop-blur-xl">
            {(["all", "pago", "pendente", "vencido"] as StatusFilter[]).map((s) => {
              const active = status === s;
              const label = s === "all" ? "Todos" : s === "pago" ? "Pagos" : s === "pendente" ? "Pendentes" : "Vencidos";
              const activeTone =
                s === "pago" ? "from-emerald-500/30 to-emerald-500/10 ring-emerald-400/40"
                : s === "vencido" ? "from-rose-500/30 to-rose-500/10 ring-rose-400/40"
                : s === "pendente" ? "from-amber-500/30 to-amber-500/10 ring-amber-400/40"
                : "from-indigo-500/30 to-fuchsia-500/10 ring-indigo-400/40";
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "relative rounded-xl px-4 py-2 text-xs font-semibold transition-colors",
                    active ? "text-white" : "text-muted-foreground hover:text-white",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="status-halo"
                      className={cn("absolute inset-0 -z-10 rounded-xl bg-gradient-to-br ring-1", activeTone)}
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  {label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} de {rows.length} registro(s)
          </div>
        </div>

        <Card3D className="p-0" intensity={4}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Fornecedor</th>
                  <th className="px-4 py-3 font-semibold">Categoria</th>
                  <th className="px-4 py-3 font-semibold">Vencimento</th>
                  <th className="px-4 py-3 font-semibold">Pagamento</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</td></tr>
                )}
                <AnimatePresence mode="popLayout">
                  {filtered.map((r, idx) => {
                    const isVencido = r.status !== "pago" && r.status !== "cancelado" && r.data_vencimento < today;
                    const effective = r.status === "pago" ? "pago" : isVencido ? "vencido" : "pendente";
                    const tone = effective === "pago"
                      ? "bg-emerald-400/15 text-emerald-200 border-emerald-400/30"
                      : effective === "vencido"
                      ? "bg-rose-400/15 text-rose-200 border-rose-400/30"
                      : "bg-amber-400/15 text-amber-200 border-amber-400/30";
                    const accent = effective === "pago" ? "bg-emerald-400" : effective === "vencido" ? "bg-rose-400" : "bg-amber-400";
                    return (
                      <motion.tr
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: Math.min(idx * 0.015, 0.2), duration: 0.25 }}
                        className="group border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.03]"
                      >
                        <td className="relative px-4 py-3 font-medium text-white">
                          <span className={cn("absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r opacity-0 transition-opacity group-hover:opacity-100", accent)} />
                          {r.fornecedor}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.categoria ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.data_vencimento)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.data_pagamento ? fmtDate(r.data_pagamento) : "—"}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">{brl(Number(r.valor))}</td>
                        <td className="px-4 py-3">
                          <Badge className={cn("border capitalize", tone)} variant="outline">{effective}</Badge>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </Card3D>
      </motion.div>
    </div>
  );
}

function KpiCard({
  label,
  icon: Icon,
  value,
  sub,
  tone,
  delay,
  share,
  variation,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  sub: string;
  tone: "emerald" | "amber" | "rose" | "indigo";
  delay: number;
  share: number;
  variation?: number;
}) {
  const tones = {
    emerald: { grad: "from-emerald-500/25 to-emerald-500/5 text-emerald-300", bar: "from-emerald-400 to-teal-300", glow: "hover:shadow-[0_20px_60px_-20px_rgba(16,185,129,0.55)] hover:border-emerald-400/30" },
    amber: { grad: "from-amber-500/25 to-amber-500/5 text-amber-300", bar: "from-amber-400 to-orange-300", glow: "hover:shadow-[0_20px_60px_-20px_rgba(245,158,11,0.55)] hover:border-amber-400/30" },
    rose: { grad: "from-rose-500/25 to-rose-500/5 text-rose-300", bar: "from-rose-400 to-pink-300", glow: "hover:shadow-[0_20px_60px_-20px_rgba(244,63,94,0.55)] hover:border-rose-400/30" },
    indigo: { grad: "from-indigo-500/25 to-indigo-500/5 text-indigo-300", bar: "from-indigo-400 to-fuchsia-300", glow: "hover:shadow-[0_20px_60px_-20px_rgba(99,102,241,0.55)] hover:border-indigo-400/30" },
  };
  const t = tones[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className={cn("group rounded-2xl border border-white/10 transition-all duration-300", t.glow)}
    >
      <Card3D className="h-full p-6" glow>
        <div className="flex items-start justify-between">
          <div className={cn("grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3", t.grad)}>
            <Icon className="h-6 w-6" />
          </div>
          <span className="rounded-full bg-background/50 px-2 py-0.5 text-xs font-black text-muted-foreground/80 dark:bg-white/5">
            {Math.round(share * 100)}%
          </span>
        </div>
        <div className="mt-4 text-sm font-bold uppercase tracking-widest text-muted-foreground/90">{label}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-4xl font-black tracking-tighter text-foreground">{value}</div>
          {variation !== undefined && (
            <div className={cn(
              "flex items-center gap-0.5 text-sm font-black",
              variation <= 0 ? "text-success" : "text-destructive"
            )}>
              {variation <= 0 ? <TrendingUp className="h-3 w-3 rotate-180" /> : <TrendingUp className="h-3 w-3" />}
              {Math.abs(variation).toFixed(1)}%
            </div>
          )}
        </div>
        <div className="mt-2 text-sm font-medium text-muted-foreground">{sub}</div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(share * 100, 100)}%` }}
            transition={{ delay: delay + 0.15, duration: 0.9, ease: "easeOut" }}
            className={cn("h-full rounded-full bg-gradient-to-r", t.bar)}
          />
        </div>
      </Card3D>
    </motion.div>
  );
}

