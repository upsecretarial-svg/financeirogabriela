import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getStorageFile } from "@/lib/storage-file.functions";
import { Card3D } from "@/components/card-3d";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Pencil, Check, X, FileDown, FileSpreadsheet, FileText, Wallet,
  Receipt, Sparkles, TrendingUp, AlertCircle, CreditCard, Calendar,
} from "lucide-react";
import { exportCSV, exportXLSX, exportPDF } from "@/lib/export";
import { generateReceiptPDF } from "@/lib/receipt";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/recebimentos")({
  head: () => ({ meta: [{ title: "Recebimentos · Bento" }] }),
  component: Page,
});

interface Row {
  id: string;
  numero_interno: string | null;
  tutor: string;
  tutor_cpf: string | null;
  pet: string;
  data_atendimento: string;
  valor: number | null;
  valor_recebido: number | null;
  data_pagamento: string | null;
  payment_method_id: string | null;
  pago: boolean;
  obs_financeiras: string | null;
  comprovante_path: string | null;
  paid_by_name: string | null;
  paid_at: string | null;
  nf_numero: string | null;
  status: string | null;
  clinics: { nome: string } | null;
  payment_methods: { nome: string } | null;
}

type Filter = "all" | "open" | "paid";

const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

const fmtShort = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
};

function openBase64File(file: { base64: string; contentType: string; filename: string }, targetWindow: Window | null) {
  const byteCharacters = atob(file.base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) byteNumbers[i] = byteCharacters.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: file.contentType });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  if (targetWindow && targetWindow !== opened) {
    try { targetWindow.close(); } catch { /* ignore */ }
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Page() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [edit, setEdit] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["receb-list", from, to],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("id,numero_interno,tutor,tutor_cpf,pet,data_atendimento,valor,valor_recebido,data_pagamento,payment_method_id,pago,obs_financeiras,comprovante_path,paid_by_name,paid_at,nf_numero,status,clinics(nome),payment_methods(nome)")
        .is("deleted_at", null)
        .order("data_atendimento", { ascending: false })
        .limit(1000);
      if (from) q = q.gte("data_atendimento", from);
      if (to) q = q.lte("data_atendimento", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const { data: methods } = useQuery({
    queryKey: ["payment-methods-active"],
    queryFn: async () => (await supabase.from("payment_methods").select("*").eq("ativo", true).order("nome")).data ?? [],
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    return rows.filter((r) => {
      if (filter === "open" && r.pago) return false;
      if (filter === "paid" && !r.pago) return false;
      if (methodFilter === "none" && r.payment_method_id) return false;
      if (methodFilter !== "all" && methodFilter !== "none" && r.payment_method_id !== methodFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.tutor?.toLowerCase().includes(s) || r.pet?.toLowerCase().includes(s);
      }
      return true;
    });
  }, [data, filter, methodFilter, search]);

  const totals = useMemo(() => {
    return (data ?? []).reduce(
      (acc, r) => {
        acc.qtd += 1;
        acc.valor += Number(r.valor ?? 0);
        acc.recebido += Number(r.valor_recebido ?? 0);
        if (!r.pago) acc.aberto += Number(r.valor ?? 0);
        if (r.pago) acc.pagos += 1;
        return acc;
      },
      { qtd: 0, valor: 0, recebido: 0, aberto: 0, pagos: 0 },
    );
  }, [data]);

  const exportRows = (data ?? []).map((r) => ({
    Numero: r.numero_interno ?? "",
    Data: r.data_atendimento,
    Tutor: r.tutor,
    CPF: r.tutor_cpf ?? "",
    Pet: r.pet,
    Clinica: r.clinics?.nome ?? "",
    Valor: Number(r.valor ?? 0),
    Recebido: Number(r.valor_recebido ?? 0),
    "Forma de pagamento": r.payment_methods?.nome ?? "",
    "Data pagamento": r.data_pagamento ?? "",
    "Baixa por": r.paid_by_name ?? "",
    "Baixa em": r.paid_at ?? "",
    Status: r.pago ? "Pago" : "Em aberto",
    NF: r.nf_numero ?? "",
    Observacoes: r.obs_financeiras ?? "",
  }));

  const filename = `recebimentos_${from || "todos"}_a_${to || "hoje"}`;
  const onPDF = () => exportPDF(
    filename,
    "Histórico de recebimentos",
    ["Nº", "Data", "Tutor/Pet", "CPF", "Clínica", "Valor", "Recebido", "Pgto.", "Baixa por", "Status"],
    exportRows.map((r) => [r.Numero, r.Data, `${r.Tutor} / ${r.Pet}`, r.CPF, r.Clinica, brl(r.Valor), brl(r.Recebido), r["Forma de pagamento"], r["Baixa por"], r.Status]),
    {
      Período: `${from || "—"} → ${to || "—"}`,
      Atendimentos: String(totals.qtd),
      Faturado: brl(totals.valor),
      Recebido: brl(totals.recebido),
      "Em aberto": brl(totals.aberto),
    },
  );

  const save = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase.from("appointments").update({
        valor_recebido: row.valor_recebido,
        data_pagamento: row.data_pagamento || null,
        payment_method_id: row.payment_method_id || null,
        pago: row.pago,
        obs_financeiras: row.obs_financeiras || null,
        comprovante_path: row.comprovante_path || null,
      }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receb-list"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Recebimento atualizado.");
      setEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePago = useMutation({
    mutationFn: async (row: Row) => {
      const novo = !row.pago;
      const { error } = await supabase.from("appointments").update({
        pago: novo,
        valor_recebido: novo ? (row.valor_recebido ?? row.valor) : row.valor_recebido,
        data_pagamento: novo ? (row.data_pagamento ?? new Date().toISOString().slice(0, 10)) : null,
      }).eq("id", row.id);
      if (error) throw error;
      return novo;
    },
    onSuccess: (novo) => {
      qc.invalidateQueries({ queryKey: ["receb-list"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(novo ? "Marcado como pago." : "Marcado como em aberto.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pctRecebido = totals.valor > 0 ? (totals.recebido / totals.valor) * 100 : 0;
  const filtros: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: totals.qtd },
    { key: "open", label: "Em aberto", count: totals.qtd - totals.pagos },
    { key: "paid", label: "Pagos", count: totals.pagos },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
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
              <Sparkles className="h-3.5 w-3.5" /> Central de Recebimentos
            </div>
            <h1 className="bg-gradient-to-r from-foreground via-emerald-600 to-indigo-600 bg-clip-text text-4xl font-black tracking-tight text-transparent dark:from-foreground dark:via-emerald-100 dark:to-indigo-200">
              Recebimentos
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Baixas, comprovantes e recibos com filtros inteligentes e ação em segundos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-xl border-border bg-background/50 dark:border-white/10 dark:bg-white/[0.03]" onClick={() => exportCSV(filename, exportRows)} disabled={!exportRows.length}>
              <FileDown className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl border-border bg-background/50 dark:border-white/10 dark:bg-white/[0.03]" onClick={() => exportXLSX(filename, exportRows)} disabled={!exportRows.length}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl border-border bg-background/50 dark:border-white/10 dark:bg-white/[0.03]" onClick={onPDF} disabled={!exportRows.length}>
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </div>
      </motion.header>

      {/* Bento stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="md:col-span-3">
          <Card3D className="h-full p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Total recebido</div>
                <div className="mt-2 text-4xl font-black tracking-tight text-foreground">{brl(totals.recebido)}</div>
                <div className="mt-1 text-xs text-muted-foreground">de {brl(totals.valor)} faturados</div>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(pctRecebido, 100)}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 shadow-[0_0_20px_rgba(52,211,153,0.5)]"
              />
            </div>
            <div className="mt-2 text-[11px] font-medium text-emerald-200/80">{pctRecebido.toFixed(1)}% da meta</div>
          </Card3D>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="md:col-span-3">
          <Card3D className="h-full p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-amber-300">Em aberto</div>
                <div className="mt-2 text-4xl font-black tracking-tight text-foreground">{brl(totals.aberto)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{totals.qtd - totals.pagos} pendência(s)</div>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
                <AlertCircle className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-6 flex gap-1.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.2 + i * 0.03, duration: 0.4 }}
                  className={cn(
                    "h-8 flex-1 origin-bottom rounded-sm",
                    i < Math.round(12 * ((totals.qtd - totals.pagos) / Math.max(totals.qtd, 1)))
                      ? "bg-gradient-to-t from-amber-500 to-fuchsia-400"
                      : "bg-white/5",
                  )}
                />
              ))}
            </div>
          </Card3D>
        </motion.div>

        <MiniBentoStat delay={0.15} icon={Receipt} label="Atendimentos" value={totals.qtd} color="indigo" />
        <MiniBentoStat delay={0.18} icon={Check} label="Pagos" value={totals.pagos} color="emerald" />
        <MiniBentoStat delay={0.21} icon={Wallet} label="Faturado" value={brl(totals.valor)} color="sky" isMoney />
        <MiniBentoStat delay={0.24} icon={CreditCard} label="Ticket médio" value={brl(totals.qtd ? totals.valor / totals.qtd : 0)} color="fuchsia" isMoney />
      </div>

      {/* Smart filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-xl border-white/10 bg-white/[0.03] pl-10 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-emerald-400/40"
                placeholder="Buscar por tutor ou pet…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filtros.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "relative rounded-xl border px-4 py-2 text-xs font-semibold transition-all",
                      active
                        ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.25)]"
                        : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-white",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="receb-filter-halo"
                        className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-indigo-500/10"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    {f.label}
                    <span className={cn(
                      "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      active ? "bg-emerald-400/30 text-white" : "bg-white/10 text-muted-foreground",
                    )}>{f.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_auto_auto]">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="month"
                  value={`${from.slice(0, 7)}`}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const [y, m] = e.target.value.split("-");
                    setFrom(new Date(Number(y), Number(m) - 1, 1).toISOString().slice(0, 10));
                    setTo(new Date(Number(y), Number(m), 0).toISOString().slice(0, 10));
                  }}
                  className="h-11 w-[180px] rounded-xl border-white/10 bg-white/[0.03] pl-9 text-xs"
                />
              </div>
            </div>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="h-11 rounded-xl border-white/10 bg-white/[0.03]" aria-label="Forma de pagamento">
                <CreditCard className="mr-1.5 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Forma de pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as formas</SelectItem>
                <SelectItem value="none">Sem forma definida</SelectItem>
                {methods?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="month"
                  className="h-11 w-40 rounded-xl border-white/10 bg-white/[0.03] pl-9 text-xs"
                  onChange={(e) => {
                    if (e.target.value) {
                      const [y, m] = e.target.value.split("-").map(Number);
                      setFrom(new Date(y, m - 1, 1).toISOString().slice(0, 10));
                      setTo(new Date(y, m, 0).toISOString().slice(0, 10));
                    }
                  }}
                />
              </div>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" className="h-11 rounded-xl border-white/10 bg-white/[0.03] pl-9" />
              </div>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" className="h-11 rounded-xl border-white/10 bg-white/[0.03] pl-9" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Grid of 3D cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-muted-foreground">
            <Wallet className="h-7 w-7" />
          </div>
          <div className="mt-4 text-sm font-medium text-white">Nenhum recebimento no filtro</div>
          <div className="mt-1 text-xs text-muted-foreground">Ajuste o período, a forma de pagamento ou o status.</div>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((r, idx) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: Math.min(idx * 0.02, 0.3), duration: 0.35 }}
              >
                <ReceiptCard
                  row={r}
                  onEdit={() => setEdit(r)}
                  onTogglePago={() => togglePago.mutate(r)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto border-white/10 bg-[hsl(240_15%_8%)]/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Recebimento · <span className="text-emerald-300">{edit?.tutor}</span> / {edit?.pet}
            </DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Valor recebido (R$)</Label>
                  <Input type="number" step="0.01" min="0" value={edit.valor_recebido ?? ""} onChange={(e) => setEdit({ ...edit, valor_recebido: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div className="space-y-2">
                  <Label>Data de pagamento</Label>
                  <Input type="date" value={edit.data_pagamento ?? ""} onChange={(e) => setEdit({ ...edit, data_pagamento: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Forma de pagamento</Label>
                  <Select value={edit.payment_method_id ?? ""} onValueChange={(v) => setEdit({ ...edit, payment_method_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {methods?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:col-span-2">
                  <Label>Pago</Label>
                  <Switch checked={edit.pago} onCheckedChange={(v) => setEdit({ ...edit, pago: v })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Observações financeiras</Label>
                  <Textarea rows={2} value={edit.obs_financeiras ?? ""} onChange={(e) => setEdit({ ...edit, obs_financeiras: e.target.value })} />
                </div>
              </div>
              <FileField
                label="Comprovante de pagamento"
                path={edit.comprovante_path}
                prefix="comprovante"
                onChange={(p) => setEdit({ ...edit, comprovante_path: p })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => edit && save.mutate(edit)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniBentoStat({
  icon: Icon, label, value, color, delay, isMoney = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: "indigo" | "emerald" | "sky" | "fuchsia";
  delay: number;
  isMoney?: boolean;
}) {
  const colors = {
    indigo: "from-indigo-500/20 to-indigo-500/5 text-indigo-300",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-300",
    sky: "from-sky-500/20 to-sky-500/5 text-sky-300",
    fuchsia: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-300",
  };
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="md:col-span-1.5 md:col-[span_1] xl:col-span-1">
      <Card3D className="h-full p-5" intensity={5}>
        <div className={cn("mb-4 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br", colors[color])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn("mt-1 font-black text-white", isMoney ? "text-xl" : "text-3xl")}>{value}</div>
      </Card3D>
    </motion.div>
  );
}

function ReceiptCard({
  row, onEdit, onTogglePago,
}: {
  row: Row;
  onEdit: () => void;
  onTogglePago: () => void;
}) {
  const status = row.pago
    ? { label: "Pago", tone: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30" }
    : { label: "Em aberto", tone: "bg-amber-400/15 text-amber-200 border-amber-400/30" };

  const pct = row.valor && row.valor > 0
    ? Math.min(100, ((row.valor_recebido ?? 0) / row.valor) * 100)
    : 0;

  const onRecibo = () =>
    generateReceiptPDF({
      numero: row.numero_interno ?? row.id.slice(0, 8),
      tutor: row.tutor,
      cpf: row.tutor_cpf,
      pet: row.pet,
      clinica: row.clinics?.nome ?? null,
      valor: Number(row.valor ?? 0),
      valorRecebido: Number(row.valor_recebido ?? row.valor ?? 0),
      dataPagamento: row.data_pagamento,
      formaPagamento: row.payment_methods?.nome ?? null,
      baixaPor: row.paid_by_name,
      observacoes: row.obs_financeiras,
    }).catch((e: Error) => toast.error("Falha ao gerar recibo", { description: e.message }));

  return (
    <Card3D className="flex h-full flex-col p-5" glow intensity={6}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-white/5 text-emerald-300">
              <Receipt className="h-3.5 w-3.5" />
            </span>
            {fmtShort(row.data_atendimento)}
            {row.clinics?.nome && (
              <span className="truncate text-muted-foreground/70 normal-case tracking-normal">
                · {row.clinics.nome}
              </span>
            )}
          </div>
          <h3 className="mt-2 truncate text-lg font-bold text-white">{row.tutor}</h3>
          <p className="truncate text-sm text-muted-foreground">{row.pet}</p>
        </div>
        <Badge className={cn("shrink-0 border", status.tone)} variant="outline">
          {status.label}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Valor</div>
          <div className="mt-1 text-lg font-black text-white">{brl(row.valor)}</div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Recebido</div>
          <div className={cn("mt-1 text-lg font-black", row.pago ? "text-emerald-300" : "text-white")}>{brl(row.valor_recebido)}</div>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={cn(
            "h-full rounded-full",
            row.pago
              ? "bg-gradient-to-r from-emerald-400 to-teal-300 shadow-[0_0_12px_rgba(52,211,153,0.6)]"
              : "bg-gradient-to-r from-amber-400 to-fuchsia-400",
          )}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {row.payment_methods?.nome && (
          <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1">
            <CreditCard className="h-3 w-3" /> {row.payment_methods.nome}
          </span>
        )}
        {row.data_pagamento && (
          <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1">
            <Calendar className="h-3 w-3" /> {fmtDate(row.data_pagamento)}
          </span>
        )}
        {row.paid_by_name && (
          <span className="inline-flex items-center gap-1 truncate rounded-md bg-white/5 px-2 py-1">
            por {row.paid_by_name}
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "h-8 gap-1.5 rounded-lg border-white/10 bg-white/[0.03]",
            row.pago
              ? "border-amber-400/30 text-amber-200 hover:bg-amber-400/10"
              : "border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10",
          )}
          onClick={onTogglePago}
        >
          {row.pago ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {row.pago ? "Reabrir" : "Dar baixa"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-lg border-white/10 bg-white/[0.03]"
          disabled={!row.pago}
          onClick={onRecibo}
        >
          <Receipt className="h-3.5 w-3.5" /> Recibo
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 rounded-lg hover:bg-white/5"
          onClick={onEdit}
          title="Editar"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </Card3D>
  );
}

function FileField({ label, path, prefix, onChange }: { label: string; path: string | null; prefix: string; onChange: (p: string | null) => void }) {
  const getFile = useServerFn(getStorageFile);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const key = `${prefix}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("notas-fiscais").upload(key, file, { contentType: file.type || "application/pdf" });
      if (error) throw error;
      onChange(key);
      toast.success("Arquivo enviado.");
    } catch (e) {
      toast.error("Erro no upload", { description: (e as Error).message });
    } finally { setBusy(false); }
  };
  const view = async () => {
    if (!path) return;
    const targetWindow = window.open("about:blank", "_blank");
    if (targetWindow) targetWindow.opener = null;
    try {
      const file = await getFile({ data: { bucket: "notas-fiscais", path } });
      openBase64File(file, targetWindow);
    } catch (error) {
      targetWindow?.close();
      toast.error("Erro ao abrir arquivo", { description: (error as Error).message });
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" accept="application/pdf,image/*" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        {path && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={view}>Visualizar</Button>
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onChange(null)}>Remover</Button>
          </>
        )}
      </div>
    </div>
  );
}
