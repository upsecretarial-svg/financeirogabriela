import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { z } from "zod";
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
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Pencil, Check, X, Trash2, ClipboardList, DollarSign, FileText, Paperclip, Loader2, Sparkles, ClipboardPaste } from "lucide-react";
import { TableState } from "@/components/data-state";
import { TableActions, TableAction } from "@/components/table-actions";
import { useServerFn } from "@tanstack/react-start";
import { extractTutorFromImage } from "@/lib/tutor-extract.functions";
import { extractNfFromFile } from "@/lib/nf-extract.functions";

import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  head: () => ({ meta: [{ title: "Atendimentos" }] }),
  validateSearch: z.object({ edit: z.string().optional() }),
  component: Atendimentos,
});

interface AppointmentRow {
  id: string;
  numero_interno: string | null;
  tutor: string;
  tutor_cpf: string | null;
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

function formatCpf(v: string) {
  const d = (v ?? "").replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function Atendimentos() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const wasNewRef = useRef(false);
  const { isAdmin } = useAuth();
  const { edit: editParam } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<AppointmentRow> | null>(null);
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState<string>("");
  const [quickServiceOpen, setQuickServiceOpen] = useState(false);
  const [quickService, setQuickService] = useState<{ nome: string; valor: string }>({ nome: "", valor: "" });

  const { data: appts, isLoading, isError, error, refetch } = useQuery({
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
      const cpfDigits = (row.tutor_cpf ?? "").replace(/\D/g, "");
      if (cpfDigits && cpfDigits.length !== 11) {
        throw new Error("CPF deve conter 11 dígitos.");
      }
      const payload = {
        tutor: row.tutor,
        tutor_cpf: cpfDigits || null,
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

  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editParam || openedRef.current === editParam || !services) return;
    openedRef.current = editParam;
    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", editParam)
        .maybeSingle();
      if (data) {
        await startEdit(data as AppointmentRow);
        navigate({ to: "/atendimentos", search: {}, replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, services]);

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
              <TableState
                colSpan={8}
                isLoading={isLoading}
                isError={isError}
                error={error as Error | null}
                onRetry={() => refetch()}
                isEmpty={!isLoading && !isError && !appts?.length}
                emptyIcon={ClipboardList}
                emptyTitle="Nenhum atendimento ainda"
                emptyDescription="Clique em 'Novo Atendimento' para registrar o primeiro lançamento."
              />
              {!isLoading && !isError && appts?.length ? (
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
                      <TableActions>
                        <TableAction
                          label="Editar atendimento"
                          icon={Pencil}
                          onClick={() => startEdit(a as AppointmentRow)}
                        />
                        {isAdmin && (
                          <TableAction
                            label="Excluir atendimento"
                            icon={Trash2}
                            tone="destructive"
                            onClick={() => confirm("Excluir atendimento?") && del.mutate(a.id)}
                          />
                        )}
                      </TableActions>
                    </TableCell>
                  </TableRow>
                ))
              ) : null}
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
              {!editing.id && (
                <TutorSmartPaste
                  onExtracted={(d) => setEditing((cur) => cur ? {
                    ...cur,
                    tutor: cur.tutor || d.nome || cur.tutor,
                    tutor_cpf: cur.tutor_cpf || d.cpf || cur.tutor_cpf,
                  } : cur)}
                />
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tutor *</Label>
                  <Input value={editing.tutor ?? ""} onChange={(e) => setEditing({ ...editing, tutor: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>CPF do tutor (NF-e)</Label>
                  <Input
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="000.000.000-00"
                    value={formatCpf(editing.tutor_cpf ?? "")}
                    onChange={(e) => setEditing({ ...editing, tutor_cpf: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                  />
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

              {/* Baixa financeira */}
              <div className="rounded-lg border border-border/60 bg-card/50 p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-success" />
                    <div>
                      <Label className="text-sm font-medium">Dar baixa no financeiro</Label>
                      <p className="text-xs text-muted-foreground">Marque para registrar o recebimento agora.</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!editing.pago}
                    onCheckedChange={(v) => setEditing({
                      ...editing,
                      pago: v,
                      data_pagamento: v ? (editing.data_pagamento ?? new Date().toISOString().slice(0, 10)) : null,
                      valor_recebido: v ? (editing.valor_recebido ?? editing.valor ?? null) : null,
                    })}
                  />
                </div>
                {editing.pago && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Forma de pagamento</Label>
                      <Select value={editing.payment_method_id ?? ""} onValueChange={(v) => setEditing({ ...editing, payment_method_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                        <SelectContent>
                          {methods?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Valor recebido</Label>
                      <Input type="number" step="0.01" min="0" value={editing.valor_recebido ?? ""} onChange={(e) => setEditing({ ...editing, valor_recebido: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Data</Label>
                      <Input type="date" value={editing.data_pagamento ?? ""} onChange={(e) => setEditing({ ...editing, data_pagamento: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>

              {/* NF-e */}
              <div className="rounded-lg border border-border/60 bg-card/50 p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <div>
                      <Label className="text-sm font-medium">NF-e emitida</Label>
                      <p className="text-xs text-muted-foreground">O anexo do PDF pode ser feito depois em Notas Fiscais.</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!editing.nf_emitida}
                    onCheckedChange={(v) => setEditing({ ...editing, nf_emitida: v })}
                  />
                </div>
                {editing.nf_emitida && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Nº da NF-e</Label>
                        <Input value={editing.nf_numero ?? ""} onChange={(e) => setEditing({ ...editing, nf_numero: e.target.value })} placeholder="Opcional" />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={!!editing.nf_enviada}
                            onChange={(e) => setEditing({ ...editing, nf_enviada: e.target.checked })}
                          />
                          NF enviada ao cliente
                        </label>
                      </div>
                    </div>
                    <NfAttachField
                      path={editing.nf_pdf_path ?? null}
                      onChange={(p) => setEditing((cur) => cur ? { ...cur, nf_pdf_path: p } : cur)}
                    />
                  </div>
                )}
              </div>

              <p className="rounded-md bg-accent/40 p-3 text-xs text-muted-foreground">
                Dica: você pode <strong>dar baixa</strong> na venda agora e <strong>anexar o PDF da NF-e</strong> depois na página Notas Fiscais — o status será atualizado automaticamente.
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

function NfAttachField({ path, onChange }: { path: string | null; onChange: (path: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
      const key = `atendimentos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("notas-fiscais")
        .upload(key, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (error) throw error;
      onChange(key);
      toast.success("Anexo enviado.");
    } catch (e) {
      toast.error("Erro no upload", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" />
          <div>
            <Label className="text-xs font-medium">Anexo da NF-e (PDF ou imagem)</Label>
            <p className="text-[11px] text-muted-foreground">Opcional — você também pode anexar depois em Notas Fiscais.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {path && (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <Check className="h-3 w-3" /> Anexado
            </Badge>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            <span className="ml-1.5">{path ? "Substituir" : "Anexar"}</span>
          </Button>
          {path && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onChange(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function TutorSmartPaste({ onExtracted }: { onExtracted: (data: { nome: string | null; cpf: string | null }) => void }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const extract = useServerFn(extractTutorFromImage);

  const process = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Envie uma imagem (JPG, PNG, WEBP).");
      return;
    }
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const base64 = await fileToBase64(file);
      const result = await extract({ data: { mimeType: file.type, base64 } });
      if (!result.nome && !result.cpf) {
        toast.warning("Nada identificado", { description: "A IA não encontrou nome ou CPF nesta imagem." });
      } else {
        onExtracted(result);
        toast.success("Dados extraídos", {
          description: [result.nome, result.cpf ? formatCpfPreview(result.cpf) : null].filter(Boolean).join(" • "),
        });
      }
    } catch (e) {
      toast.error("Erro ao extrair", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (file) await process(file);
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) await process(file);
  };

  return (
    <div
      tabIndex={0}
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      className="group relative rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 outline-none transition focus-visible:border-primary/60 focus-visible:bg-primary/10 hover:border-primary/50"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Preenchimento inteligente</Label>
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] text-primary">IA</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Cole (Ctrl+V), arraste ou anexe uma imagem (RG, CNH, print) para extrair <strong>nome</strong> e <strong>CPF</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) process(f); e.target.value = ""; }}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Anexar
          </Button>
        </div>
      </div>
      {preview && (
        <div className="mt-3 flex items-center gap-2">
          <img src={preview} alt="Prévia" className="h-16 w-16 rounded-md border border-border/60 object-cover" />
          <p className="text-[11px] text-muted-foreground">A imagem não é salva — usada apenas para extração.</p>
        </div>
      )}
    </div>
  );
}

function formatCpfPreview(digits: string): string {
  const d = digits.replace(/\D/g, "").padEnd(11, "").slice(0, 11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}



