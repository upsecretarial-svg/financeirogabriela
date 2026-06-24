import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Search, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recebimentos")({
  head: () => ({ meta: [{ title: "Recebimentos" }] }),
  component: Page,
});

interface Row {
  id: string;
  tutor: string;
  pet: string;
  data_atendimento: string;
  valor: number | null;
  valor_recebido: number | null;
  data_pagamento: string | null;
  payment_method_id: string | null;
  pago: boolean;
  obs_financeiras: string | null;
  comprovante_path: string | null;
}

const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "paid">("all");
  const [edit, setEdit] = useState<Row | null>(null);

  const { data } = useQuery({
    queryKey: ["receb-list", search, filter],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("id,tutor,pet,data_atendimento,valor,valor_recebido,data_pagamento,payment_method_id,pago,obs_financeiras,comprovante_path")
        .is("deleted_at", null)
        .order("data_atendimento", { ascending: false })
        .limit(300);
      if (filter === "open") q = q.eq("pago", false);
      if (filter === "paid") q = q.eq("pago", true);
      if (search) q = q.or(`tutor.ilike.%${search}%,pet.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: methods } = useQuery({
    queryKey: ["payment-methods-active"],
    queryFn: async () => (await supabase.from("payment_methods").select("*").eq("ativo", true).order("nome")).data ?? [],
  });

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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Recebimentos</h1>
        <p className="text-sm text-muted-foreground">Controle de pagamentos e comprovantes.</p>
      </header>

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
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar tutor ou pet…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                        variant={r.pago ? "outline" : "default"}
                        disabled={togglePago.isPending}
                        className={
                          r.pago
                            ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                            : "bg-success text-success-foreground hover:bg-success/90"
                        }
                        onClick={() => togglePago.mutate(r)}
                      >
                        {r.pago ? "Marcar em aberto" : "Marcar pago"}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>

                </TableRow>
              ))}
              {!data?.length && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Nenhum atendimento.</TableCell></TableRow>
              )}
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
    const { data, error } = await supabase.storage.from("notas-fiscais").createSignedUrl(path, 60);
    if (error) return toast.error("Erro ao abrir arquivo");
    window.open(data.signedUrl, "_blank");
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
