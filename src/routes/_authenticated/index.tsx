import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  TrendingUp,
  Wallet,
  Clock,
  ClipboardCheck,
  Target,
  Trophy,
  AlertTriangle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

const ALERT_DAYS = 7;


export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Sistema Financeiro" }] }),
  component: Dashboard,
});

function brl(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const startMes = new Date();
      startMes.setDate(1);
      startMes.setHours(0, 0, 0, 0);
      const inicio = startMes.toISOString().slice(0, 10);

      const { data: mes } = await supabase
        .from("appointments")
        .select("valor, valor_recebido, pago, nf_emitida")
        .is("deleted_at", null)
        .gte("data_atendimento", inicio);

      const { count: pendCount } = await supabase
        .from("pendencias_view")
        .select("*", { count: "exact", head: true });

      const faturado = (mes ?? []).reduce((s, a) => s + Number(a.valor ?? 0), 0);
      const recebido = (mes ?? []).reduce((s, a) => s + Number(a.valor_recebido ?? 0), 0);
      const pendente = faturado - recebido;
      const qtd = mes?.length ?? 0;
      const nfPendentes = (mes ?? []).filter((a) => !a.nf_emitida).length;

      return { faturado, recebido, pendente, qtd, nfPendentes, pendencias: pendCount ?? 0 };
    },
  });

  const { data: pendencias } = useQuery({
    queryKey: ["pendencias-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pendencias_view")
        .select("id, numero_interno, tutor, pet, valor, tipo_pendencia, data_atendimento")
        .order("data_atendimento", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: contasVencendo } = useQuery({
    queryKey: ["payables-alert"],
    queryFn: async () => {
      const hoje = new Date();
      const limite = new Date();
      limite.setDate(hoje.getDate() + ALERT_DAYS);
      const { data } = await supabase
        .from("payables")
        .select("id, fornecedor, valor, data_vencimento, status")
        .is("deleted_at", null)
        .in("status", ["pendente", "vencido", "agendado"])
        .lte("data_vencimento", limite.toISOString().slice(0, 10))
        .order("data_vencimento", { ascending: true })
        .limit(20);
      return data ?? [];
    },
  });


  const { data: chart } = useQuery({
    queryKey: ["dashboard-chart"],
    queryFn: async () => {
      const start = new Date();
      start.setMonth(start.getMonth() - 5);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("appointments")
        .select("data_atendimento, valor, valor_recebido")
        .is("deleted_at", null)
        .gte("data_atendimento", start.toISOString().slice(0, 10));
      const buckets: Record<string, { mes: string; faturado: number; recebido: number }> = {};
      for (let i = 0; i < 6; i++) {
        const d = new Date(start);
        d.setMonth(start.getMonth() + i);
        const key = d.toISOString().slice(0, 7);
        buckets[key] = {
          mes: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
          faturado: 0,
          recebido: 0,
        };
      }
      (data ?? []).forEach((a) => {
        const key = (a.data_atendimento as string).slice(0, 7);
        if (buckets[key]) {
          buckets[key].faturado += Number(a.valor ?? 0);
          buckets[key].recebido += Number(a.valor_recebido ?? 0);
        }
      });
      return Object.values(buckets);
    },
  });

  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [metaDraft, setMetaDraft] = useState<string>("");
  const [notified, setNotified] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("meta_mensal").maybeSingle();
      return data;
    },
  });

  const meta = Number(settings?.meta_mensal ?? 0);
  const recebido = stats?.recebido ?? 0;
  const progresso = meta > 0 ? Math.min(100, (recebido / meta) * 100) : 0;
  const metaAtingida = meta > 0 && recebido >= meta;

  useEffect(() => {
    if (!metaAtingida) return;
    const key = `meta-notif-${new Date().toISOString().slice(0, 7)}`;
    if (sessionStorage.getItem(key) || notified) return;
    sessionStorage.setItem(key, "1");
    setNotified(true);
    toast.success("🎉 Meta mensal atingida!", {
      description: `Você recebeu ${brl(recebido)} este mês.`,
      duration: 6000,
    });
  }, [metaAtingida, recebido, notified]);

  const saveMeta = useMutation({
    mutationFn: async (valor: number) => {
      const { error } = await supabase
        .from("app_settings")
        .update({ meta_mensal: valor, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Meta atualizada.");
      setMetaDraft("");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });


  const now = new Date();
  const mesAtual = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const kpis = [
    {
      label: "Faturado Mês",
      value: brl(stats?.faturado),
      icon: TrendingUp,
      tone: "default" as const,
      sub: `${stats?.qtd ?? 0} atendimentos`,
    },
    {
      label: "Recebido",
      value: brl(stats?.recebido),
      icon: Wallet,
      tone: "primary" as const,
      sub: stats?.faturado
        ? `${Math.round(((stats?.recebido ?? 0) / stats.faturado) * 100)}% do faturado`
        : "—",
    },
    {
      label: "Em Aberto",
      value: brl(stats?.pendente),
      icon: Clock,
      tone: "default" as const,
      sub: `${stats?.nfPendentes ?? 0} NF pendentes`,
    },
    {
      label: "Pendências",
      value: String(stats?.pendencias ?? 0),
      icon: ClipboardCheck,
      tone: "danger" as const,
      sub: "Atendimentos sem baixa",
    },
  ];

  const maxBar = Math.max(1, ...((chart ?? []).flatMap((c) => [c.faturado, c.recebido])));

  return (
    <div className="space-y-8">
      {/* Header executivo */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Painel Executivo
          </p>
          <h1
            className="mt-1 text-3xl font-semibold tracking-tight text-primary"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Performance Financeira
          </h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Referência</p>
          <p className="text-sm font-medium capitalize text-foreground">{mesAtual}</p>
        </div>
      </header>

      {/* Alerta de contas a vencer */}
      {contasVencendo && contasVencendo.length > 0 && <PayablesAlert rows={contasVencendo} />}

      {/* KPIs */}

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((c) => {
          const Icon = c.icon;
          const dark = c.tone === "primary";
          return (
            <Card
              key={c.label}
              className={
                dark
                  ? "rounded-sm border-transparent bg-primary text-primary-foreground shadow-lg"
                  : "rounded-sm border-border bg-card shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)]"
              }
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <p
                    className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
                      dark ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {c.label}
                  </p>
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      dark ? "text-primary-foreground/60" : "text-muted-foreground/60"
                    }`}
                  />
                </div>
                <p
                  className={`mt-4 text-2xl font-bold tracking-tight ${
                    c.tone === "danger" ? "text-destructive" : dark ? "" : "text-primary"
                  }`}
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {isLoading ? "—" : c.value}
                </p>
                <p
                  className={`mt-2 text-[11px] ${
                    dark ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {c.sub}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Gráfico + Meta */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-sm border-border bg-card shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
            <CardTitle className="text-sm font-semibold tracking-tight">
              Faturamento vs Recebido (6 meses)
            </CardTitle>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-primary" />
                <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
                  Faturado
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-muted" />
                <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
                  Recebido
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end justify-between gap-3 px-2">
              {(chart ?? []).map((c, idx) => {
                const isLast = idx === (chart ?? []).length - 1;
                const hF = `${Math.max(4, (c.faturado / maxBar) * 100)}%`;
                const hR = `${Math.max(4, (c.recebido / maxBar) * 100)}%`;
                return (
                  <div key={idx} className="flex w-full flex-col items-center gap-2">
                    <div className="flex h-32 w-full items-end gap-1" title={`${brl(c.faturado)} / ${brl(c.recebido)}`}>
                      <div
                        className={`w-1/2 rounded-t-sm bg-primary ${isLast ? "" : "opacity-60"}`}
                        style={{ height: hF }}
                      />
                      <div className="w-1/2 rounded-t-sm bg-muted" style={{ height: hR }} />
                    </div>
                    <span
                      className={`text-[10px] uppercase ${
                        isLast ? "font-bold text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {c.mes}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Meta Mensal */}
        <Card className="relative overflow-hidden rounded-sm border-transparent bg-primary text-primary-foreground shadow-lg">
          <CardContent className="flex h-full flex-col justify-between gap-8 p-8">
            <div className="relative z-10 flex items-center gap-2">
              {metaAtingida ? (
                <Trophy className="h-4 w-4 text-primary-foreground/80" />
              ) : (
                <Target className="h-4 w-4 text-primary-foreground/80" />
              )}
              <h3 className="text-sm font-semibold text-primary-foreground/80">Meta Mensal</h3>
            </div>

            <div className="relative z-10">
              <p
                className="text-4xl font-bold"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {meta > 0 ? `${progresso.toFixed(0)}%` : "—"}
              </p>
              <p className="mt-2 text-xs text-primary-foreground/70">
                {meta > 0
                  ? `${brl(recebido)} de ${brl(meta)}`
                  : isAdmin
                    ? "Defina uma meta abaixo"
                    : "Nenhuma meta definida"}
              </p>
            </div>

            <div className="relative z-10 space-y-3">
              {meta > 0 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-foreground/15">
                  <div
                    className="h-full rounded-full bg-primary-foreground shadow-[0_0_8px_rgba(255,255,255,0.4)] transition-all"
                    style={{ width: `${progresso}%` }}
                  />
                </div>
              )}
              {isAdmin && (
                <form
                  className="flex items-center gap-2 pt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = Number(metaDraft);
                    if (!isNaN(v) && v >= 0) saveMeta.mutate(v);
                  }}
                >
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={meta ? brl(meta) : "Definir meta"}
                    value={metaDraft}
                    onChange={(e) => setMetaDraft(e.target.value)}
                    className="h-8 border-primary-foreground/20 bg-primary-foreground/10 text-xs text-primary-foreground placeholder:text-primary-foreground/50"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    disabled={!metaDraft || saveMeta.isPending}
                    className="h-8"
                  >
                    Salvar
                  </Button>
                </form>
              )}
            </div>

            <div className="pointer-events-none absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-primary-foreground/[0.04]" />
          </CardContent>
        </Card>
      </section>

    </div>
  );
}

type PayableAlertRow = {
  id: string;
  fornecedor: string;
  valor: number;
  data_vencimento: string;
  status: string;
};

function PayablesAlert({ rows }: { rows: PayableAlertRow[] }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidas = rows.filter((r) => r.data_vencimento < hoje);
  const proximas = rows.filter((r) => r.data_vencimento >= hoje);
  const total = rows.reduce((s, r) => s + Number(r.valor), 0);
  const fmtDate = (d: string) => d.split("-").reverse().join("/");
  const diasAte = (d: string) => {
    const diff = Math.round((new Date(d).getTime() - new Date(hoje).getTime()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)}d vencida`;
    if (diff === 0) return "vence hoje";
    if (diff === 1) return "vence amanhã";
    return `em ${diff}d`;
  };
  const critical = vencidas.length > 0;

  return (
    <Card
      className={`rounded-sm border-l-4 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] ${
        critical
          ? "border-l-destructive bg-destructive/5"
          : "border-l-warning bg-warning/5"
      }`}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div
            className={`grid h-10 w-10 place-items-center rounded-full ${
              critical ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className={`text-sm font-semibold ${critical ? "text-destructive" : "text-warning"}`}>
              {critical
                ? `${vencidas.length} conta${vencidas.length > 1 ? "s" : ""} vencida${vencidas.length > 1 ? "s" : ""}`
                : `${proximas.length} conta${proximas.length > 1 ? "s" : ""} a vencer em até ${ALERT_DAYS} dias`}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{brl(total)}</span>
              {critical && proximas.length > 0 && ` · +${proximas.length} próximas`}
            </p>
          </div>
        </div>
        <Link
          to="/contas-pagar"
          className={`text-xs font-medium hover:underline ${critical ? "text-destructive" : "text-warning"}`}
        >
          Ver todas →
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {rows.slice(0, 5).map((r) => {
            const isVenc = r.data_vencimento < hoje;
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.fornecedor}</div>
                  <div className="text-xs text-muted-foreground">
                    Vence em {fmtDate(r.data_vencimento)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold">{brl(Number(r.valor))}</span>
                  <Badge
                    variant="outline"
                    className={
                      isVenc
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-warning/40 bg-warning/10 text-warning"
                    }
                  >
                    {diasAte(r.data_vencimento)}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
        {rows.length > 5 && (
          <p className="pt-3 text-center text-xs text-muted-foreground">
            +{rows.length - 5} outras contas
          </p>
        )}
      </CardContent>
    </Card>
  );
}

