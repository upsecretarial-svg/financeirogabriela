import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStorageFile } from "@/lib/storage-file.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Pencil, Check, X, FileDown, FileSpreadsheet, FileText, Wallet, Receipt } from "lucide-react";
import { TableState } from "@/components/data-state";
import { exportCSV, exportXLSX, exportPDF } from "@/lib/export";
import { generateReceiptPDF } from "@/lib/receipt";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recebimentos")({
  head: () => ({ meta: [{ title: "Recebimentos" }] }),
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

const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function openBase64File(file: { base64: string; contentType: string; filename: string }, targetWindow: Window | null) {
  const byteCharacters = atob(file.base64);
  const byteNumbers = new Array(byteCharacters.length);

  for (let index = 0; index < byteCharacters.length; index += 1) {
    byteNumbers[index] = byteCharacters.charCodeAt(index);
  }

  const blob = new Blob([new Uint8Array(byteNumbers)], { type: file.contentType });
  const url = URL.createObjectURL(blob);

  if (targetWindow) {
    targetWindow.location.href = url;
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Page() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "paid">("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [edit, setEdit] = useState<Row | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["receb-list", search, filter, methodFilter, from, to],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("id,numero_interno,tutor,tutor_cpf,pet,data_atendimento,valor,valor_recebido,data_pagamento,payment_method_id,pago,obs_financeiras,comprovante_path,paid_by_name,paid_at,nf_numero,status,clinics(nome),payment_methods(nome)")
        .is("deleted_at", null)
        .order("data_atendimento", { ascending: false })
        .limit(1000);
      if (filter === "open") q = q.eq("pago", false);
      if (filter === "paid") q = q.eq("pago", true);
      if (methodFilter !== "all") {
        if (methodFilter === "none") q = q.is("payment_method_id", null);
        else q = q.eq("payment_method_id", methodFilter);
      }
      if (from) q = q.gte("data_atendimento", from);
      if (to) q = q.lte("data_atendimento", to);
      if (search) q = q.or(`tutor.ilike.%${search}%,pet.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const { data: methods } = useQuery({
    queryKey: ["payment-methods-active"],
    queryFn: async () => (await supabase.from("payment_methods").select("*").eq("ativo", true).order("nome")).data ?? [],
  });

  const totals = (data ?? []).reduce(
    (acc, r) => {
      acc.qtd += 1;
      acc.valor += Number(r.valor ?? 0);
      acc.recebido += Number(r.valor_recebido ?? 0);
      if (!r.pago) acc.aberto += Number(r.valor ?? 0);
      return acc;
    },
    { qtd: 0, valor: 0, recebido: 0, aberto: 0 },
  );

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recebimentos</h1>
          <p className="text-sm text-muted-foreground">Histórico completo de pagamentos e comprovantes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(filename, exportRows)} disabled={!exportRows.length}>
            <FileDown className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportXLSX(filename, exportRows)} disabled={!exportRows.length}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={onPDF} disabled={!exportRows.length}>
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-border/60"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Atendimentos</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{totals.qtd}</CardContent></Card>
        <Card className="border-border/60"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Faturado</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{brl(totals.valor)}</CardContent></Card>
        <Card className="border-border/60"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Recebido</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-success">{brl(totals.recebido)}</CardContent></Card>
        <Card className="border-border/60"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em aberto</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-destructive">{brl(totals.aberto)}</CardContent></Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Atendimentos</CardTitle>
            <div className="flex gap-2">
              {(["all", "open", "paid"] as const).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                  {f === "all" ? "Todos" : f === "open" ? "Em aberto" : "Pagos"}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar tutor ou pet…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" aria-label="Forma de pagamento">
                <SelectValue placeholder="Forma de pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as formas</SelectItem>
                <SelectItem value="none">Sem forma definida</SelectItem>
                {methods?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tutor / Pet</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead>Pago em</TableHead>
                <TableHead>Baixa por</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.data_atendimento}</TableCell>
                  <TableCell className="text-sm"><div className="font-medium">{r.tutor}</div><div className="text-xs text-muted-foreground">{r.pet}</div></TableCell>
                  <TableCell className="text-right text-sm font-medium">{brl(r.valor)}</TableCell>
                  <TableCell className="text-right text-sm">{brl(r.valor_recebido)}</TableCell>
                  <TableCell className="text-sm">{r.data_pagamento ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {r.paid_by_name ? (
                      <span className="font-medium">{r.paid_by_name}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.pago ? (
                      <Badge className="bg-success/15 text-success border-success/30" variant="outline"><Check className="mr-1 h-3 w-3" />Pago</Badge>
                    ) : (
                      <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline"><X className="mr-1 h-3 w-3" />Em aberto</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={togglePago.isPending}
                        className={
                          r.pago
                            ? "h-8 gap-1.5 border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10"
                            : "h-8 gap-1.5 border-success/40 bg-success/10 text-success hover:bg-success/20"
                        }
                        onClick={() => togglePago.mutate(r)}
                      >
                        {r.pago ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        {r.pago ? "Reabrir" : "Marcar pago"}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        title="Gerar recibo PDF"
                        disabled={!r.pago}
                        onClick={() =>
                          generateReceiptPDF({
                            numero: r.numero_interno ?? r.id.slice(0, 8),
                            tutor: r.tutor,
                            cpf: r.tutor_cpf,
                            pet: r.pet,
                            clinica: r.clinics?.nome ?? null,
                            valor: Number(r.valor ?? 0),
                            valorRecebido: Number(r.valor_recebido ?? r.valor ?? 0),
                            dataPagamento: r.data_pagamento,
                            formaPagamento: r.payment_methods?.nome ?? null,
                            baixaPor: r.paid_by_name,
                            observacoes: r.obs_financeiras,
                          }).catch((e: Error) => toast.error("Falha ao gerar recibo", { description: e.message }))
                        }
                      >
                        <Receipt className="h-4 w-4" />
                      </Button>

                      <Button variant="ghost" size="icon" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
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
                emptyTitle="Sem recebimentos no período"
                emptyDescription="Ajuste o intervalo de datas ou os filtros para visualizar lançamentos."
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>Recebimento — {edit?.tutor} / {edit?.pet}</DialogTitle></DialogHeader>
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
                <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
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
    <div className="space-y-2 rounded-md border border-dashed p-4">
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
