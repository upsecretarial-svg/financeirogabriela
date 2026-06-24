import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, AlertCircle, CheckCircle2 } from "lucide-react";
import { TableState } from "@/components/data-state";

export const Route = createFileRoute("/_authenticated/pendencias")({
  head: () => ({ meta: [{ title: "Centro de Pendências" }] }),
  component: Pendencias,
});

const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function diasEm(date: string) {
  const ms = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function Pendencias() {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["pendencias-unpaid", search],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("id, numero_interno, data_atendimento, tutor, pet, valor, clinics(nome)")
        .is("deleted_at", null)
        .eq("pago", false)
        .order("data_atendimento", { ascending: true });
      if (search) q = q.or(`tutor.ilike.%${search}%,pet.ilike.%${search}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  const total = (data ?? []).reduce((s, a: any) => s + Number(a.valor ?? 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Pendências</h1>
        <p className="text-sm text-muted-foreground">
          Atendimentos que ainda não foram registrados como pagos.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pendências em aberto</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{data?.length ?? 0}</CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Valor total a receber</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-destructive">{brl(total)}</CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Em aberto</CardTitle>
            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
              <AlertCircle className="mr-1 h-3 w-3" /> {data?.length ?? 0}
            </Badge>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar tutor ou pet…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Tutor / Pet</TableHead>
                <TableHead>Clínica</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && !data?.length && (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">Nenhuma pendência. 🎉</TableCell></TableRow>
              )}
              {data?.map((p: any) => {
                const dias = diasEm(p.data_atendimento);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.numero_interno}</TableCell>
                    <TableCell className="text-sm">{p.data_atendimento}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={dias > 7 ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10 text-warning-foreground"}>
                        {dias}d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{p.tutor}</div>
                      <div className="text-xs text-muted-foreground">{p.pet}</div>
                    </TableCell>
                    <TableCell className="text-sm">{p.clinics?.nome ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{brl(p.valor)}</TableCell>
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
