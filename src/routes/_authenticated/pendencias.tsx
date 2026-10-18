import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Trash2,
  Clock,
  AlertTriangle,
  DollarSign,
  Calendar,
  Sparkles,
  Check,
  X,
  ArrowUpRight,
  TrendingDown,
} from "lucide-react";
import { TableState } from "@/components/data-state";
import { TableActions, TableAction } from "@/components/table-actions";
import { toast } from "sonner";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/pendencias")({
  head: () => ({ meta: [{ title: "Centro de Pendências — Sistema Financeiro" }] }),
  component: Pendencias,
});

const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function diasEm(date: string) {
  const ms = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function formatDate(d: string) {
  if (!d) return "—";
  const [ano, mes, dia] = d.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : d;
}

function Pendencias() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [filtroAtraso, setFiltroAtraso] = useState<"todos" | "recentes" | "moderados" | "criticos">("todos");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["pendencias-unpaid", search],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("id, numero_interno, data_atendimento, tutor, pet, valor, clinics(nome)")
        .is("deleted_at", null)
        .eq("pago", false)
        .order("data_atendimento", { ascending: true });
      if (search) {
        q = q.or(`tutor.ilike.%${search}%,pet.ilike.%${search}%,numero_interno.ilike.%${search}%`);
      }
      const { data: rows, error: qErr } = await q;
      if (qErr) throw qErr;
      return rows ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase
        .from("appointments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (err) throw err;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pendencias-unpaid"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Atendimento excluído com sucesso.");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const marcarPago = useMutation({
    mutationFn: async (appt: { id: string; valor: number | null }) => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { error: err } = await supabase
        .from("appointments")
        .update({
          pago: true,
          data_pagamento: hoje,
          valor_recebido: appt.valor ?? 0,
        })
        .eq("id", appt.id);
      if (err) throw err;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pendencias-unpaid"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Atendimento marcado como recebido.");
    },
    onError: (e: Error) => toast.error("Erro ao marcar pagamento", { description: e.message }),
  });

  const lista = data ?? [];

  // Estatísticas calculadas de atraso
  const stats = useMemo(() => {
    const total = lista.reduce((s, a) => s + Number(a.valor ?? 0), 0);
    let criticos = 0;
    let moderados = 0;
    let recentes = 0;

    lista.forEach((p) => {
      const d = diasEm(p.data_atendimento);
      if (d > 30) criticos++;
      else if (d > 7) moderados++;
      else recentes++;
    });

    return {
      totalValor: total,
      qtd: lista.length,
      criticos,
      moderados,
      recentes,
    };
  }, [lista]);

  // Filtragem rápida por tempo
  const itensFiltrados = useMemo(() => {
    if (filtroAtraso === "todos") return lista;
    return lista.filter((p) => {
      const d = diasEm(p.data_atendimento);
      if (filtroAtraso === "criticos") return d > 30;
      if (filtroAtraso === "moderados") return d > 7 && d <= 30;
      if (filtroAtraso === "recentes") return d <= 7;
      return true;
    });
  }, [lista, filtroAtraso]);

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/60 p-6 md:p-8 backdrop-blur-xl shadow-lg dark:border-white/10 dark:bg-gradient-to-br dark:from-red-950/25 dark:via-[#161226]/80 dark:to-[#0d0d1a]/50"
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-destructive/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-destructive">
              <Sparkles className="h-3.5 w-3.5" />
              Gestão de Inadimplência & Cobrança
            </div>
            <h1
              className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-4xl"
              style={{ fontFamily: "Urbanist" }}
            >
              Centro de Pendências
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Atendimentos aguardando recebimento. Monitore dias em aberto, acione clientes e dê baixa financeira com agilidade.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border bg-background/50 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
            <Clock className="h-3.5 w-3.5 text-destructive" />
            Atualização em tempo real
          </div>
        </div>
      </motion.header>

      {/* Indicadores Cards Glow */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur shadow-sm dark:border-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-transparent pointer-events-none" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">Total a Receber</span>
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black tracking-tight text-foreground">
                {isLoading ? "—" : brl(stats.totalValor)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.qtd} {stats.qtd === 1 ? "atendimento pendente" : "atendimentos pendentes"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur shadow-sm dark:border-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-destructive/15 to-transparent pointer-events-none" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider text-destructive">
                  Críticos (&gt;30 dias)
                </span>
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black tracking-tight text-destructive">
                {isLoading ? "—" : stats.criticos}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Requerem cobrança imediata</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur shadow-sm dark:border-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 to-transparent pointer-events-none" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
                  Alerta (8 a 30 dias)
                </span>
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/10 text-amber-500">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black tracking-tight text-amber-500">
                {isLoading ? "—" : stats.moderados}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Em acompanhamento regular</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur shadow-sm dark:border-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/15 to-transparent pointer-events-none" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                  Recentes (≤7 dias)
                </span>
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Calendar className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black tracking-tight text-emerald-500">
                {isLoading ? "—" : stats.recentes}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Fluxo recente sem urgência</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Lista com filtros e tabela */}
      <Card className="overflow-hidden border-border/70 bg-card/60 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#0e0d1b]/70">
        <div className="flex flex-col gap-4 border-b border-border/60 p-5 md:flex-row md:items-center md:justify-between">
          {/* Busca */}
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 rounded-xl border-border/80 bg-background/60 pl-10 text-sm shadow-sm transition focus-visible:ring-primary/40 dark:border-white/10 dark:bg-white/[0.04]"
              placeholder="Buscar por tutor, pet ou nº interno..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filtros em pílulas */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 p-1.5">
            <button
              type="button"
              onClick={() => setFiltroAtraso("todos")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filtroAtraso === "todos"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos ({stats.qtd})
            </button>
            <button
              type="button"
              onClick={() => setFiltroAtraso("criticos")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filtroAtraso === "criticos"
                  ? "bg-destructive text-destructive-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Críticos ({stats.criticos})
            </button>
            <button
              type="button"
              onClick={() => setFiltroAtraso("moderados")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filtroAtraso === "moderados"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Alerta ({stats.moderados})
            </button>
            <button
              type="button"
              onClick={() => setFiltroAtraso("recentes")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filtroAtraso === "recentes"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Recentes ({stats.recentes})
            </button>
          </div>
        </div>

        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="w-24 font-bold text-xs uppercase tracking-wider">Nº Interno</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider">Data</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider">Dias em Aberto</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider">Tutor & Pet</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider">Clínica</TableHead>
                <TableHead className="text-right font-bold text-xs uppercase tracking-wider">Valor Pendente</TableHead>
                <TableHead className="w-28 text-right font-bold text-xs uppercase tracking-wider">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-14 text-center text-sm text-muted-foreground">
                    Carregando atendimentos pendentes...
                  </TableCell>
                </TableRow>
              )}
              <TableState
                colSpan={7}
                isLoading={isLoading}
                isError={isError}
                error={error as Error | null}
                onRetry={() => refetch()}
                isEmpty={!isLoading && !isError && itensFiltrados.length === 0}
                emptyIcon={CheckCircle2}
                emptyTitle={search || filtroAtraso !== "todos" ? "Nenhum resultado para os filtros" : "Tudo quitado!"}
                emptyDescription={
                  search || filtroAtraso !== "todos"
                    ? "Tente ajustar ou limpar seus filtros de busca para encontrar pendências."
                    : "Nenhum atendimento em aberto no momento. Todas as contas foram recebidas! 🎉"
                }
              />
              {!isLoading &&
                itensFiltrados.map((p: any) => {
                  const dias = diasEm(p.data_atendimento);
                  const isCritico = dias > 30;
                  const isAlerta = dias > 7 && dias <= 30;

                  return (
                    <TableRow
                      key={p.id}
                      className="border-border/50 transition-colors hover:bg-muted/40"
                    >
                      {/* Nº Interno */}
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {p.numero_interno || "—"}
                      </TableCell>

                      {/* Data */}
                      <TableCell className="text-sm text-foreground/90 whitespace-nowrap">
                        {formatDate(p.data_atendimento)}
                      </TableCell>

                      {/* Dias em Atraso */}
                      <TableCell>
                        {isCritico ? (
                          <Badge
                            variant="outline"
                            className="border-destructive/40 bg-destructive/10 text-destructive font-bold text-xs shadow-sm"
                          >
                            <AlertTriangle className="mr-1 h-3 w-3 shrink-0" />
                            {dias} {dias === 1 ? "dia" : "dias"}
                          </Badge>
                        ) : isAlerta ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/10 text-amber-500 font-semibold text-xs shadow-sm"
                          >
                            <Clock className="mr-1 h-3 w-3 shrink-0" />
                            {dias} {dias === 1 ? "dia" : "dias"}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 font-medium text-xs dark:text-emerald-400"
                          >
                            {dias} {dias === 1 ? "dia" : "dias"}
                          </Badge>
                        )}
                      </TableCell>

                      {/* Tutor & Pet */}
                      <TableCell className="text-sm">
                        <div className="font-semibold text-foreground">{p.tutor}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                          {p.pet}
                        </div>
                      </TableCell>

                      {/* Clínica */}
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {p.clinics?.nome || <span className="text-muted-foreground/60">—</span>}
                      </TableCell>

                      {/* Valor */}
                      <TableCell className="text-right text-sm font-bold text-foreground tabular-nums whitespace-nowrap">
                        {brl(p.valor)}
                      </TableCell>

                      {/* Ações Rápidas */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão rápido Baixa/Recebido */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs font-semibold text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-500 dark:text-emerald-400"
                            title="Marcar como Recebido"
                            disabled={marcarPago.isPending}
                            onClick={() => marcarPago.mutate({ id: p.id, valor: p.valor })}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Baixar
                          </Button>

                          <TableActions>
                            <TableAction
                              label="Editar atendimento"
                              icon={Pencil}
                              onClick={() => navigate({ to: "/atendimentos", search: { edit: p.id } })}
                            />
                            {isAdmin && (
                              <TableAction
                                label="Excluir atendimento"
                                icon={Trash2}
                                tone="destructive"
                                onClick={() =>
                                  confirm("Excluir este atendimento permanentemente?") && del.mutate(p.id)
                                }
                              />
                            )}
                          </TableActions>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
