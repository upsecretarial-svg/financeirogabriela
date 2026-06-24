import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/servicos")({
  head: () => ({ meta: [{ title: "Serviços" }] }),
  component: Page,
});

interface Service {
  id: string;
  nome: string;
  valor: number;
  custo: number;
  valor_final: number;
  ativo: boolean;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);

function Page() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Service> | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Service | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as Service[];
    },
  });

  const save = useMutation({
    mutationFn: async (row: Partial<Service>) => {
      const payload = {
        nome: (row.nome ?? "").trim(),
        valor: Number(row.valor ?? 0),
        custo: Number(row.custo ?? 0),
        valor_final: Number(row.valor_final ?? row.valor ?? 0),
        ativo: row.ativo ?? true,
      };
      if (!payload.nome) throw new Error("Informe o nome do serviço.");
      const { error } = row.id
        ? await supabase.from("services").update(payload).eq("id", row.id)
        : await supabase.from("services").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      toast.success("Serviço salvo.");
      setOpen(false);
      setEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      toast.success("Serviço excluído.");
      setConfirmDel(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () =>
    (setEdit({ nome: "", valor: 0, custo: 0, valor_final: 0, ativo: true }), setOpen(true));
  const openEdit = (s: Service) => (setEdit(s), setOpen(true));

  const margem = edit ? Number(edit.valor_final ?? 0) - Number(edit.custo ?? 0) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Serviços</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de serviços com valor, custo e valor final.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Novo serviço
        </Button>
      </header>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Valor final</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum serviço cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {data?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.valor)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.custo)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.valor_final)}</TableCell>
                  <TableCell>
                    <Badge variant={s.ativo ? "default" : "secondary"}>
                      {s.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => setConfirmDel(s)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEdit(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}
            >
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={edit.nome ?? ""}
                  onChange={(e) => setEdit({ ...edit, nome: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="valor">Valor</Label>
                  <Input
                    id="valor" type="number" step="0.01" min="0"
                    value={edit.valor ?? 0}
                    onChange={(e) => setEdit({ ...edit, valor: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custo">Custo</Label>
                  <Input
                    id="custo" type="number" step="0.01" min="0"
                    value={edit.custo ?? 0}
                    onChange={(e) => setEdit({ ...edit, custo: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vf">Valor final</Label>
                  <Input
                    id="vf" type="number" step="0.01" min="0"
                    value={edit.valor_final ?? 0}
                    onChange={(e) => setEdit({ ...edit, valor_final: Number(e.target.value) })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Margem estimada: <span className="font-medium text-foreground">{fmt(margem)}</span>
              </p>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Ativo</Label>
                  <p className="text-xs text-muted-foreground">Serviços inativos não aparecem em novos atendimentos.</p>
                </div>
                <Switch
                  checked={!!edit.ativo}
                  onCheckedChange={(v) => setEdit({ ...edit, ativo: v })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={save.isPending}>Salvar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDel?.nome}" será removido permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDel && del.mutate(confirmDel.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
