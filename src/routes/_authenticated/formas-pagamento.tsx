import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/formas-pagamento")({
  head: () => ({ meta: [{ title: "Formas de Pagamento" }] }),
  component: Page,
});

interface PM { id: string; nome: string; ativo: boolean; }

function Page() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<PM> | null>(null);
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => (await supabase.from("payment_methods").select("*").order("nome")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (row: Partial<PM>) => {
      const payload = { nome: row.nome!, ativo: row.ativo ?? true };
      const { error } = row.id
        ? await supabase.from("payment_methods").update(payload).eq("id", row.id)
        : await supabase.from("payment_methods").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payment-methods"] }); toast.success("Salvo."); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("payment_methods").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payment-methods"] }); toast.success("Excluído."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Formas de Pagamento</h1>
          <p className="text-sm text-muted-foreground">Métodos disponíveis para registrar recebimentos.</p>
        </div>
        <Button onClick={() => { setEdit({ nome: "", ativo: true }); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Nova
        </Button>
      </header>

      <Card className="border-border/60">
        <CardHeader><CardTitle className="text-base">Cadastradas</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell>{m.ativo ? "Ativa" : "Inativa"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEdit(m); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm("Excluir?") && del.mutate(m.id)}>Excluir</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Editar" : "Nova"} forma de pagamento</DialogTitle></DialogHeader>
          {edit && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={edit.nome ?? ""} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} required />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>Ativa</Label>
                <Switch checked={!!edit.ativo} onCheckedChange={(v) => setEdit({ ...edit, ativo: v })} />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={save.isPending}>Salvar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
