import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/pendencias")({
  head: () => ({ meta: [{ title: "Centro de Pendências" }] }),
  component: Pendencias,
});

const labels: Record<string, { label: string; color: string }> = {
  sem_clinica: { label: "Sem clínica", color: "bg-destructive/15 text-destructive" },
  sem_valor: { label: "Sem valor", color: "bg-destructive/15 text-destructive" },
  sem_nf: { label: "Sem NF", color: "bg-warning/15 text-warning-foreground" },
  atrasado_48h: { label: "Atrasado > 48h", color: "bg-destructive/15 text-destructive" },
  aguardando: { label: "Aguardando pagamento", color: "bg-accent text-accent-foreground" },
};

function Pendencias() {
  const { data, isLoading } = useQuery({
    queryKey: ["pendencias-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pendencias_view")
        .select("*, clinics(nome)")
        .order("data_atendimento", { ascending: false });
      return data ?? [];
    },
  });

  const grouped = (data ?? []).reduce<Record<string, typeof data>>((acc, p: any) => {
    const k = p.tipo_pendencia || "outras";
    (acc[k] = acc[k] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Centro de Pendências</h1>
        <p className="text-sm text-muted-foreground">
          Atendimentos que precisam de atenção: sem clínica, sem valor, sem NF ou em atraso.
        </p>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && !data?.length && (
        <Card className="border-border/60">
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma pendência aberta. 🎉
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([tipo, items]) => {
        const meta = labels[tipo] ?? { label: tipo, color: "bg-muted" };
        return (
          <Card key={tipo} className="border-border/60">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{meta.label}</CardTitle>
              <Badge className={meta.color}>{items?.length ?? 0}</Badge>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items?.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.numero_interno}</TableCell>
                      <TableCell className="text-sm">{p.data_atendimento}</TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{p.tutor}</div>
                        <div className="text-xs text-muted-foreground">{p.pet}</div>
                      </TableCell>
                      <TableCell className="text-sm">{p.clinics?.nome ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">
                        {p.valor != null ? Number(p.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
