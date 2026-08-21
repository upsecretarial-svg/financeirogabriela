import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getStorageFile } from "@/lib/storage-file.functions";
import { extractNfFromFile, mergeExtractedNf } from "@/lib/nf-extract.functions";
import { Card3D } from "@/components/card-3d";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search,
  Pencil,
  Check,
  X,
  Paperclip,
  FileText,
  FileSearch,
  Sparkles,
  Send,
  AlertCircle,
  TrendingUp,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notas-fiscais")({
  head: () => ({ meta: [{ title: "Notas Fiscais · Bento" }] }),
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
  nf_emitida: boolean;
  nf_enviada: boolean;
  nf_numero: string | null;
  nf_pdf_path: string | null;
}

type Filter = "all" | "pending" | "issued" | "sent" | "attached";

const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return s;
  }
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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
  const [edit, setEdit] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["nf-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id,numero_interno,tutor,tutor_cpf,pet,data_atendimento,valor,nf_emitida,nf_enviada,nf_numero,nf_pdf_path")
        .is("deleted_at", null)
        .order("data_atendimento", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const stats = useMemo(() => {
    const rows = data ?? [];
    const total = rows.length;
    const emitidas = rows.filter((r) => r.nf_emitida).length;
    const enviadas = rows.filter((r) => r.nf_enviada).length;
    const pendentes = total - emitidas;
    const valorEmitido = rows.filter((r) => r.nf_emitida).reduce((a, r) => a + (r.valor ?? 0), 0);
    const valorPendente = rows.filter((r) => !r.nf_emitida).reduce((a, r) => a + (r.valor ?? 0), 0);
    const anexadas = rows.filter((r) => r.nf_pdf_path).length;
    return { total, emitidas, enviadas, pendentes, valorEmitido, valorPendente, anexadas };
  }, [data]);

  const filtered = useMemo(() => {
    const rows = data ?? [];
    return rows.filter((r) => {
      if (filter === "pending" && r.nf_emitida) return false;
      if (filter === "issued" && !r.nf_emitida) return false;
      if (filter === "sent" && !r.nf_enviada) return false;
      if (filter === "attached" && !r.nf_pdf_path) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          r.tutor?.toLowerCase().includes(s) ||
          r.pet?.toLowerCase().includes(s) ||
          r.nf_numero?.toLowerCase().includes(s) ||
          r.tutor_cpf?.includes(s)
        );
      }
      return true;
    });
  }, [data, filter, search]);

  const save = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase
        .from("appointments")
        .update({
          nf_numero: row.nf_numero || null,
          nf_emitida: row.nf_emitida,
          nf_enviada: row.nf_enviada,
          nf_pdf_path: row.nf_pdf_path || null,
          tutor_cpf: row.tutor_cpf || null,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nf-list"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("NF atualizada.");
      setEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEmitida = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase
        .from("appointments")
        .update({ nf_emitida: !row.nf_emitida })
        .eq("id", row.id);
      if (error) throw error;
      return !row.nf_emitida;
    },
    onSuccess: (novo) => {
      qc.invalidateQueries({ queryKey: ["nf-list"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(novo ? "NF marcada como emitida." : "NF marcada como pendente.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEnviada = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase
        .from("appointments")
        .update({ nf_enviada: !row.nf_enviada })
        .eq("id", row.id);
      if (error) throw error;
      return !row.nf_enviada;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nf-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: stats.total },
    { key: "pending", label: "Pendentes", count: stats.pendentes },
    { key: "issued", label: "Emitidas", count: stats.emitidas },
    { key: "sent", label: "Enviadas", count: stats.enviadas },
    { key: "attached", label: "Com PDF", count: stats.anexadas },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-fuchsia-500/5 to-transparent p-8"
      >
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-indigo-200">
              <Sparkles className="h-3.5 w-3.5" /> Central de Notas Fiscais
            </div>
            <h1 className="bg-gradient-to-r from-foreground via-indigo-600 to-fuchsia-600 bg-clip-text text-4xl font-black tracking-tight text-transparent dark:from-foreground dark:via-indigo-100 dark:to-fuchsia-200">
              Notas Fiscais
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Emissão, envio e anexos de NF. Filtros inteligentes e visão bento para agir em segundos.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <StatMini label="Emitidas" value={stats.emitidas} tone="success" />
            <StatMini label="Pendentes" value={stats.pendentes} tone="warn" />
            <StatMini label="Total" value={stats.total} tone="neutral" />
          </div>
        </div>
      </motion.header>

      {/* Bento stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="md:col-span-3">
          <Card3D className="h-full p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Valor emitido</div>
                <div className="mt-2 text-5xl font-black tracking-tighter text-foreground">{brl(stats.valorEmitido)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{stats.emitidas} nota(s) emitida(s)</div>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${stats.total ? (stats.emitidas / stats.total) * 100 : 0}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 shadow-[0_0_20px_rgba(52,211,153,0.5)]"
              />
            </div>
          </Card3D>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="md:col-span-3">
          <Card3D className="h-full p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-fuchsia-300">A emitir</div>
                <div className="mt-2 text-4xl font-black tracking-tight text-foreground">{brl(stats.valorPendente)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{stats.pendentes} pendência(s)</div>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/20 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300">
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
                    i < Math.round(12 * (stats.pendentes / Math.max(stats.total, 1)))
                      ? "bg-gradient-to-t from-amber-500 to-fuchsia-400"
                      : "bg-white/5",
                  )}
                />
              ))}
            </div>
          </Card3D>
        </motion.div>

        <MiniBentoStat delay={0.15} icon={Receipt} label="Total" value={stats.total} color="indigo" />
        <MiniBentoStat delay={0.18} icon={Check} label="Emitidas" value={stats.emitidas} color="emerald" />
        <MiniBentoStat delay={0.21} icon={Send} label="Enviadas" value={stats.enviadas} color="sky" />
        <MiniBentoStat delay={0.24} icon={Paperclip} label="Com PDF" value={stats.anexadas} color="fuchsia" />
      </div>

      {/* Smart filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 rounded-xl border-white/10 bg-white/[0.03] pl-10 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-indigo-400/40"
              placeholder="Buscar por tutor, pet, CPF ou nº da NF…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "relative rounded-xl border px-4 py-2 text-xs font-semibold transition-all",
                    active
                      ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-100 shadow-[0_0_20px_rgba(99,102,241,0.25)]"
                      : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-white",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="filter-halo"
                      className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/10"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  {f.label}
                  <span className={cn(
                    "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    active ? "bg-indigo-400/30 text-white" : "bg-white/10 text-muted-foreground",
                  )}>{f.count}</span>
                </button>
              );
            })}
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
            <FileSearch className="h-7 w-7" />
          </div>
          <div className="mt-4 text-sm font-medium text-white">Nenhuma nota encontrada</div>
          <div className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou a busca para ver resultados.</div>
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
                <NfCard
                  row={r}
                  onEdit={() => setEdit(r)}
                  onToggleEmitida={() => toggleEmitida.mutate(r)}
                  onToggleEnviada={() => toggleEnviada.mutate(r)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-w-xl border-white/10 bg-[hsl(240_15%_8%)]/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">
              NF · <span className="text-indigo-300">{edit?.tutor}</span> / {edit?.pet}
            </DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nº da NF</Label>
                <Input value={edit.nf_numero ?? ""} onChange={(e) => setEdit({ ...edit, nf_numero: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>CPF do tutor</Label>
                <Input value={edit.tutor_cpf ?? ""} onChange={(e) => setEdit({ ...edit, tutor_cpf: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <Label>NF emitida</Label>
                <Switch checked={edit.nf_emitida} onCheckedChange={(v) => setEdit({ ...edit, nf_emitida: v })} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <Label>NF enviada</Label>
                <Switch checked={edit.nf_enviada} onCheckedChange={(v) => setEdit({ ...edit, nf_enviada: v })} />
              </div>
              <FileField
                label="PDF da Nota Fiscal"
                path={edit.nf_pdf_path}
                prefix="nf"
                onChange={(p) => setEdit((cur) => cur ? { ...cur, nf_pdf_path: p, nf_emitida: p ? true : cur.nf_emitida } : cur)}
                onExtract={(x) => setEdit((cur) => cur ? {
                  ...cur,
                  nf_numero: cur.nf_numero || x.nf_numero || cur.nf_numero,
                  tutor_cpf: cur.tutor_cpf || x.tutor_cpf || cur.tutor_cpf,
                } : cur)}
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

function StatMini({ label, value, tone }: { label: string; value: number; tone: "success" | "warn" | "neutral" }) {
  const tones = {
    success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    neutral: "border-white/10 bg-white/5 text-white",
  };
  return (
    <div className={cn("rounded-2xl border px-4 py-3 backdrop-blur", tones[tone])}>
      <div className="text-[10px] font-semibold uppercase tracking-widest opacity-80">{label}</div>
      <div className="text-2xl font-black leading-tight">{value}</div>
    </div>
  );
}

function MiniBentoStat({
  icon: Icon,
  label,
  value,
  color,
  delay,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "indigo" | "emerald" | "sky" | "fuchsia";
  delay: number;
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
        <div className="mt-1 text-3xl font-black text-white">{value}</div>
      </Card3D>
    </motion.div>
  );
}

function NfCard({
  row,
  onEdit,
  onToggleEmitida,
  onToggleEnviada,
}: {
  row: Row;
  onEdit: () => void;
  onToggleEmitida: () => void;
  onToggleEnviada: () => void;
}) {
  const status = row.nf_emitida
    ? row.nf_enviada
      ? { label: "Emitida & Enviada", tone: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30" }
      : { label: "Emitida", tone: "bg-sky-400/15 text-sky-200 border-sky-400/30" }
    : { label: "Pendente", tone: "bg-amber-400/15 text-amber-200 border-amber-400/30" };

  return (
    <Card3D className="flex h-full flex-col p-5" glow intensity={6}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-white/5 text-indigo-300">
              <FileText className="h-3.5 w-3.5" />
            </span>
            {fmtDate(row.data_atendimento)}
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
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Nº NF</div>
          <div className="mt-1 truncate font-mono text-sm text-indigo-200">{row.nf_numero ?? "—"}</div>
        </div>
      </div>

      {row.tutor_cpf && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md bg-white/5 px-2 py-1 font-mono">{row.tutor_cpf}</span>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "h-8 gap-1.5 rounded-lg border-white/10 bg-white/[0.03]",
            row.nf_emitida
              ? "border-amber-400/30 text-amber-200 hover:bg-amber-400/10"
              : "border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10",
          )}
          onClick={onToggleEmitida}
        >
          {row.nf_emitida ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {row.nf_emitida ? "Reabrir" : "Emitir"}
        </Button>
        {row.nf_emitida && (
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-8 gap-1.5 rounded-lg border-white/10 bg-white/[0.03]",
              row.nf_enviada ? "text-sky-200" : "text-muted-foreground",
            )}
            onClick={onToggleEnviada}
          >
            <Send className="h-3.5 w-3.5" />
            {row.nf_enviada ? "Enviada" : "Marcar enviada"}
          </Button>
        )}
        <NfInlineFile row={row} />
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

function NfInlineFile({ row }: { row: Row }) {
  const qc = useQueryClient();
  const getFile = useServerFn(getStorageFile);
  const extract = useServerFn(extractNfFromFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const openPdf = async () => {
    if (!row.nf_pdf_path) return;
    const targetWindow = window.open("about:blank", "_blank");
    if (targetWindow) targetWindow.opener = null;
    try {
      const file = await getFile({ data: { bucket: "notas-fiscais", path: row.nf_pdf_path } });
      openBase64File(file, targetWindow);
    } catch (error) {
      targetWindow?.close();
      toast.error("Erro ao abrir NF", { description: (error as Error).message });
    }
  };

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const key = `nf/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("notas-fiscais").upload(key, file, { contentType: file.type || "application/pdf" });
      if (up.error) throw up.error;
      const today = new Date().toISOString().slice(0, 10);
      const update: {
        nf_pdf_path: string;
        nf_emitida: boolean;
        nf_numero?: string;
        tutor_cpf?: string;
        pago?: boolean;
        data_pagamento?: string;
        valor_recebido?: number;
      } = { nf_pdf_path: key, nf_emitida: true };
      try {
        const base64 = await fileToBase64(file);
        const extracted = await extract({
          data: { filename: file.name, mimeType: file.type || "application/pdf", base64 },
        });
        Object.assign(update, mergeExtractedNf(row, extracted));
        if (extracted.nf_numero || extracted.tutor_cpf) toast.success("Dados extraídos automaticamente da NF.");
      } catch (err) {
        toast.warning("NF anexada, sem extração.", { description: (err as Error).message });
      }
      // Auto-baixa financeira: se ainda não estava paga, marca como paga com o valor do atendimento
      const { data: current } = await supabase
        .from("appointments")
        .select("pago,valor,valor_recebido,data_pagamento")
        .eq("id", row.id)
        .maybeSingle();
      if (current && !current.pago) {
        update.pago = true;
        update.data_pagamento = current.data_pagamento ?? today;
        update.valor_recebido = current.valor_recebido ?? current.valor ?? 0;
      }
      const { error } = await supabase.from("appointments").update(update).eq("id", row.id);
      if (error) throw error;
      toast.success("NF anexada, emitida e baixa financeira realizada.");
      qc.invalidateQueries({ queryKey: ["nf-list"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["pendencias"] });
      qc.invalidateQueries({ queryKey: ["recebimentos"] });
    } catch (e) {
      toast.error("Erro ao anexar", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };


  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
      {row.nf_pdf_path ? (
        <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-white/10 bg-white/[0.03]" onClick={openPdf}>
          <FileText className="h-3.5 w-3.5" /> Abrir
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-lg border-white/10 bg-white/[0.03]"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" /> {busy ? "Enviando…" : "Anexar"}
        </Button>
      )}
    </>
  );
}

function FileField({
  label,
  path,
  prefix,
  onChange,
  onExtract,
}: {
  label: string;
  path: string | null;
  prefix: string;
  onChange: (p: string | null) => void;
  onExtract?: (x: { nf_numero: string | null; tutor_cpf: string | null }) => void;
}) {
  const getFile = useServerFn(getStorageFile);
  const extract = useServerFn(extractNfFromFile);
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
      if (onExtract) {
        try {
          const base64 = await fileToBase64(file);
          const extracted = await extract({
            data: { filename: file.name, mimeType: file.type || "application/pdf", base64 },
          });
          onExtract(extracted);
          if (extracted.nf_numero || extracted.tutor_cpf) toast.success("Dados extraídos da NF.");
        } catch (err) {
          toast.warning("Não foi possível extrair dados.", { description: (err as Error).message });
        }
      }
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
