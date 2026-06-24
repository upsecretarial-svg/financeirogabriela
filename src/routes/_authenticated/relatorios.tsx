import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { exportCSV, exportPDF, exportXLSX } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios" }] }),
  component: Relatorios,
});

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Relatorios() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(inicioMes);
  const [to, setTo] = useState(hoje.toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["report", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*, clinics(nome, percentual_repasse)")
        .gte("data_atendimento", from)
        .lte("data_atendimento", to)
        .order("data_atendimento", { ascending: false });
      return data ?? [];
    },
  });

  const totals = (data ?? []).reduce(
    (acc, a: any) => {
      const valor = Number(a.valor ?? 0);
      const recebido = Number(a.valor_recebido ?? 0);
      const pct = Number(a.clinics?.percentual_repasse ?? 0);
      acc.faturado += valor;
      acc.recebido += recebido;
      acc.repasse += (recebido * pct) / 100;
      acc.qtd += 1;
      return acc;
    },
    { faturado: 0, recebido: 0, repasse: 0, qtd: 0 },
  );

  const rows = (data ?? []).map((a: any) => {
    const recebido = Number(a.valor_recebido ?? 0);
    const pct = Number(a.clinics?.percentual_repasse ?? 0);
    return {
      Numero: a.numero_interno,
      Data: a.data_atendimento,
      Tutor: a.tutor,
      Pet: a.pet,
      Clinica: a.clinics?.nome ?? "",
      Valor: Number(a.valor ?? 0),
      Recebido: recebido,
      Repasse: (recebido * pct) / 100,
      Status: a.status,
      NF: a.nf_numero ?? "",
    };
  });

  const filename = `relatorio_${from}_a_${to}`;
  const summary = {
    Período: `${from} → ${to}`,
    Atendimentos: String(totals.qtd),
    Faturado: brl(totals.faturado),
    Recebido: brl(totals.recebido),
    "Repasse devido": brl(totals.repasse),
  };

  const onPDF = () =>
    exportPDF(
      filename,
      "Relatório financeiro",
      ["Nº", "Data", "Tutor/Pet", "Clínica", "Valor", "Recebido", "Repasse"],
      rows.map((r) => [r.Numero, r.Data, `${r.Tutor} / ${r.Pet}`, r.Clinica, brl(r.Valor), brl(r.Recebido), brl(r.Repasse)]),
      summary,
    );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Faturamento e repasses por período.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(filename, rows)} disabled={!rows.length}>
            <FileDown className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportXLSX(filename, rows)} disabled={!rows.length}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={onPDF} disabled={!rows.length}>
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </header>

      <Card className="border-border/60">
        <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-2"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-border/60"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Atendimentos</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{totals.qtd}</CardContent></Card>
        <Card className="border-border/60"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Faturado</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{brl(totals.faturado)}</CardContent></Card>
        <Card className="border-border/60"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Recebido</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-success">{brl(totals.recebido)}</CardContent></Card>
        <Card className="border-border/60"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Repasse devido</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{brl(totals.repasse)}</CardContent></Card>
      </div>

      <Card className="border-border/60">
        <CardHeader><CardTitle className="text-base">Detalhamento</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead><TableHead>Data</TableHead><TableHead>Tutor / Pet</TableHead><TableHead>Clínica</TableHead>
                <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Recebido</TableHead><TableHead className="text-right">Repasse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>}
              {data?.map((a: any) => {
                const recebido = Number(a.valor_recebido ?? 0);
                const repasse = (recebido * Number(a.clinics?.percentual_repasse ?? 0)) / 100;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.numero_interno}</TableCell>
                    <TableCell className="text-sm">{a.data_atendimento}</TableCell>
                    <TableCell className="text-sm">{a.tutor} / {a.pet}</TableCell>
                    <TableCell className="text-sm">{a.clinics?.nome ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{brl(Number(a.valor ?? 0))}</TableCell>
                    <TableCell className="text-right text-sm">{brl(recebido)}</TableCell>
                    <TableCell className="text-right text-sm">{brl(repasse)}</TableCell>
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
