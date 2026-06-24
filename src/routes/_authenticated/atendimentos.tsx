import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  head: () => ({ meta: [{ title: "Atendimentos" }] }),
  component: Atendimentos,
});

interface AppointmentRow {
  id: string;
  numero_interno: string | null;
  tutor: string;
  pet: string;
  data_atendimento: string;
  valor: number | null;
  pago: boolean;
  nf_emitida: boolean;
  status: string;
  clinic_id: string | null;
  payment_method_id: string | null;
  observacoes: string | null;
  obs_financeiras: string | null;
  valor_recebido: number | null;
  data_pagamento: string | null;
  nf_numero: string | null;
  nf_pdf_path: string | null;
  comprovante_path: string | null;
}

function brl(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Atendimentos() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<AppointmentRow> | null>(null);
  const [open, setOpen] = useState(false);

  const { data: appts, isLoading } = useQuery({
    queryKey: ["appointments", search],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("*, clinics(nome), payment_methods(nome)")
        .order("data_atendimento", { ascending: false })
        .limit(200);
      if (search) {
        q = q.or(`tutor.ilike.%${search}%,pet.ilike.%${search}%,numero_interno.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clinics } = useQuery({
    queryKey: ["clinics-active"],
    queryFn: async () => (await supabase.from("clinics").select("*").eq("ativo", true).order("nome")).data ?? [],
  });
  const { data: methods } = useQuery({
    queryKey: ["payment-methods-active"],
    queryFn: async () => (await supabase.from("payment_methods").select("*").eq("ativo", true).order("nome")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (row: Partial<AppointmentRow>) => {
      if (!row.tutor || !row.pet || !row.data_atendimento) {
        throw new Error("Preencha tutor, pet e data.");
      }
      const payload = {
        tutor: row.tutor,
        pet: row.pet,
        data_atendimento: row.data_atendimento,
        clinic_id: row.clinic_id || null,
        payment_method_id: row.payment_method_id || null,
        valor: row.valor ?? null,
        valor_recebido: row.valor_recebido ?? null,
        data_pagamento: row.data_pagamento || null,
        pago: !!row.pago,
        nf_emitida: !!row.nf_emitida,
        nf_numero: row.nf_numero || null,
        observacoes: row.observacoes || null,
        obs_financeiras: row.obs_financeiras || null,
      };
      if (row.id) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("appointments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["pendencias-recent"] });
      toast.success("Atendimento salvo.");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Atendimento excluído.");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const startNew = () => {
    setEditing({
      tutor: "",
      pet: "",
      data_atendimento: new Date().toISOString().slice(0, 10),
      pago: false,
      nf_emitida: false,
    });
    setOpen(true);
  };

  const startEdit = (row: AppointmentRow) => {
    setEditing(row);
    setOpen(true);
  };

  const statusColor: Record<string, string> = {
    finalizado: "bg-success/15 text-success",
    pago: "bg-success/15 text-success",
    nf_pendente: "bg-warning/15 text-warning-foreground",
    aguardando_pagamento: "bg-accent text-accent-foreground",
    sem_valor: "bg-destructive/15 text-destructive",
    realizado: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Atendimentos</h1>
          <p className="text-sm text-muted-foreground">Cadastre e acompanhe atendimentos clínicos.</p>
        </div>
        <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" /> Novo atendimento</Button>
      </header>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por tutor, pet ou nº..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Tutor / Pet</TableHead>
                <TableHead>Clínica</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : !appts?.length ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Nenhum atendimento.</TableCell></TableRow>
              ) : (
                appts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.numero_interno}</TableCell>
                    <TableCell className="text-sm">{a.data_atendimento}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{a.tutor}</div>
                      <div className="text-xs text-muted-foreground">{a.pet}</div>
                    </TableCell>
                    <TableCell className="text-sm">{(a as any).clinics?.nome ?? <span className="text-destructive">—</span>}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{a.valor ? brl(Number(a.valor)) : <span className="text-destructive">—</span>}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`capitalize ${statusColor[a.status] ?? ""}`}>
                        {a.status.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(a as AppointmentRow)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => confirm("Excluir atendimento?") && del.mutate(a.id)}
                        >
                          Excluir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar atendimento" : "Novo atendimento"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(editing);
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tutor *</Label>
                  <Input value={editing.tutor ?? ""} onChange={(e) => setEditing({ ...editing, tutor: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Pet *</Label>
                  <Input value={editing.pet ?? ""} onChange={(e) => setEditing({ ...editing, pet: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Data do atendimento *</Label>
                  <Input
                    type="date"
                    value={editing.data_atendimento ?? ""}
                    onChange={(e) => setEditing({ ...editing, data_atendimento: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Clínica</Label>
                  <Select
                    value={editing.clinic_id ?? ""}
                    onValueChange={(v) => setEditing({ ...editing, clinic_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {clinics?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={editing.valor ?? ""}
                    onChange={(e) => setEditing({ ...editing, valor: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <Select
                    value={editing.payment_method_id ?? ""}
                    onValueChange={(v) => setEditing({ ...editing, payment_method_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {methods?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data de pagamento</Label>
                  <Input
                    type="date"
                    value={editing.data_pagamento ?? ""}
                    onChange={(e) => setEditing({ ...editing, data_pagamento: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor recebido (R$)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={editing.valor_recebido ?? ""}
                    onChange={(e) => setEditing({ ...editing, valor_recebido: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <Label htmlFor="pago">Pago</Label>
                  <Switch id="pago" checked={!!editing.pago} onCheckedChange={(v) => setEditing({ ...editing, pago: v })} />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <Label htmlFor="nf">NF emitida</Label>
                  <Switch id="nf" checked={!!editing.nf_emitida} onCheckedChange={(v) => setEditing({ ...editing, nf_emitida: v })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nº da NF</Label>
                  <Input value={editing.nf_numero ?? ""} onChange={(e) => setEditing({ ...editing, nf_numero: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Observações</Label>
                  <Textarea value={editing.observacoes ?? ""} onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Observações financeiras</Label>
                  <Textarea value={editing.obs_financeiras ?? ""} onChange={(e) => setEditing({ ...editing, obs_financeiras: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
