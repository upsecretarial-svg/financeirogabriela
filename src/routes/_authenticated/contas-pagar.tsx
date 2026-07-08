import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStorageFile } from "@/lib/storage-file.functions";
import { extractPayableFromPdf } from "@/lib/payables-extract.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableState } from "@/components/data-state";
import { Plus, Sparkles, FileText, Check, Undo2, Pencil, Trash2, Wallet, AlertTriangle, CheckCircle2, Repeat, DollarSign } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar" }] }),
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

const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const today = () => new Date().toISOString().slice(0, 10);

const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, d));
  return dt.toISOString().slice(0, 10);
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
  fornecedor: "",
  descricao: "",
  valor: 0,
  data_vencimento: today(),
  data_pagamento: null,
  anexo_path: null,
  recurrenceMode: "none",
  recurrenceMonths: 3,
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

function StatusBadge({ status }: { status: Payable["status"] }) {
  const map = {
    pendente: "bg-warning/15 text-warning border-warning/30",
    pago: "bg-success/15 text-success border-success/30",
    vencido: "bg-destructive/15 text-destructive border-destructive/30",
    agendado: "bg-primary/15 text-primary border-primary/30",
    cancelado: "bg-muted text-muted-foreground border-border",
  } as const;
  const label = { pendente: "A pagar", pago: "Pago", vencido: "Vencida", agendado: "Agendada", cancelado: "Cancelada" }[status];
  return <Badge variant="outline" className={map[status]}>{label}</Badge>;
}

function Page() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<FormState | null>(null);
  const [payDialog, setPayDialog] = useState<Payable | null>(null);
  const [payMethodId, setPayMethodId] = useState<string>("");
  const [payDate, setPayDate] = useState<string>(today());
  const [extracting, setExtracting] = useState(false);
  const extractRef = useRef<HTMLInputElement>(null);
  const getFile = useServerFn(getStorageFile);
  const extractFn = useServerFn(extractPayableFromPdf);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["payables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payables")
        .select("id,fornecedor,descricao,valor,data_vencimento,data_pagamento,status,anexo_path,paid_by_name,payment_method_id,recorrente,recorrencia_parcela,recorrencia_total")
        .is("deleted_at", null)
        .order("data_vencimento", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Payable[];
    },
  });

  const { data: methods } = useQuery({
    queryKey: ["payment_methods_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id,nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as PaymentMethod[];
    },
  });

  const kpis = useMemo(() => {
    const rows = data ?? [];
    const t = today();
    const pend = rows.filter((r) => r.status !== "pago" && r.status !== "cancelado");
    const totalGeral = rows.filter((r) => r.status !== "cancelado").reduce((s, r) => s + Number(r.valor), 0);
    return {
      aberto: pend.reduce((s, r) => s + Number(r.valor), 0),
      totalGeral,
      vencidas: pend.filter((r) => r.data_vencimento < t).length,
      pagas: rows.filter((r) => r.status === "pago").length,
    };
  }, [data]);

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
          .update({ ...base, data_vencimento: row.data_vencimento })
          .eq("id", row.id);
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
        created_by,
        recorrente: true,
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
        .update({ data_pagamento: date, payment_method_id: method })
        .eq("id", id);
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
        .update({ data_pagamento: null, payment_method_id: null })
        .eq("id", id);
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Contas a Pagar</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre os boletos e despesas da clínica, acompanhe vencimentos e marque como pago quando quitar.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={DollarSign} tone="primary" label="Total geral" value={brl(kpis.totalGeral)} />
        <Kpi icon={Wallet} tone="warning" label="Total a pagar" value={brl(kpis.aberto)} />
        <Kpi icon={AlertTriangle} tone="destructive" label="Vencidas" value={String(kpis.vencidas)} />
        <Kpi icon={CheckCircle2} tone="success" label="Pagas" value={String(kpis.pagas)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEdit({ ...emptyForm })}>
          <Plus className="mr-2 h-4 w-4" /> Nova conta
        </Button>
        <input
          ref={extractRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onExtractPdf(f); e.target.value = ""; }}
        />
        <Button variant="outline" onClick={() => extractRef.current?.click()} disabled={extracting}>
          <Sparkles className="mr-2 h-4 w-4" />
          {extracting ? "Lendo boleto…" : "Ler boleto (PDF)"}
        </Button>
      </div>

      <Card className="border-border/60">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pago em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.data_vencimento.split("-").reverse().join("/")}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{r.fornecedor}</span>
                      {r.recorrente && (
                        <Badge variant="outline" className="h-5 gap-1 border-primary/30 bg-primary/10 px-1.5 text-[10px] text-primary">
                          <Repeat className="h-2.5 w-2.5" />
                          {r.recorrencia_parcela && r.recorrencia_total
                            ? `${r.recorrencia_parcela}/${r.recorrencia_total}`
                            : "Fixa"}
                        </Badge>
                      )}
                    </div>
                    {r.descricao && <div className="text-xs text-muted-foreground truncate max-w-[280px]">{r.descricao}</div>}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">{brl(r.valor)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs">{r.data_pagamento ? r.data_pagamento.split("-").reverse().join("/") : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.status === "pago" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reopen.isPending}
                          className="h-8 gap-1.5 border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10"
                          onClick={() => reopen.mutate(r.id)}
                        >
                          <Undo2 className="h-3.5 w-3.5" /> Reabrir
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 bg-success text-success-foreground hover:bg-success/90"
                          onClick={() => openPay(r)}
                        >
                          <Check className="h-3.5 w-3.5" /> Pagar
                        </Button>
                      )}
                      {r.anexo_path && (
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openAttachment(r.anexo_path!)}>
                          <FileText className="h-3.5 w-3.5" /> Boleto
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Editar"
                        onClick={() => setEdit({
                          id: r.id, fornecedor: r.fornecedor, descricao: r.descricao ?? "",
                          valor: Number(r.valor), data_vencimento: r.data_vencimento,
                          data_pagamento: r.data_pagamento, anexo_path: r.anexo_path,
                          recurrenceMode: "none", recurrenceMonths: 3,
                        })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" title="Remover"
                        onClick={() => { if (confirm(`Remover conta de ${r.fornecedor}?`)) remove.mutate(r.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableState
                colSpan={6}
                isLoading={isLoading}
                isError={isError}
                error={error as Error | null}
                onRetry={() => refetch()}
                isEmpty={!isLoading && !isError && !data?.length}
                emptyIcon={Wallet}
                emptyTitle="Nenhuma conta cadastrada"
                emptyDescription="Clique em 'Nova conta' ou 'Ler boleto (PDF)' para começar."
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar conta" : "Nova conta a pagar"}</DialogTitle>
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
                <div className="space-y-3 rounded-md border border-border/60 bg-muted/30 p-3">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Repeat className="h-4 w-4" /> Recorrência
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <RecOption
                      active={edit.recurrenceMode === "none"}
                      onClick={() => setEdit({ ...edit, recurrenceMode: "none" })}
                      label="Única"
                      desc="Só esta conta"
                    />
                    <RecOption
                      active={edit.recurrenceMode === "fixed"}
                      onClick={() => setEdit({ ...edit, recurrenceMode: "fixed" })}
                      label="Fixa mensal"
                      desc="12 meses"
                    />
                    <RecOption
                      active={edit.recurrenceMode === "installments"}
                      onClick={() => setEdit({ ...edit, recurrenceMode: "installments" })}
                      label="Parcelada"
                      desc="Nº parcelas"
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

      <Dialog open={!!payDialog} onOpenChange={(v) => !v && setPayDialog(null)}>
        <DialogContent className="max-w-md">
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
              className="bg-success text-success-foreground hover:bg-success/90"
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

function RecOption({ active, onClick, label, desc }: { active: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-2 text-left text-xs transition ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
      }`}
    >
      <div className="font-medium">{label}</div>
      <div className="text-[10px] text-muted-foreground">{desc}</div>
    </button>
  );
}

function Kpi({ icon: Icon, label, value, tone }: {
  icon: typeof Wallet; label: string; value: string;
  tone: "primary" | "success" | "destructive" | "warning";
}) {
  const cls = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
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
