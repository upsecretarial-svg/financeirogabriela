import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { RotateCcw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lixeira")({
  head: () => ({ meta: [{ title: "Lixeira" }] }),
  component: Lixeira,
});

function brl(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Lixeira() {
  const qc = useQueryClient();
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/", replace: true });
  }, [loading, isAdmin, navigate]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["lixeira"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, numero_interno, tutor, pet, data_atendimento, valor, deleted_at, clinics(nome)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({ deleted_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lixeira"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Atendimento restaurado.");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const hardDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lixeira"] });
      toast.success("Excluído permanentemente.");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Lixeira</h1>
        <p className="text-sm text-muted-foreground">
          Atendimentos excluídos. Você pode restaurar ou apagar permanentemente.
        </p>
      </header>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Excluídos</CardTitle>
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
                <TableHead>Excluído em</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : !rows?.length ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Lixeira vazia.</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.numero_interno}</TableCell>
                    <TableCell className="text-sm">{r.data_atendimento}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{r.tutor}</div>
                      <div className="text-xs text-muted-foreground">{r.pet}</div>
                    </TableCell>
                    <TableCell className="text-sm">{(r as any).clinics?.nome ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{brl(Number(r.valor))}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.deleted_at ? new Date(r.deleted_at).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => restore.mutate(r.id)}>
                        <RotateCcw className="mr-1 h-3 w-3" /> Restaurar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-2 text-destructive"
                        onClick={() =>
                          confirm("Apagar permanentemente? Esta ação não pode ser desfeita.") &&
                          hardDelete.mutate(r.id)
                        }
                      >
                        <Trash2 className="mr-1 h-3 w-3" /> Apagar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
