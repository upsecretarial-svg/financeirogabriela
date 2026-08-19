import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getStorageFile } from "@/lib/storage-file.functions";
import { extractPayableFromPdf } from "@/lib/payables-extract.functions";
import { Card3D } from "@/components/card-3d";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Plus, Sparkles, FileText, Check, Undo2, Pencil, Trash2, Wallet, AlertTriangle,
  Repeat, DollarSign, Search, Calendar, Building2, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar · Bento" }] }),
  component: Page,
});

interface Payable {
  id: string;
  fornecedor: string;
  descricao: string | null;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: "pendente" | "pago" | "vencido" | "agendado" | "cancelado";
  anexo_path: string | null;
  paid_by_name: string | null;
  payment_method_id: string | null;
  recorrente: boolean;
  recorrencia_parcela: number | null;
  recorrencia_total: number | null;
}

interface PaymentMethod { id: string; nome: string }

type Filter = "all" | "open" | "overdue" | "paid";

const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const today = () => new Date().toISOString().slice(0, 10);

const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, d));
  return dt.toISOString().slice(0, 10);
};

const fmtDate = (iso: string | null | undefined) =>
  iso ? iso.split("-").reverse().join("/") : "—";

const fmtShort = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch { return iso; }
};

const daysUntil = (iso: string) => {
  const t = new Date(today());
  const d = new Date(iso);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
};

type RecurrenceMode = "none" | "fixed" | "installments";

type FormState = {
  id?: string;
  fornecedor: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  anexo_path: string | null;
  recurrenceMode: RecurrenceMode;
  recurrenceMonths: number;
};

const emptyForm: FormState = {
  fornecedor: "", descricao: "", valor: 0,
  data_vencimento: today(), data_pagamento: null, anexo_path: null,
  recurrenceMode: "none", recurrenceMonths: 3,
};

function openBase64(file: { base64: string; contentType: string; filename: string }, w: Window | null) {
  const bytes = atob(file.base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: file.contentType }));
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const a = document.createElement("a");
    a.href = url; a.download = file.filename; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
  }
  if (w && w !== opened) { try { w.close(); } catch { /* ignore */ } }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Page() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<FormState | null>(null);
  const [payDialog, setPayDialog] = useState<Payable | null>(null);
  const [payMethodId, setPayMethodId] = useState<string>("");
  const [payDate, setPayDate] = useState<string>(today());
  const [extracting, setExtracting] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const extractRef = useRef<HTMLInputElement>(null);
  const getFile = useServerFn(getStorageFile);
  const extractFn = useServerFn(extractPayableFromPdf);

  const { data, isLoading } = useQuery({
    queryKey: ["payables", from, to],
    queryFn: async () => {
      let q = supabase
        .from("payables")
        .select("id,fornecedor,descricao,valor,data_vencimento,data_pagamento,status,anexo_path,paid_by_name,payment_method_id,recorrente,recorrencia_parcela,recorrencia_total")
        .is("deleted_at", null)
        .order("data_vencimento", { ascending: true })
        .limit(500);
      
      if (from) q = q.gte("data_vencimento", from);
      if (to) q = q.lte("data_vencimento", to);
      
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Payable[];
    },
  });

  const { data: methods } = useQuery({
    queryKey: ["payment_methods_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods").select("id,nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as PaymentMethod[];
    },
  });

  const kpis = useMemo(() => {
    const rows = data ?? [];
    const t = today();
    const pend = rows.filter((r) => r.status !== "pago" && r.status !== "cancelado");
    const overdue = pend.filter((r) => r.data_vencimento < t);
    const totalGeral = rows.filter((r) => r.status !== "cancelado").reduce((s, r) => s + Number(r.valor), 0);
    const pagas = rows.filter((r) => r.status === "pago");
    return {
      aberto: pend.reduce((s, r) => s + Number(r.valor), 0),
      totalGeral,
      totalPago: pagas.reduce((s, r) => s + Number(r.valor), 0),
      vencidas: overdue.length,
      vencidasValor: overdue.reduce((s, r) => s + Number(r.valor), 0),
      pagas: pagas.length,
      total: rows.length,
      pendentes: pend.length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const t = today();
    return rows.filter((r) => {
      if (filter === "open" && (r.status === "pago" || r.status === "cancelado")) return false;
      if (filter === "paid" && r.status !== "pago") return false;
      if (filter === "overdue" && !(r.status !== "pago" && r.status !== "cancelado" && r.data_vencimento < t)) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.fornecedor.toLowerCase().includes(s) || (r.descricao ?? "").toLowerCase().includes(s);
      }
      return true;
    });
  }, [data, filter, search]);

  const save = useMutation({
    mutationFn: async (row: FormState) => {
      const base = {
        fornecedor: row.fornecedor.trim(),
        descricao: row.descricao.trim() || null,
        valor: Number(row.valor) || 0,
        data_pagamento: row.data_pagamento || null,
        anexo_path: row.anexo_path,
      };
      if (row.id) {
        const { error } = await supabase.from("payables")
          .update({ ...base, data_vencimento: row.data_vencimento }).eq("id", row.id);
        if (error) throw error;
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const created_by = u.user?.id;
      if (row.recurrenceMode === "none") {
        const { error } = await supabase.from("payables").insert({
          ...base, data_vencimento: row.data_vencimento, created_by, recorrente: false,
        });
        if (error) throw error;
        return;
      }
      const grupo = crypto.randomUUID();
      const isFixed = row.recurrenceMode === "fixed";
      const total = isFixed ? 12 : Math.max(2, Math.min(60, row.recurrenceMonths || 2));
      const rows_ = Array.from({ length: total }, (_, i) => ({
        ...base,
        data_vencimento: addMonths(row.data_vencimento, i),
        data_pagamento: i === 0 ? row.data_pagamento || null : null,
        anexo_path: i === 0 ? row.anexo_path : null,
        created_by, recorrente: true,
        recorrencia_grupo: grupo,
        recorrencia_parcela: i + 1,
        recorrencia_total: isFixed ? null : total,
      }));
      const { error } = await supabase.from("payables").insert(rows_);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payables"] }); toast.success("Conta salva."); setEdit(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmPay = useMutation({
    mutationFn: async ({ id, method, date }: { id: string; method: string | null; date: string }) => {
      const { error } = await supabase.from("payables")
        .update({ data_pagamento: date, payment_method_id: method }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payables"] });
      toast.success("Pagamento registrado.");
      setPayDialog(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payables")
        .update({ data_pagamento: null, payment_method_id: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payables"] }); toast.success("Pagamento revertido."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payables").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payables"] }); toast.success("Removida."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openPay = (r: Payable) => {
    setPayDate(today());
    setPayMethodId(r.payment_method_id ?? "");
    setPayDialog(r);
  };

  const uploadAnexo = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop() || "pdf";
    const key = `boletos/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("contas-pagar").upload(key, file, { contentType: file.type || "application/pdf" });
    if (error) throw error;
    return key;
  };

  const onExtractPdf = async (file: File) => {
    setExtracting(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1] ?? "");
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      const extracted = await extractFn({ data: { filename: file.name, mimeType: file.type || "application/pdf", base64: b64 } });
      const key = await uploadAnexo(file);
      setEdit({
        ...emptyForm,
        fornecedor: extracted.fornecedor ?? "",
        descricao: extracted.descricao ?? "",
        valor: extracted.valor ?? 0,
        data_vencimento: extracted.data_vencimento ?? emptyForm.data_vencimento,
        anexo_path: key,
      });
      toast.success("Dados extraídos. Confirme e salve.");
    } catch (e) {
      toast.error("Falha ao extrair PDF", { description: (e as Error).message });
    } finally { setExtracting(false); }
  };

  const openAttachment = async (path: string) => {
    const w = window.open("about:blank", "_blank");
    if (w) w.opener = null;
    try {
      const f = await getFile({ data: { bucket: "contas-pagar", path } });
      openBase64(f, w);
    } catch (e) {
      w?.close();
      toast.error("Erro ao abrir", { description: (e as Error).message });
    }
  };

  const pctPago = kpis.totalGeral > 0 ? (kpis.totalPago / kpis.totalGeral) * 100 : 0;

  const filtros: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: kpis.total },
    { key: "open", label: "Pendentes", count: kpis.pendentes },
    { key: "overdue", label: "Vencidas", count: kpis.vencidas },
    { key: "paid", label: "Pagas", count: kpis.pagas },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rose-500/10 via-indigo-500/5 to-transparent p-8"
      >
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-rose-200">
              <Sparkles className="h-3.5 w-3.5" /> Central de Pagamentos
            </div>
            <h1 className="bg-gradient-to-r from-foreground via-rose-600 to-indigo-600 bg-clip-text text-4xl font-black tracking-tight text-transparent dark:from-foreground dark:via-rose-100 dark:to-indigo-200">
              Contas a Pagar
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Boletos, despesas recorrentes e agendamentos com leitura automática de PDF.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 shadow-[0_10px_30px_-10px_rgba(99,102,241,0.6)] hover:from-indigo-400 hover:to-fuchsia-400"
              onClick={() => setEdit({ ...emptyForm })}
            >
              <Plus className="mr-2 h-4 w-4" /> Nova conta
            </Button>
            <input
              ref={extractRef}
              type="file" accept="application/pdf,image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onExtractPdf(f); e.target.value = ""; }}
            />
            <Button
              variant="outline" className="rounded-xl border-border bg-background/50 dark:border-white/10 dark:bg-white/[0.03]"
              onClick={() => extractRef.current?.click()} disabled={extracting}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {extracting ? "Lendo boleto…" : "Ler boleto (PDF)"}
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
                <div className="text-xs font-semibold uppercase tracking-widest text-rose-300">Total a pagar</div>
                <div className="mt-2 text-4xl font-black tracking-tight text-foreground">{brl(kpis.aberto)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{kpis.pendentes} conta(s) em aberto</div>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/20 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300">
                <TrendingDown className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(pctPago, 100)}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 shadow-[0_0_20px_rgba(52,211,153,0.5)]"
              />
            </div>
            <div className="mt-2 text-[11px] font-medium text-emerald-200/80">{pctPago.toFixed(1)}% já quitado ({brl(kpis.totalPago)})</div>
          </Card3D>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="md:col-span-3">
          <Card3D className="h-full p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-amber-300">Vencidas</div>
                <div className="mt-2 text-4xl font-black tracking-tight text-foreground">{brl(kpis.vencidasValor)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{kpis.vencidas} conta(s) em atraso</div>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/20 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300">
                <AlertTriangle className="h-6 w-6" />
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
                    i < Math.round(12 * (kpis.vencidas / Math.max(kpis.total, 1)))
                      ? "bg-gradient-to-t from-rose-500 to-amber-400"
                      : "bg-white/5",
                  )}
                />
              ))}
            </div>
          </Card3D>
        </motion.div>

        <MiniBentoStat delay={0.15} icon={DollarSign} label="Total geral" value={brl(kpis.totalGeral)} color="indigo" isMoney />
        <MiniBentoStat delay={0.18} icon={Check} label="Pagas" value={kpis.pagas} color="emerald" />
        <MiniBentoStat delay={0.21} icon={Wallet} label="Pendentes" value={kpis.pendentes} color="sky" />
        <MiniBentoStat delay={0.24} icon={Repeat} label="Recorrentes" value={(data ?? []).filter((r) => r.recorrente).length} color="fuchsia" />
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
                className="h-11 rounded-xl border-white/10 bg-white/[0.03] pl-10 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-rose-400/40"
                placeholder="Buscar por fornecedor ou descrição…"
                value={search} onChange={(e) => setSearch(e.target.value)}
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
                        ? "border-rose-400/50 bg-rose-500/15 text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.25)]"
                        : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-white",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="payables-filter-halo"
                        className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-indigo-500/10"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    {f.label}
                    <span className={cn(
                      "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      active ? "bg-rose-400/30 text-white" : "bg-white/10 text-muted-foreground",
                    )}>{f.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
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
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-11 rounded-xl border-white/10 bg-white/[0.03] pl-9 text-xs"
                />
              </div>
              <span className="text-muted-foreground">até</span>
              <div className="relative flex-1">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-11 rounded-xl border-white/10 bg-white/[0.03] pl-9 text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Grid */}
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
          <div className="mt-4 text-sm font-medium text-white">Nenhuma conta encontrada</div>
          <div className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou cadastre uma nova conta.</div>
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
                <PayableCard
                  row={r}
                  onPay={() => openPay(r)}
                  onReopen={() => reopen.mutate(r.id)}
                  onEdit={() => setEdit({
                    id: r.id, fornecedor: r.fornecedor, descricao: r.descricao ?? "",
                    valor: Number(r.valor), data_vencimento: r.data_vencimento,
                    data_pagamento: r.data_pagamento, anexo_path: r.anexo_path,
                    recurrenceMode: "none", recurrenceMonths: 3,
                  })}
                  onRemove={() => { if (confirm(`Remover conta de ${r.fornecedor}?`)) remove.mutate(r.id); }}
                  onOpenAttachment={() => r.anexo_path && openAttachment(r.anexo_path)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-w-lg border-white/10 bg-[hsl(240_15%_8%)]/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">{edit?.id ? "Editar conta" : "Nova conta a pagar"}</DialogTitle>
            <DialogDescription>Informe os dados básicos do boleto ou despesa.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Fornecedor *</Label>
                <Input autoFocus value={edit.fornecedor}
                  onChange={(e) => setEdit({ ...edit, fornecedor: e.target.value })}
                  placeholder="Ex: Energia, Aluguel, Fornecedor X" />
              </div>
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Input value={edit.descricao}
                  onChange={(e) => setEdit({ ...edit, descricao: e.target.value })}
                  placeholder="Referência, nº do boleto, etc." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" value={edit.valor}
                    onChange={(e) => setEdit({ ...edit, valor: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Vencimento *</Label>
                  <Input type="date" value={edit.data_vencimento}
                    onChange={(e) => setEdit({ ...edit, data_vencimento: e.target.value })} />
                </div>
              </div>

              {!edit.id && (
                <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Repeat className="h-4 w-4" /> Recorrência
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <RecOption
                      active={edit.recurrenceMode === "none"}
                      onClick={() => setEdit({ ...edit, recurrenceMode: "none" })}
                      label="Única" desc="Só esta conta"
                    />
                    <RecOption
                      active={edit.recurrenceMode === "fixed"}
                      onClick={() => setEdit({ ...edit, recurrenceMode: "fixed" })}
                      label="Fixa mensal" desc="12 meses"
                    />
                    <RecOption
                      active={edit.recurrenceMode === "installments"}
                      onClick={() => setEdit({ ...edit, recurrenceMode: "installments" })}
                      label="Parcelada" desc="Nº parcelas"
                    />
                  </div>
                  {edit.recurrenceMode === "installments" && (
                    <div className="space-y-2">
                      <Label className="text-xs">Nº de parcelas</Label>
                      <Input type="number" min={2} max={60} value={edit.recurrenceMonths}
                        onChange={(e) => setEdit({ ...edit, recurrenceMonths: Number(e.target.value) })} />
                    </div>
                  )}
                  {edit.recurrenceMode !== "none" && (
                    <p className="text-xs text-muted-foreground">
                      Serão criadas {edit.recurrenceMode === "fixed" ? 12 : Math.max(2, edit.recurrenceMonths || 2)} contas mensais a partir do vencimento acima.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Anexar boleto (PDF ou imagem)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="file" accept="application/pdf,image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]; e.target.value = "";
                      if (!f) return;
                      try { const key = await uploadAnexo(f); setEdit({ ...edit, anexo_path: key }); toast.success("Anexo enviado."); }
                      catch (err) { toast.error("Erro no upload", { description: (err as Error).message }); }
                    }} />
                  {edit.anexo_path && (
                    <Button type="button" size="sm" variant="ghost" className="text-destructive"
                      onClick={() => setEdit({ ...edit, anexo_path: null })}>Remover</Button>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button disabled={save.isPending || !edit?.fornecedor.trim() || !edit?.valor} onClick={() => edit && save.mutate(edit)}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={!!payDialog} onOpenChange={(v) => !v && setPayDialog(null)}>
        <DialogContent className="max-w-md border-white/10 bg-[hsl(240_15%_8%)]/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>
              {payDialog?.fornecedor} — {brl(payDialog?.valor)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Forma de pagamento *</Label>
              <Select value={payMethodId} onValueChange={setPayMethodId}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {methods?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data do pagamento *</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayDialog(null)}>Cancelar</Button>
            <Button
              disabled={confirmPay.isPending || !payMethodId || !payDate}
              className="bg-emerald-500 text-white hover:bg-emerald-400"
              onClick={() => payDialog && confirmPay.mutate({ id: payDialog.id, method: payMethodId, date: payDate })}
            >
              <Check className="mr-2 h-4 w-4" /> Confirmar pagamento
            </Button>
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

function PayableCard({
  row, onPay, onReopen, onEdit, onRemove, onOpenAttachment,
}: {
  row: Payable;
  onPay: () => void;
  onReopen: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onOpenAttachment: () => void;
}) {
  const isPaid = row.status === "pago";
  const isCanceled = row.status === "cancelado";
  const d = daysUntil(row.data_vencimento);
  const isOverdue = !isPaid && !isCanceled && d < 0;
  const isDueSoon = !isPaid && !isCanceled && d >= 0 && d <= 3;

  const status = isPaid
    ? { label: "Pago", tone: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30" }
    : isCanceled
      ? { label: "Cancelada", tone: "bg-white/5 text-muted-foreground border-white/10" }
      : isOverdue
        ? { label: `Vencida há ${Math.abs(d)}d`, tone: "bg-rose-400/15 text-rose-200 border-rose-400/30" }
        : isDueSoon
          ? { label: d === 0 ? "Vence hoje" : `Em ${d}d`, tone: "bg-amber-400/15 text-amber-200 border-amber-400/30" }
          : { label: `Em ${d}d`, tone: "bg-sky-400/15 text-sky-200 border-sky-400/30" };

  return (
    <Card3D
      className={cn(
        "flex h-full flex-col p-5",
        isOverdue && "ring-1 ring-rose-400/30",
      )}
      glow intensity={6}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-white/5 text-rose-300">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            {fmtShort(row.data_vencimento)}
            {row.recorrente && (
              <Badge variant="outline" className="h-5 gap-1 border-indigo-400/30 bg-indigo-500/10 px-1.5 text-[10px] normal-case tracking-normal text-indigo-200">
                <Repeat className="h-2.5 w-2.5" />
                {row.recorrencia_parcela && row.recorrencia_total
                  ? `${row.recorrencia_parcela}/${row.recorrencia_total}`
                  : "Fixa"}
              </Badge>
            )}
          </div>
          <h3 className="mt-2 truncate text-lg font-bold text-white">{row.fornecedor}</h3>
          {row.descricao && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.descricao}</p>
          )}
        </div>
        <Badge className={cn("shrink-0 border whitespace-nowrap", status.tone)} variant="outline">
          {status.label}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Valor</div>
          <div className={cn("mt-1 text-lg font-black", isPaid ? "text-emerald-300" : "text-white")}>{brl(row.valor)}</div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {isPaid ? "Pago em" : "Vencimento"}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {fmtDate(isPaid ? row.data_pagamento : row.data_vencimento)}
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        {isPaid ? (
          <Button
            size="sm" variant="outline"
            className="h-8 gap-1.5 rounded-lg border-amber-400/30 bg-white/[0.03] text-amber-200 hover:bg-amber-400/10"
            onClick={onReopen}
          >
            <Undo2 className="h-3.5 w-3.5" /> Reabrir
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-[0_8px_20px_-6px_rgba(52,211,153,0.5)] hover:from-emerald-400 hover:to-teal-300"
            onClick={onPay}
          >
            <Check className="h-3.5 w-3.5" /> Pagar
          </Button>
        )}
        {row.anexo_path && (
          <Button
            size="sm" variant="outline"
            className="h-8 gap-1.5 rounded-lg border-white/10 bg-white/[0.03]"
            onClick={onOpenAttachment}
          >
            <FileText className="h-3.5 w-3.5" /> Boleto
          </Button>
        )}
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-white/5" title="Editar" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-rose-300 hover:bg-rose-400/10" title="Remover" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card3D>
  );
}

function RecOption({ active, onClick, label, desc }: { active: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-2 text-left text-xs transition",
        active
          ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-100"
          : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-white",
      )}
    >
      <div className="font-semibold">{label}</div>
      <div className="text-[10px] opacity-70">{desc}</div>
    </button>
  );
}
