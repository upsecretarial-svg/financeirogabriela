import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStorageFile } from "@/lib/storage-file.functions";
import { extractNfFromFile } from "@/lib/nf-extract.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Pencil, Check, X, Paperclip, FileText, FileSearch } from "lucide-react";
import { TableState } from "@/components/data-state";

import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notas-fiscais")({
  head: () => ({ meta: [{ title: "Notas Fiscais" }] }),
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
  const [filter, setFilter] = useState<"all" | "pending" | "issued">("all");
  const [edit, setEdit] = useState<Row | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["nf-list", search, filter],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("id,numero_interno,tutor,tutor_cpf,pet,data_atendimento,valor,nf_emitida,nf_enviada,nf_numero,nf_pdf_path")
        .is("deleted_at", null)
        .order("data_atendimento", { ascending: false })
        .limit(300);
      if (filter === "pending") q = q.eq("nf_emitida", false);
      if (filter === "issued") q = q.eq("nf_emitida", true);
      if (search) q = q.or(`tutor.ilike.%${search}%,pet.ilike.%${search}%,nf_numero.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const save = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase
        .from("appointments")
        .update({
          nf_numero: row.nf_numero || null,
          nf_emitida: row.nf_emitida,
          nf_enviada: row.nf_enviada,
          nf_pdf_path: row.nf_pdf_path || null,
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


  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Notas Fiscais</h1>
        <p className="text-sm text-muted-foreground">Emissão e envio de NF dos atendimentos.</p>
      </header>

      <Card className="border-border/60">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Atendimentos</CardTitle>
            <div className="flex gap-2">
              {(["all", "pending", "issued"] as const).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                  {f === "all" ? "Todos" : f === "pending" ? "Pendentes" : "Emitidas"}
                </Button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar tutor, pet ou nº NF…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tutor / Pet</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Nº NF</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.data_atendimento}</TableCell>
                  <TableCell className="text-sm"><div className="font-medium">{r.tutor}</div><div className="text-xs text-muted-foreground">{r.pet}</div></TableCell>
                  <TableCell className="font-mono text-xs">{r.tutor_cpf ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{brl(r.valor)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.nf_numero ?? "—"}</TableCell>
                  <TableCell>
                    {r.nf_emitida ? (
                      <Badge className="bg-success/15 text-success border-success/30" variant="outline">
                        {r.nf_enviada ? "Emitida e enviada" : "Emitida"}
                      </Badge>
                    ) : (
                      <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">
                        Pendente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggleEmitida.isPending}
                        className={
                          r.nf_emitida
                            ? "h-8 gap-1.5 border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10"
                            : "h-8 gap-1.5 border-success/40 bg-success/10 text-success hover:bg-success/20"
                        }
                        onClick={() => toggleEmitida.mutate(r)}
                      >
                        {r.nf_emitida ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        {r.nf_emitida ? "Reabrir" : "Marcar emitida"}
                      </Button>
                      <NfInlineFile row={r} />
                      <Button variant="ghost" size="icon" onClick={() => setEdit(r)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>


                </TableRow>
              ))}
              <TableState
                colSpan={7}
                isLoading={isLoading}
                isError={isError}
                error={error as Error | null}
                onRetry={() => refetch()}
                isEmpty={!isLoading && !isError && !data?.length}
                emptyIcon={FileSearch}
                emptyTitle="Nenhuma nota fiscal"
                emptyDescription="Não há atendimentos para os filtros atuais."
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>NF — {edit?.tutor} / {edit?.pet}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nº da NF</Label>
                <Input value={edit.nf_numero ?? ""} onChange={(e) => setEdit({ ...edit, nf_numero: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>NF emitida</Label>
                <Switch checked={edit.nf_emitida} onCheckedChange={(v) => setEdit({ ...edit, nf_emitida: v })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>NF enviada</Label>
                <Switch checked={edit.nf_enviada} onCheckedChange={(v) => setEdit({ ...edit, nf_enviada: v })} />
              </div>
              <FileField
                label="PDF da Nota Fiscal"
                path={edit.nf_pdf_path}
                prefix="nf"
                onChange={(p) => setEdit({ ...edit, nf_pdf_path: p })}
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
      const update: {
        nf_pdf_path: string;
        nf_numero?: string;
        tutor_cpf?: string;
      } = { nf_pdf_path: key };
      try {
        const base64 = await fileToBase64(file);
        const extracted = await extract({
          data: { filename: file.name, mimeType: file.type || "application/pdf", base64 },
        });
        if (extracted.nf_numero && !row.nf_numero) update.nf_numero = extracted.nf_numero;
        if (extracted.tutor_cpf && !row.tutor_cpf) update.tutor_cpf = extracted.tutor_cpf;
        if (extracted.nf_numero || extracted.tutor_cpf) {
          toast.success("Dados extraídos automaticamente da NF.");
        }
      } catch (err) {
        toast.warning("NF anexada, mas não foi possível extrair os dados.", {
          description: (err as Error).message,
        });
      }
      const { error } = await supabase.from("appointments").update(update).eq("id", row.id);
      if (error) throw error;
      toast.success("NF anexada.");
      qc.invalidateQueries({ queryKey: ["nf-list"] });
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
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={openPdf}
          title="Abrir NF"
        >
          <FileText className="h-3.5 w-3.5" /> Abrir
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title="Anexar NF"
        >
          <Paperclip className="h-3.5 w-3.5" /> {busy ? "Enviando…" : "Anexar"}
        </Button>
      )}
    </>
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
