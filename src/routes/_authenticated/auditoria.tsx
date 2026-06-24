import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Histórico de Alterações" }] }),
  component: Auditoria,
});

function Auditoria() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id, tabela, registro_id, acao, criado_em, user_id, profiles:user_id(nome,email)")
        .order("criado_em", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico de Alterações</h1>
        <p className="text-sm text-muted-foreground">Últimas 200 alterações registradas.</p>
      </header>

      <Card className="border-border/60">
        <CardHeader><CardTitle className="text-base">Eventos</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>Tabela</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Registro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && !data?.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Sem eventos.</TableCell></TableRow>}
              {data?.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(e.criado_em).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-sm">{e.profiles?.nome ?? e.profiles?.email ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{e.tabela}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={
                      e.acao === "DELETE" ? "bg-destructive/15 text-destructive"
                      : e.acao === "INSERT" ? "bg-success/15 text-success"
                      : "bg-accent text-accent-foreground"
                    }>{e.acao}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{e.registro_id?.slice(0, 8)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
