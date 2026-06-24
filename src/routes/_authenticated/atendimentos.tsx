import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, Check, X, FileText, Wallet, Stethoscope, Package } from "lucide-react";
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
        return row.id;
      } else {
        const { data, error } = await supabase.from("appointments").insert(payload).select("id").single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["pendencias-recent"] });
      toast.success("Atendimento salvo.");
      // mantém aberto para edição se acabou de criar
      if (editing && !editing.id) {
        setEditing({ ...editing, id });
      } else {
        setOpen(false);
        setEditing(null);
      }
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
    setOpen(true);
  };

  const startEdit = (row: AppointmentRow) => {
    setEditing(row);
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
            <Tabs defaultValue="dados" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="dados"><Stethoscope className="mr-1.5 h-4 w-4" />Dados</TabsTrigger>
                <TabsTrigger value="itens" disabled={!editing.id}><Package className="mr-1.5 h-4 w-4" />Serviços</TabsTrigger>
                <TabsTrigger value="nf"><FileText className="mr-1.5 h-4 w-4" />NF</TabsTrigger>
                <TabsTrigger value="recebimento"><Wallet className="mr-1.5 h-4 w-4" />Recebimento</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4 pt-4">
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
                    <Label>Data do atendimento *</Label>
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
                    <Label>Observações clínicas</Label>
                    <Textarea rows={3} value={editing.observacoes ?? ""} onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} />
                  </div>
                </div>
                {!editing.id && (
                  <p className="rounded-md bg-accent/40 p-3 text-xs text-muted-foreground">
                    Salve os dados para liberar as abas de <strong>Serviços/Materiais</strong>, <strong>NF</strong> e <strong>Recebimento</strong>.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="itens" className="pt-4">
                {editing.id && <ItemsSection appointmentId={editing.id} />}
              </TabsContent>

              <TabsContent value="nf" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nº da NF</Label>
                    <Input value={editing.nf_numero ?? ""} onChange={(e) => setEditing({ ...editing, nf_numero: e.target.value })} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border p-3">
                    <Label htmlFor="nf">NF emitida</Label>
                    <Switch id="nf" checked={!!editing.nf_emitida} onCheckedChange={(v) => setEditing({ ...editing, nf_emitida: v })} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-2">
                    <Label htmlFor="nfen">NF enviada ao tutor/clínica</Label>
                    <Switch id="nfen" checked={!!editing.nf_enviada} onCheckedChange={(v) => setEditing({ ...editing, nf_enviada: v })} />
                  </div>
                </div>
                <FileField
                  label="PDF da Nota Fiscal"
                  path={editing.nf_pdf_path ?? null}
                  prefix="nf"
                  onChange={(p) => setEditing({ ...editing, nf_pdf_path: p })}
                />
              </TabsContent>

              <TabsContent value="recebimento" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Valor total (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={editing.valor ?? ""} onChange={(e) => setEditing({ ...editing, valor: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor recebido (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={editing.valor_recebido ?? ""} onChange={(e) => setEditing({ ...editing, valor_recebido: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Forma principal</Label>
                    <Select value={editing.payment_method_id ?? ""} onValueChange={(v) => setEditing({ ...editing, payment_method_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                      <SelectContent>
                        {methods?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data de pagamento</Label>
                    <Input type="date" value={editing.data_pagamento ?? ""} onChange={(e) => setEditing({ ...editing, data_pagamento: e.target.value })} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-2">
                    <Label htmlFor="pago" className="text-base">Pago</Label>
                    <Switch id="pago" checked={!!editing.pago} onCheckedChange={(v) => setEditing({ ...editing, pago: v })} />
                  </div>
                </div>

                {editing.id && <PaymentsSection appointmentId={editing.id} methods={methods ?? []} />}

                <FileField
                  label="Comprovante de pagamento"
                  path={editing.comprovante_path ?? null}
                  prefix="comprovante"
                  onChange={(p) => setEditing({ ...editing, comprovante_path: p })}
                />

                <div className="space-y-2">
                  <Label>Observações financeiras</Label>
                  <Textarea rows={2} value={editing.obs_financeiras ?? ""} onChange={(e) => setEditing({ ...editing, obs_financeiras: e.target.value })} />
                </div>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
            <Button type="button" disabled={save.isPending} onClick={() => editing && save.mutate(editing)}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FileField({
  label, path, prefix, onChange,
}: {
  label: string; path: string | null; prefix: string; onChange: (path: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const key = `${prefix}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("notas-fiscais").upload(key, file, {
        contentType: file.type || "application/pdf", upsert: false,
      });
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
    <div className="space-y-2 rounded-md border border-dashed border-border/70 p-4">
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

interface AppointmentItem {
  id: string;
  tipo: "servico" | "material";
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

function ItemsSection({ appointmentId }: { appointmentId: string }) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<"servico" | "material">("servico");
  const [descricao, setDescricao] = useState("");
  const [qtd, setQtd] = useState("1");
  const [vu, setVu] = useState("");

  const { data: items } = useQuery({
    queryKey: ["appointment-items", appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_items")
        .select("*")
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppointmentItem[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["appointment-items", appointmentId] });
    qc.invalidateQueries({ queryKey: ["appointments"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!descricao.trim()) throw new Error("Informe a descrição.");
      const q = Number(qtd); const v = Number(vu);
      if (!q || q <= 0) throw new Error("Quantidade inválida.");
      if (isNaN(v) || v < 0) throw new Error("Valor unitário inválido.");
      const { error } = await supabase.from("appointment_items").insert({
        appointment_id: appointmentId, tipo, descricao: descricao.trim(),
        quantidade: q, valor_unitario: v,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh(); setDescricao(""); setQtd("1"); setVu("");
      toast.success("Item adicionado.");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointment_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const total = (items ?? []).reduce((s, i) => s + Number(i.valor_total), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-16 text-center">Qtd</TableHead>
              <TableHead className="w-28 text-right">Unitário</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!items?.length ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Nenhum item ainda.</TableCell></TableRow>
            ) : items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Badge variant="outline" className={i.tipo === "servico" ? "border-primary/30 text-primary" : "border-accent text-accent-foreground"}>
                    {i.tipo === "servico" ? "Serviço" : "Material"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{i.descricao}</TableCell>
                <TableCell className="text-center text-sm">{Number(i.quantidade)}</TableCell>
                <TableCell className="text-right text-sm">{brl(Number(i.valor_unitario))}</TableCell>
                <TableCell className="text-right text-sm font-medium">{brl(Number(i.valor_total))}</TableCell>
                <TableCell>
                  <Button type="button" size="icon" variant="ghost" onClick={() => remove.mutate(i.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total dos itens</span>
          <strong>{brl(total)}</strong>
        </div>
      </div>

      <div className="rounded-md border border-dashed border-border/70 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_80px_120px_auto]">
          <Select value={tipo} onValueChange={(v) => setTipo(v as "servico" | "material")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="servico">Serviço</SelectItem>
              <SelectItem value="material">Material</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Descrição (ex: Consulta oncológica)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <Input type="number" step="0.01" min="0.01" placeholder="Qtd" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          <Input type="number" step="0.01" min="0" placeholder="Valor unit." value={vu} onChange={(e) => setVu(e.target.value)} />
          <Button type="button" onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="mr-1 h-4 w-4" />Adicionar
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Ao adicionar itens, o valor total do atendimento é recalculado automaticamente.
      </p>
    </div>
  );
}

interface PaymentMethod { id: string; nome: string }
interface AppointmentPayment {
  id: string; payment_method_id: string; valor: number;
  data_pagamento: string | null; observacao: string | null;
  payment_methods?: { nome: string } | null;
}

function PaymentsSection({ appointmentId, methods }: { appointmentId: string; methods: PaymentMethod[] }) {
  const qc = useQueryClient();
  const [methodId, setMethodId] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));

  const { data: payments } = useQuery({
    queryKey: ["appointment-payments", appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_payments")
        .select("*, payment_methods(nome)")
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppointmentPayment[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!methodId) throw new Error("Selecione uma forma de pagamento.");
      const v = Number(valor);
      if (!v || v <= 0) throw new Error("Informe um valor válido.");
      const { error } = await supabase.from("appointment_payments").insert({
        appointment_id: appointmentId, payment_method_id: methodId, valor: v, data_pagamento: data || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointment-payments", appointmentId] });
      setMethodId(""); setValor("");
      toast.success("Pagamento adicionado.");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointment_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointment-payments", appointmentId] }),
  });

  const total = (payments ?? []).reduce((s, p) => s + Number(p.valor), 0);

  return (
    <div className="space-y-3 rounded-md border border-border/60 p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Pagamentos (várias formas)</Label>
        <span className="text-sm text-muted-foreground">Total: <strong>{brl(total)}</strong></span>
      </div>
      {payments?.length ? (
        <div className="space-y-1">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded border border-border/40 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{p.payment_methods?.nome ?? "—"}</span>
                <span className="ml-2 text-muted-foreground">{p.data_pagamento ?? ""}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono">{brl(Number(p.valor))}</span>
                <Button type="button" size="icon" variant="ghost" onClick={() => remove.mutate(p.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum pagamento registrado.</p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_140px_auto]">
        <Select value={methodId} onValueChange={setMethodId}>
          <SelectTrigger><SelectValue placeholder="Forma…" /></SelectTrigger>
          <SelectContent>
            {methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="number" step="0.01" min="0" placeholder="Valor" value={valor} onChange={(e) => setValor(e.target.value)} />
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <Button type="button" onClick={() => add.mutate()} disabled={add.isPending}>Adicionar</Button>
      </div>
    </div>
  );
}
