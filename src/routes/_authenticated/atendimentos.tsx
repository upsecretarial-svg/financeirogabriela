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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Pencil, Check, X, Trash2, ClipboardList, DollarSign, FileText, Paperclip, Loader2, Sparkles, ClipboardPaste, User, Stethoscope, CalendarDays, Building2, Wallet, ChevronRight, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import { FeedbackState } from "@/components/feedback-state";
import { TableActions, TableAction } from "@/components/table-actions";
import { useServerFn } from "@tanstack/react-start";
import { extractTutorFromImage } from "@/lib/tutor-extract.functions";
import { extractNfFromFile } from "@/lib/nf-extract.functions";

import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

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
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState<string>("");
  const [quickServiceOpen, setQuickServiceOpen] = useState(false);
  const [quickService, setQuickService] = useState<{ nome: string; valor: string }>({ nome: "", valor: "" });

  const { data: appts, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["appointments", search, from, to],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("*, clinics(nome), payment_methods(nome)")
        .is("deleted_at", null)
        .order("data_atendimento", { ascending: false })
        .limit(200);
      if (from) q = q.gte("data_atendimento", from);
      if (to) q = q.lte("data_atendimento", to);
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

  const hasFilters = Boolean(from || to || search);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atendimentos"
        subtitle="Cadastre, edite e acompanhe os atendimentos clínicos em um só lugar."
        eyebrow={`${totals.qtd} no período`}
        meta={[
          { label: "Mês atual", value: new Date(from).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) },
          { label: "Faturado", value: brl(totals.faturado) },
          { label: "Recebido", value: brl(totals.recebido) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={startNew}
              size="lg"
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 shadow-[0_10px_30px_-10px_rgba(99,102,241,0.6)] hover:from-indigo-400 hover:to-fuchsia-400"
            >
              <Plus className="mr-2 h-4 w-4" /> Novo atendimento
            </Button>
          </div>
        }
      />

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por tutor, pet ou nº interno..."
        filters={
          <>
            <Input
              type="month"
              className="h-11 w-40 rounded-xl border-white/10 bg-white/[0.03] text-xs"
              onChange={(e) => {
                if (e.target.value) {
                  const [y, m] = e.target.value.split("-").map(Number);
                  setFrom(new Date(y, m - 1, 1).toISOString().slice(0, 10));
                  setTo(new Date(y, m, 0).toISOString().slice(0, 10));
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-11 w-36 rounded-xl border-white/10 bg-white/[0.03] text-xs"
              />
              <span className="text-xs text-muted-foreground">ate</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-11 w-36 rounded-xl border-white/10 bg-white/[0.03] text-xs"
              />
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 rounded-xl px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearch("");
                  const d = new Date();
                  setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
                  setTo(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10));
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Limpar
              </Button>
            )}
          </>
        }
      />

      <Card className="border-border/60">
        <CardContent className="overflow-x-auto p-0">
          {!isLoading && !isError && appts?.length === 0 ? (
            <div className="p-4">
              <FeedbackState
                icon={ClipboardList}
                title={hasFilters ? "Nenhum resultado para os filtros atuais" : "Nenhum atendimento cadastrado"}
                description={
                  hasFilters
                    ? "Tente ajustar a busca ou o periodo para encontrar o que procura."
                    : "Clique em 'Novo atendimento' para registrar o primeiro lancamento."
                }
                action={hasFilters ? undefined : { label: "Novo atendimento", onClick: startNew }}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Tutor / Pet</TableHead>
                  <TableHead>Clinica</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Pago?</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="py-16 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando atendimentos...
                      </span>
                    </TableCell>
                  </TableRow>
                )}
                {isError && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="py-10">
                      <FeedbackState
                        variant="error"
                        title="Nao foi possivel carregar"
                        description={(error as Error | null)?.message ?? "Tente novamente em instantes."}
                        action={{ label: "Tentar novamente", onClick: () => refetch() }}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !isError && appts?.map((a) => (
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[94vh] max-w-4xl gap-0 overflow-hidden border-border/60 bg-background p-0 shadow-2xl">
          {/* Header premium com gradiente */}
          <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-indigo-600/30 via-violet-600/20 to-fuchsia-600/20 px-6 py-5">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <div className="absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Atendimento</span>
                    {editing?.id && (
                      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] text-primary">
                        Editando
                      </Badge>
                    )}
                  </div>
                  <DialogTitle className="mt-0.5 text-xl font-bold text-foreground" style={{ fontFamily: "Urbanist" }}>
                    {editing?.id ? `${(editing as AppointmentRow).numero_interno ?? "Atendimento"}` : "Novo atendimento"}
                  </DialogTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Preencha os dados do atendimento em 3 etapas visuais.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border/60 bg-background/40 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {editing && (
            <div className="max-h-[calc(94vh-180px)] space-y-5 overflow-y-auto px-6 py-5">
              {!editing.id && (
                <TutorSmartPaste
                  onExtracted={(d) => setEditing((cur) => cur ? {
                    ...cur,
                    tutor: cur.tutor || (d.nome ? d.nome.toUpperCase() : cur.tutor),
                    tutor_cpf: cur.tutor_cpf || d.cpf || cur.tutor_cpf,
                    pet: cur.pet || (d.pet ? d.pet.toUpperCase() : cur.pet),
                  } : cur)}
                />
              )}

              {/* ETAPA 1 - Identificacao */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-md bg-primary/15 text-primary">
                    <span className="text-xs font-bold">1</span>
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Identificacao</h3>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Tutor" required icon={User}>
                    <Input
                      value={editing.tutor ?? ""}
                      onChange={(e) => setEditing({ ...editing, tutor: e.target.value })}
                      placeholder="Nome completo"
                      className="h-11 rounded-lg border-border/60 bg-background/60"
                    />
                  </Field>
                  <Field label="CPF do tutor" hint="Para NF-e" icon={User}>
                    <Input
                      inputMode="numeric"
                      maxLength={14}
                      placeholder="000.000.000-00"
                      value={formatCpf(editing.tutor_cpf ?? "")}
                      onChange={(e) => setEditing({ ...editing, tutor_cpf: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                      className="h-11 rounded-lg border-border/60 bg-background/60"
                    />
                  </Field>
                  <Field label="Pet" required icon={Stethoscope}>
                    <Input
                      value={editing.pet ?? ""}
                      onChange={(e) => setEditing({ ...editing, pet: e.target.value })}
                      placeholder="Nome do pet"
                      className="h-11 rounded-lg border-border/60 bg-background/60"
                    />
                  </Field>
                  <Field label="Data" required icon={CalendarDays}>
                    <Input
                      type="date"
                      value={editing.data_atendimento ?? ""}
                      onChange={(e) => setEditing({ ...editing, data_atendimento: e.target.value })}
                      className="h-11 rounded-lg border-border/60 bg-background/60"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Clinica" icon={Building2}>
                      <Select value={editing.clinic_id ?? ""} onValueChange={(v) => setEditing({ ...editing, clinic_id: v })}>
                        <SelectTrigger className="h-11 rounded-lg border-border/60 bg-background/60">
                          <SelectValue placeholder="Selecione a clinica" />
                        </SelectTrigger>
                        <SelectContent>
                          {clinics?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>
              </section>

              {/* ETAPA 2 - Servico e valor */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-md bg-primary/15 text-primary">
                    <span className="text-xs font-bold">2</span>
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Servico e valor</h3>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <div className="rounded-xl border border-border/60 bg-card/30 p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                      <Stethoscope className="h-3.5 w-3.5 text-primary" />
                      Servico realizado
                    </Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 rounded-md px-2 text-xs text-primary hover:bg-primary/10" onClick={() => setQuickServiceOpen(true)}>
                      <Plus className="h-3 w-3" /> Novo servico
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
                    <SelectTrigger className="h-11 rounded-lg border-border/60 bg-background/60">
                      <SelectValue placeholder="Selecione um servico..." />
                    </SelectTrigger>
                    <SelectContent>
                      {services?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome} — {brl(Number(s.valor_final ?? s.valor ?? 0))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editing.valor ?? ""}
                        onChange={(e) => setEditing({ ...editing, valor: e.target.value ? Number(e.target.value) : null })}
                        className="h-11 rounded-lg border-border/60 bg-background/60 text-base font-semibold"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Observacoes</Label>
                      <Textarea
                        rows={2}
                        value={editing.observacoes ?? ""}
                        onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })}
                        placeholder="Anotacoes sobre o atendimento..."
                        className="rounded-lg border-border/60 bg-background/60 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* ETAPA 3 - Baixa financeira */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-md bg-primary/15 text-primary">
                    <span className="text-xs font-bold">3</span>
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Financeiro e NF-e</h3>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <div className={cn(
                  "overflow-hidden rounded-xl border transition-all",
                  editing.pago ? "border-success/40 bg-success/[0.05]" : "border-border/60 bg-card/30",
                )}>
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "grid h-10 w-10 place-items-center rounded-lg transition-all",
                        editing.pago ? "bg-success/20 text-success" : "bg-muted text-muted-foreground",
                      )}>
                        <DollarSign className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Dar baixa no financeiro</p>
                        <p className="text-xs text-muted-foreground">
                          {editing.pago ? "Recebimento registrado." : "Marque para registrar o recebimento agora."}
                        </p>
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
                    <div className="grid grid-cols-1 gap-3 border-t border-success/20 bg-success/[0.03] p-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Forma</Label>
                        <Select value={editing.payment_method_id ?? ""} onValueChange={(v) => setEditing({ ...editing, payment_method_id: v })}>
                          <SelectTrigger className="h-10 rounded-lg border-success/30 bg-background/60">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {methods?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Valor recebido</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editing.valor_recebido ?? ""}
                          onChange={(e) => setEditing({ ...editing, valor_recebido: e.target.value ? Number(e.target.value) : null })}
                          className="h-10 rounded-lg border-success/30 bg-background/60 font-semibold text-success"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Data</Label>
                        <Input
                          type="date"
                          value={editing.data_pagamento ?? ""}
                          onChange={(e) => setEditing({ ...editing, data_pagamento: e.target.value })}
                          className="h-10 rounded-lg border-success/30 bg-background/60"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* NF-e */}
                <div className={cn(
                  "overflow-hidden rounded-xl border transition-all",
                  editing.nf_emitida ? "border-primary/40 bg-primary/[0.05]" : "border-border/60 bg-card/30",
                )}>
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "grid h-10 w-10 place-items-center rounded-lg transition-all",
                        editing.nf_emitida ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                      )}>
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">NF-e emitida</p>
                        <p className="text-xs text-muted-foreground">
                          {editing.nf_emitida ? "NF-e registrada." : "O PDF pode ser anexado depois em Notas Fiscais."}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={!!editing.nf_emitida}
                      onCheckedChange={(v) => setEditing({ ...editing, nf_emitida: v })}
                    />
                  </div>
                  {editing.nf_emitida && (
                    <div className="space-y-3 border-t border-primary/20 bg-primary/[0.03] p-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Nº da NF-e</Label>
                          <Input
                            value={editing.nf_numero ?? ""}
                            onChange={(e) => setEditing({ ...editing, nf_numero: e.target.value })}
                            placeholder="Opcional"
                            className="h-10 rounded-lg border-primary/30 bg-background/60"
                          />
                        </div>
                        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-primary/30 bg-background/40 px-3 text-xs text-foreground">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-primary"
                            checked={!!editing.nf_enviada}
                            onChange={(e) => setEditing({ ...editing, nf_enviada: e.target.checked })}
                          />
                          NF enviada ao cliente
                        </label>
                      </div>
                      <NfAttachField
                        path={editing.nf_pdf_path ?? null}
                        onChange={(p) => setEditing((cur) => cur ? { ...cur, nf_pdf_path: p } : cur)}
                        onNumeroExtraido={(n) => setEditing((cur) => cur && !cur.nf_numero ? { ...cur, nf_numero: n } : cur)}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-xs text-muted-foreground">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <p>
                    Voce pode <strong className="text-foreground">dar baixa</strong> na venda agora e <strong className="text-foreground">anexar o PDF da NF-e</strong> depois na pagina Notas Fiscais — o status sera atualizado automaticamente.
                  </p>
                </div>
              </section>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-card/40 px-6 py-4 backdrop-blur-sm">
            <div className="hidden text-xs text-muted-foreground sm:block">
              {editing?.id ? "Atualizando atendimento existente" : "Criando novo atendimento"}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="rounded-lg">
                Fechar
              </Button>
              <Button
                type="button"
                disabled={save.isPending}
                onClick={() => editing && save.mutate(editing)}
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-6 shadow-lg shadow-indigo-500/30 hover:from-indigo-400 hover:to-fuchsia-400"
              >
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                {save.isPending ? "Salvando…" : "Salvar atendimento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={quickServiceOpen} onOpenChange={setQuickServiceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo servico</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={quickService.nome}
                onChange={(e) => setQuickService({ ...quickService, nome: e.target.value })}
                placeholder="Ex: Consulta clinica"
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

function Field({ label, required, hint, icon: Icon, children }: { label: string; required?: boolean; hint?: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
        {required && <span className="text-destructive">*</span>}
        {hint && <span className="text-[10px] text-muted-foreground/70">· {hint}</span>}
      </Label>
      {children}
    </div>
  );
}

function NfAttachField({ path, onChange, onNumeroExtraido }: { path: string | null; onChange: (path: string | null) => void; onNumeroExtraido?: (numero: string) => void }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const extract = useServerFn(extractNfFromFile);

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
      if (onNumeroExtraido) {
        try {
          const base64 = await fileToBase64(file);
          const result = await extract({ data: { filename: file.name, mimeType: file.type || "application/pdf", base64 } });
          if (result.nf_numero) {
            onNumeroExtraido(result.nf_numero);
            toast.success("Nº da NF extraído automaticamente.");
          }
        } catch {
          // silencioso
        }
      }
    } catch (e) {
      toast.error("Erro no upload", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" />
          <div>
            <p className="text-xs font-medium">Anexo da NF-e</p>
            <p className="text-[11px] text-muted-foreground">PDF ou imagem — opcional</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {path && (
            <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
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

function TutorSmartPaste({ onExtracted }: { onExtracted: (data: { nome: string | null; cpf: string | null; pet: string | null }) => void }) {
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
      if (!result.nome && !result.cpf && !result.pet) {
        toast.warning("Nada identificado", { description: "A IA não encontrou nome, CPF ou pet nesta imagem." });
      } else {
        onExtracted(result);
        toast.success("Dados extraídos", {
          description: [result.nome, result.pet, result.cpf ? formatCpfPreview(result.cpf) : null].filter(Boolean).join(" • "),
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
      className="group relative overflow-hidden rounded-xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/[0.08] to-fuchsia-500/[0.04] p-3 outline-none transition focus-visible:border-primary/60 focus-visible:bg-primary/10 hover:border-primary/50"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold">Preenchimento inteligente</Label>
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] text-primary">IA</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Cole (Ctrl+V), arraste ou anexe uma imagem para extrair <strong>nome</strong> e <strong>CPF</strong>.
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
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()} className="rounded-lg">
            <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Anexar
          </Button>
        </div>
      </div>
      {preview && (
        <div className="mt-3 flex items-center gap-2 border-t border-primary/10 pt-3">
          <img src={preview} alt="Prévia" className="h-14 w-14 rounded-md border border-border/60 object-cover" />
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
