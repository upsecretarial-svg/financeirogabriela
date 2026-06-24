import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil, Check, X, Trash2 } from "lucide-react";

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
  nf_enviada: boolean;
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
  const navigate = useNavigate();
  const wasNewRef = useRef(false);
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<AppointmentRow> | null>(null);
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState<string>("");
  const [quickServiceOpen, setQuickServiceOpen] = useState(false);
  const [quickService, setQuickService] = useState<{ nome: string; valor: string }>({ nome: "", valor: "" });

  const { data: appts, isLoading } = useQuery({
    queryKey: ["appointments", search],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("*, clinics(nome), payment_methods(nome)")
        .is("deleted_at", null)
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
  const { data: services } = useQuery({
    queryKey: ["services-active"],
    queryFn: async () => (await supabase.from("services").select("*").eq("ativo", true).order("nome")).data ?? [],
  });

  const createService = useMutation({
    mutationFn: async () => {
      if (!quickService.nome.trim()) throw new Error("Informe o nome do serviço.");
      const valor = quickService.valor ? Number(quickService.valor) : 0;
      const { data, error } = await supabase
        .from("services")
        .insert({ nome: quickService.nome.trim(), valor, valor_final: valor, ativo: true })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["services-active"] });
      setServiceId(s.id);
      if (editing && (editing.valor == null || editing.valor === 0)) {
        setEditing({ ...editing, valor: Number(s.valor_final ?? s.valor ?? 0) });
      }
      setQuickService({ nome: "", valor: "" });
      setQuickServiceOpen(false);
      toast.success("Serviço criado.");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const syncServiceItem = async (appointmentId: string, svcId: string) => {
    await supabase.from("appointment_items").delete().eq("appointment_id", appointmentId).eq("tipo", "servico");
    if (!svcId) return;
    const svc = services?.find((s) => s.id === svcId);
    if (!svc) return;
    const valor = Number(svc.valor_final ?? svc.valor ?? 0);
    await supabase.from("appointment_items").insert({
      appointment_id: appointmentId,
      tipo: "servico",
      descricao: svc.nome,
      quantidade: 1,
      valor_unitario: valor,
      valor_total: valor,
    });
  };

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
        nf_enviada: !!row.nf_enviada,
        nf_numero: row.nf_numero || null,
        observacoes: row.observacoes || null,
        obs_financeiras: row.obs_financeiras || null,
        nf_pdf_path: row.nf_pdf_path || null,
        comprovante_path: row.comprovante_path || null,
      };
      if (row.id) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", row.id);
        if (error) throw error;
        await syncServiceItem(row.id, serviceId);
        wasNewRef.current = false;
        return { id: row.id, pago: !!row.pago };
      } else {
        const { data, error } = await supabase.from("appointments").insert(payload).select("id").single();
        if (error) throw error;
        await syncServiceItem(data.id, serviceId);
        wasNewRef.current = true;
        return { id: data.id as string, pago: !!row.pago };
      }
    },
    onSuccess: ({ id, pago }) => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["pendencias-recent"] });
      const isNew = wasNewRef.current;
      setOpen(false);
      setEditing(null);
      if (isNew) {
        if (pago) {
          toast.success("Atendimento salvo. Enviado para Notas Fiscais.");
          navigate({ to: "/notas-fiscais" });
        } else {
          toast.success("Atendimento salvo. Enviado para Pendências.");
          navigate({ to: "/pendencias" });
        }
      } else {
        toast.success("Atendimento atualizado.");
      }
      void id;
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
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
    setServiceId("");
    setOpen(true);
  };

  const startEdit = async (row: AppointmentRow) => {
    setEditing(row);
    const { data } = await supabase
      .from("appointment_items")
      .select("descricao")
      .eq("appointment_id", row.id)
      .eq("tipo", "servico")
      .maybeSingle();
    const matched = data ? services?.find((s) => s.nome === data.descricao) : null;
    setServiceId(matched?.id ?? "");
    setOpen(true);
  };

  const statusColor: Record<string, string> = {
    finalizado: "bg-success/15 text-success border-success/30",
    pago: "bg-success/15 text-success border-success/30",
    nf_pendente: "bg-warning/15 text-warning-foreground border-warning/30",
    aguardando_pagamento: "bg-accent text-accent-foreground",
    sem_valor: "bg-destructive/15 text-destructive border-destructive/30",
    realizado: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Atendimentos</h1>
          <p className="text-sm text-muted-foreground">Cadastre e acompanhe atendimentos clínicos.</p>
        </div>
        <Button onClick={startNew} size="lg" className="shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Novo atendimento
        </Button>
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
                <TableHead className="text-center">Pago?</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : !appts?.length ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Nenhum atendimento.</TableCell></TableRow>
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
                    <TableCell className="text-center">
                      {a.pago ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                          <Check className="h-3 w-3" /> Pago
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          <X className="h-3 w-3" /> Em aberto
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${statusColor[a.status] ?? ""}`}>
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
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? `Atendimento ${(editing as AppointmentRow).numero_interno ?? ""}` : "Novo atendimento"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tutor *</Label>
                  <Input value={editing.tutor ?? ""} onChange={(e) => setEditing({ ...editing, tutor: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Pet *</Label>
                  <Input value={editing.pet ?? ""} onChange={(e) => setEditing({ ...editing, pet: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={editing.data_atendimento ?? ""} onChange={(e) => setEditing({ ...editing, data_atendimento: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Clínica</Label>
                  <Select value={editing.clinic_id ?? ""} onValueChange={(v) => setEditing({ ...editing, clinic_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {clinics?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label>Serviço realizado</Label>
                    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setQuickServiceOpen(true)}>
                      <Plus className="mr-1 h-3 w-3" /> Novo serviço
                    </Button>
                  </div>
                  <Select
                    value={serviceId}
                    onValueChange={(v) => {
                      setServiceId(v);
                      const svc = services?.find((s) => s.id === v);
                      if (svc && editing && (editing.valor == null || editing.valor === 0)) {
                        setEditing({ ...editing, valor: Number(svc.valor_final ?? svc.valor ?? 0) });
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione um serviço…" /></SelectTrigger>
                    <SelectContent>
                      {services?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome} — {brl(Number(s.valor_final ?? s.valor ?? 0))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Valor (R$)</Label>
                  <Input type="number" step="0.01" min="0" value={editing.valor ?? ""} onChange={(e) => setEditing({ ...editing, valor: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Observações</Label>
                  <Textarea rows={3} value={editing.observacoes ?? ""} onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} />
                </div>
              </div>
              <p className="rounded-md bg-accent/40 p-3 text-xs text-muted-foreground">
                Notas fiscais e recebimentos deste atendimento são gerenciados nas páginas
                <strong> Notas Fiscais</strong> e <strong>Recebimentos</strong> no menu lateral.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
            <Button type="button" disabled={save.isPending} onClick={() => editing && save.mutate(editing)}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickServiceOpen} onOpenChange={setQuickServiceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo serviço</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={quickService.nome}
                onChange={(e) => setQuickService({ ...quickService, nome: e.target.value })}
                placeholder="Ex: Consulta clínica"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={quickService.valor}
                onChange={(e) => setQuickService({ ...quickService, valor: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setQuickServiceOpen(false)}>Cancelar</Button>
            <Button disabled={createService.isPending} onClick={() => createService.mutate()}>
              {createService.isPending ? "Criando…" : "Criar e selecionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

