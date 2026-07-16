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
      const { data, error } = await supabase
        .from("payables")
        .select("id,fornecedor,categoria,valor,status,data_vencimento,data_pagamento")
        .is("deleted_at", null)
        .or(`and(data_vencimento.gte.${range.from},data_vencimento.lte.${range.to}),and(data_pagamento.gte.${range.from},data_pagamento.lte.${range.to})`)
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Payable[];
    },
  });

  const rows = data ?? [];
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
            <h1 className="bg-gradient-to-r from-white via-emerald-100 to-indigo-200 bg-clip-text text-4xl font-black tracking-tight text-transparent">
              Painel de Contas
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Visão consolidada de pagamentos, pendências e vencidos — {range.label}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["month", "quarter", "year"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-xl border px-4 py-2 text-xs font-semibold transition-all",
                  period === p
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-white",
                )}
              >
                {p === "month" ? "Mês" : p === "quarter" ? "Trimestre" : "Ano"}
              </button>
            ))}
            <Link to="/contas-pagar">
              <Button variant="outline" size="sm" className="gap-1.5 border-white/10 bg-white/[0.03]">
                Gerenciar <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </motion.header>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pago" icon={CheckCircle2} value={brl(stats.pagoTotal)} sub={`${stats.pagoQtd} conta(s)`} tone="emerald" delay={0.05} />
        <KpiCard label="Pendente" icon={Clock} value={brl(stats.pendenteTotal)} sub={`${stats.pendenteQtd} a vencer`} tone="amber" delay={0.1} />
        <KpiCard label="Vencido" icon={AlertTriangle} value={brl(stats.vencidoTotal)} sub={`${stats.vencidoQtd} em atraso`} tone="rose" delay={0.15} />
        <KpiCard label="Total do período" icon={Wallet} value={brl(stats.total)} sub={`${rows.length} lançamento(s)`} tone="indigo" delay={0.2} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="xl:col-span-2">
          <Card3D className="h-full p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Evolução mensal</div>
                <div className="mt-1 text-lg font-bold text-white">Pago vs Pendente vs Vencido</div>
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
              <div className="mt-1 text-lg font-bold text-white">Por categoria</div>
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
          {(["all", "pago", "pendente", "vencido"] as StatusFilter[]).map((s) => {
            const active = status === s;
            const label = s === "all" ? "Todos" : s === "pago" ? "Pagos" : s === "pendente" ? "Pendentes" : "Vencidos";
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-xl border px-4 py-2 text-xs font-semibold transition-all",
                  active
                    ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-100"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-white",
                )}
              >
                {label}
              </button>
            );
          })}
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
                {filtered.map((r) => {
                  const isVencido = r.status !== "pago" && r.status !== "cancelado" && r.data_vencimento < today;
                  const effective = r.status === "pago" ? "pago" : isVencido ? "vencido" : "pendente";
                  const tone = effective === "pago"
                    ? "bg-emerald-400/15 text-emerald-200 border-emerald-400/30"
                    : effective === "vencido"
                    ? "bg-rose-400/15 text-rose-200 border-rose-400/30"
                    : "bg-amber-400/15 text-amber-200 border-amber-400/30";
                  return (
                    <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-medium text-white">{r.fornecedor}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.categoria ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.data_vencimento)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.data_pagamento ? fmtDate(r.data_pagamento) : "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-white">{brl(Number(r.valor))}</td>
                      <td className="px-4 py-3">
                        <Badge className={cn("border capitalize", tone)} variant="outline">{effective}</Badge>
                      </td>
                    </tr>
                  );
                })}
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
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  sub: string;
  tone: "emerald" | "amber" | "rose" | "indigo";
  delay: number;
}) {
  const tones = {
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-300",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-300",
    rose: "from-rose-500/20 to-rose-500/5 text-rose-300",
    indigo: "from-indigo-500/20 to-indigo-500/5 text-indigo-300",
  };
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card3D className="h-full p-6" glow>
        <div className={cn("mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br", tones[tone])}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-black tracking-tight text-white">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </Card3D>
    </motion.div>
  );
}
