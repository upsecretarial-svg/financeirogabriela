import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStorageFile } from "@/lib/storage-file.functions";
import { extractPayableFromPdf } from "@/lib/payables-extract.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableState } from "@/components/data-state";
import {
  Search, Plus, Sparkles, Paperclip, FileText, Check, X, Pencil, Trash2, Download,
  AlertTriangle, Clock, Wallet, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { exportCSV, exportXLSX } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar" }] }),
  component: Page,
});

interface Payable {
  id: string;
  fornecedor: string;
  descricao: string | null;
  categoria: string | null;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: "pendente" | "pago" | "vencido" | "agendado" | "cancelado";
  codigo_barras: string | null;
  anexo_path: string | null;
  observacoes: string | null;
  paid_by_name: string | null;
  created_at: string;
}

const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const emptyForm: Omit<Payable, "id" | "created_at" | "paid_by_name" | "status"> & { id?: string; status?: Payable["status"] } = {
  fornecedor: "",
  descricao: "",
  categoria: "",
  valor: 0,
  data_vencimento: new Date().toISOString().slice(0, 10),
  data_pagamento: null,
  codigo_barras: "",
  anexo_path: null,
  observacoes: "",
};

function openBase64File(file: { base64: string; contentType: string; filename: string }, targetWindow: Window | null) {
  const bytes = atob(file.base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: file.contentType });
  const url = URL.createObjectURL(blob);
  if (targetWindow) targetWindow.location.href = url;
  else {
    const a = document.createElement("a");
    a.href = url; a.download = file.filename; a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function StatusBadge({ status }: { status: Payable["status"] }) {
  const map: Record<Payable["status"], { label: string; cls: string }> = {
    pendente: { label: "Pendente", cls: "bg-warning/15 text-warning border-warning/30" },
    pago: { label: "Pago", cls: "bg-success/15 text-success border-success/30" },
    vencido: { label: "Vencido", cls: "bg-destructive/15 text-destructive border-destructive/30" },
    agendado: { label: "Agendado", cls: "bg-primary/15 text-primary border-primary/30" },
    cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
  };
  const s = map[status];
  return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
}

function Page() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Payable["status"]>("all");
  const [edit, setEdit] = useState<typeof emptyForm | null>(null);
  const [extracting, setExtracting] = useState(false);
  const extractRef = useRef<HTMLInputElement>(null);
  const getFile = useServerFn(getStorageFile);
  const extractFn = useServerFn(extractPayableFromPdf);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["payables", search, statusFilter],
    queryFn: async () => {
      let q = supabase.from("payables")
        .select("*")
        .is("deleted_at", null)
        .order("data_vencimento", { ascending: true })
        .limit(500);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (search) q = q.or(`fornecedor.ilike.%${search}%,descricao.ilike.%${search}%,categoria.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Payable[];
    },
  });

  const kpis = useMemo(() => {
    const rows = data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const pend = rows.filter((r) => r.status !== "pago" && r.status !== "cancelado");
    return {
      totalAberto: pend.reduce((s, r) => s + Number(r.valor), 0),
      vencidas: pend.filter((r) => r.data_vencimento < today).length,
      vencidasValor: pend.filter((r) => r.data_vencimento < today).reduce((s, r) => s + Number(r.valor), 0),
      proximas: pend.filter((r) => r.data_vencimento >= today && r.data_vencimento <= in30).length,
      pagoMes: rows.filter((r) => r.status === "pago" && (r.data_pagamento ?? "").slice(0, 7) === today.slice(0, 7))
        .reduce((s, r) => s + Number(r.valor), 0),
    };
  }, [data]);

  const save = useMutation({
    mutationFn: async (row: typeof emptyForm) => {
      const payload = {
        fornecedor: row.fornecedor,
        descricao: row.descricao || null,
        categoria: row.categoria || null,
        valor: Number(row.valor) || 0,
        data_vencimento: row.data_vencimento,
        data_pagamento: row.data_pagamento || null,
        codigo_barras: row.codigo_barras || null,
        anexo_path: row.anexo_path,
        observacoes: row.observacoes || null,
        status: row.status,
      };
      if (row.id) {
        const { error } = await supabase.from("payables").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("payables").insert({ ...payload, created_by: u.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payables"] });
      toast.success("Conta salva.");
      setEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async (row: Payable) => {
      const isPaid = row.status === "pago";
      const { error } = await supabase.from("payables")
        .update({ data_pagamento: isPaid ? null : new Date().toISOString().slice(0, 10) })
        .eq("id", row.id);
      if (error) throw error;
      return !isPaid;
    },
    onSuccess: (paid) => {
      qc.invalidateQueries({ queryKey: ["payables"] });
      toast.success(paid ? "Marcada como paga." : "Pagamento revertido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payables").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payables"] });
      toast.success("Conta removida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

      const ext = file.name.split(".").pop() || "pdf";
      const key = `boletos/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("contas-pagar").upload(key, file, { contentType: file.type || "application/pdf" });
      if (up.error) throw up.error;

      setEdit({
        ...emptyForm,
        fornecedor: extracted.fornecedor ?? "",
        descricao: extracted.descricao ?? "",
        valor: extracted.valor ?? 0,
        data_vencimento: extracted.data_vencimento ?? emptyForm.data_vencimento,
        codigo_barras: extracted.codigo_barras ?? "",
        anexo_path: key,
      });
      toast.success("Dados extraídos. Confirme e salve.");
    } catch (e) {
      toast.error("Falha ao extrair PDF", { description: (e as Error).message });
    } finally {
      setExtracting(false);
    }
  };

  const openAttachment = async (path: string) => {
    const w = window.open("about:blank", "_blank");
    if (w) w.opener = null;
    try {
      const f = await getFile({ data: { bucket: "contas-pagar", path } });
      openBase64File(f, w);
    } catch (e) {
      w?.close();
      toast.error("Erro ao abrir arquivo", { description: (e as Error).message });
    }
  };

  const exportData = (format: "csv" | "xlsx") => {
    const rows = (data ?? []).map((r) => ({
      Fornecedor: r.fornecedor,
      Descricao: r.descricao ?? "",
      Categoria: r.categoria ?? "",
      Valor: Number(r.valor).toFixed(2),
      Vencimento: r.data_vencimento,
      Pagamento: r.data_pagamento ?? "",
      Status: r.status,
      "Codigo de Barras": r.codigo_barras ?? "",
      "Pago por": r.paid_by_name ?? "",
    }));
    if (format === "csv") exportCSV("contas-a-pagar", rows);
    else exportXLSX("contas-a-pagar", rows);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contas a Pagar</h1>
          <p className="text-sm text-muted-foreground">Gestão executiva e operacional de contas, boletos e faturas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={extractRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onExtractPdf(f); e.target.value = ""; }}
          />
          <Button variant="outline" onClick={() => extractRef.current?.click()} disabled={extracting}>
            <Sparkles className="mr-2 h-4 w-4" />
            {extracting ? "Extraindo…" : "Extrair de PDF"}
          </Button>
          <Button onClick={() => setEdit({ ...emptyForm })}>
            <Plus className="mr-2 h-4 w-4" /> Nova conta
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Wallet} label="Total em aberto" value={brl(kpis.totalAberto)} tone="primary" />
        <KpiCard icon={AlertTriangle} label="Vencidas" value={`${kpis.vencidas} · ${brl(kpis.vencidasValor)}`} tone="destructive" />
        <KpiCard icon={Clock} label="Próximas 30 dias" value={String(kpis.proximas)} tone="warning" />
        <KpiCard icon={TrendingDown} label="Pago no mês" value={brl(kpis.pagoMes)} tone="success" />
      </div>

      <Card className="border-border/60">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Contas</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => exportData("csv")}>
                <Download className="mr-2 h-3.5 w-3.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportData("xlsx")}>
                <Download className="mr-2 h-3.5 w-3.5" /> Excel
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar fornecedor, descrição, categoria…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Pago por</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.data_vencimento}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{r.fornecedor}</div>
                    {r.descricao && <div className="text-xs text-muted-foreground truncate max-w-[240px]">{r.descricao}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{r.categoria ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{brl(r.valor)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs">{r.data_pagamento ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.paid_by_name ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={markPaid.isPending}
                        className={
                          r.status === "pago"
                            ? "h-8 gap-1.5 border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10"
                            : "h-8 gap-1.5 border-success/40 bg-success/10 text-success hover:bg-success/20"
                        }
                        onClick={() => markPaid.mutate(r)}
                      >
                        {r.status === "pago" ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        {r.status === "pago" ? "Reabrir" : "Pagar"}
                      </Button>
                      {r.anexo_path && (
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openAttachment(r.anexo_path!)}>
                          <FileText className="h-3.5 w-3.5" /> Abrir
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setEdit({
                        id: r.id, fornecedor: r.fornecedor, descricao: r.descricao ?? "", categoria: r.categoria ?? "",
                        valor: Number(r.valor), data_vencimento: r.data_vencimento, data_pagamento: r.data_pagamento,
                        codigo_barras: r.codigo_barras ?? "", anexo_path: r.anexo_path, observacoes: r.observacoes ?? "",
                        status: r.status,
                      })} title="Editar"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                        if (confirm(`Remover conta de ${r.fornecedor}?`)) remove.mutate(r.id);
                      }} title="Remover"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableState
                colSpan={8}
                isLoading={isLoading}
                isError={isError}
                error={error as Error | null}
                onRetry={() => refetch()}
                isEmpty={!isLoading && !isError && !data?.length}
                emptyIcon={Wallet}
                emptyTitle="Nenhuma conta"
                emptyDescription="Cadastre manualmente ou importe de um PDF."
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{edit?.id ? "Editar conta" : "Nova conta a pagar"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Fornecedor *</Label>
                <Input value={edit.fornecedor} onChange={(e) => setEdit({ ...edit, fornecedor: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Descrição</Label>
                <Input value={edit.descricao ?? ""} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input value={edit.categoria ?? ""} placeholder="Insumos, aluguel, energia…"
                  onChange={(e) => setEdit({ ...edit, categoria: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={edit.valor}
                  onChange={(e) => setEdit({ ...edit, valor: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input type="date" value={edit.data_vencimento}
                  onChange={(e) => setEdit({ ...edit, data_vencimento: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Data de pagamento</Label>
                <Input type="date" value={edit.data_pagamento ?? ""}
                  onChange={(e) => setEdit({ ...edit, data_pagamento: e.target.value || null })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Linha digitável / Código de barras</Label>
                <Input value={edit.codigo_barras ?? ""} className="font-mono text-xs"
                  onChange={(e) => setEdit({ ...edit, codigo_barras: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={edit.observacoes ?? ""}
                  onChange={(e) => setEdit({ ...edit, observacoes: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Anexo (boleto/comprovante)</Label>
                <PayableAttachment
                  path={edit.anexo_path}
                  onChange={(p) => setEdit({ ...edit, anexo_path: p })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button disabled={save.isPending || !edit?.fornecedor} onClick={() => edit && save.mutate(edit)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone }: {
  icon: typeof Wallet; label: string; value: string;
  tone: "primary" | "success" | "warning" | "destructive";
}) {
  const cls = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid h-10 w-10 place-items-center rounded-md ${cls}`}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function PayableAttachment({ path, onChange }: { path: string | null; onChange: (p: string | null) => void }) {
  const getFile = useServerFn(getStorageFile);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const key = `boletos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("contas-pagar").upload(key, file, { contentType: file.type || "application/pdf" });
      if (error) throw error;
      onChange(key);
      toast.success("Arquivo enviado.");
    } catch (e) {
      toast.error("Erro no upload", { description: (e as Error).message });
    } finally { setBusy(false); }
  };
  const view = async () => {
    if (!path) return;
    const w = window.open("about:blank", "_blank");
    if (w) w.opener = null;
    try {
      const f = await getFile({ data: { bucket: "contas-pagar", path } });
      openBase64File(f, w);
    } catch (e) {
      w?.close();
      toast.error("Erro ao abrir", { description: (e as Error).message });
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
      <Paperclip className="h-4 w-4 text-muted-foreground" />
      <Input type="file" accept="application/pdf,image/*" disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      {path && (
        <>
          <Button type="button" size="sm" variant="outline" onClick={view}>Visualizar</Button>
          <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onChange(null)}>Remover</Button>
        </>
      )}
    </div>
  );
}
