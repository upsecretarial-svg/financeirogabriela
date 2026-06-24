import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  TrendingUp,
  Wallet,
  Clock,
  ClipboardCheck,
  FileText,
  AlertCircle,
  Target,
  Trophy,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";

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


  const cards = [
    { label: "Faturado no mês", value: brl(stats?.faturado), icon: TrendingUp, color: "text-primary" },
    { label: "Recebido", value: brl(stats?.recebido), icon: Wallet, color: "text-success" },
    { label: "A receber", value: brl(stats?.pendente), icon: Clock, color: "text-warning" },
    { label: "Atendimentos no mês", value: String(stats?.qtd ?? 0), icon: ClipboardCheck, color: "text-primary" },
    { label: "NFs pendentes", value: String(stats?.nfPendentes ?? 0), icon: FileText, color: "text-warning" },
    { label: "Pendências abertas", value: String(stats?.pendencias ?? 0), icon: AlertCircle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground">Resumo financeiro do mês atual.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{isLoading ? "—" : c.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            {metaAtingida ? (
              <Trophy className="h-5 w-5 text-success" />
            ) : (
              <Target className="h-5 w-5 text-primary" />
            )}
            <CardTitle className="text-base">Meta mensal de recebimento</CardTitle>
          </div>
          {isAdmin && (
            <form
              className="flex items-center gap-2"
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
                className="h-8 w-36"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!metaDraft || saveMeta.isPending}>
                Salvar
              </Button>
            </form>
          )}
        </CardHeader>
        <CardContent>
          {meta <= 0 ? (
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "Defina uma meta acima para acompanhar o progresso." : "Nenhuma meta definida ainda."}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">{brl(recebido)}</span>
                <span className="text-sm text-muted-foreground">de {brl(meta)} ({progresso.toFixed(0)}%)</span>
              </div>
              <Progress value={progresso} className={metaAtingida ? "[&>div]:bg-success" : ""} />
              {metaAtingida && (
                <p className="text-sm font-medium text-success">🎉 Meta atingida — parabéns!</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>



      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Faturamento × Recebido (últimos 6 meses)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" className="text-xs" />
                <YAxis
                  className="text-xs"
                  tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(v: number) => brl(v)}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--card-foreground)",
                  }}
                />
                <Bar dataKey="faturado" fill="var(--primary)" radius={[6, 6, 0, 0]}>
                  {(chart ?? []).map((_, i) => <Cell key={i} fillOpacity={0.4} />)}
                </Bar>
                <Bar dataKey="recebido" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Pendências recentes</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Atendimentos que precisam de atenção financeira ou fiscal.
              </p>
            </div>
            <Link
              to="/pendencias"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ver todas →
            </Link>
          </CardHeader>
          <CardContent>
            {!pendencias?.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma pendência. 🎉
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {pendencias.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium">
                        {p.numero_interno} — {p.tutor} / {p.pet}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.data_atendimento} · {brl(Number(p.valor))}
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {p.tipo_pendencia?.replaceAll("_", " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
