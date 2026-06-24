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

export const Route = createFileRoute("/_authenticated/clinicas")({
  head: () => ({ meta: [{ title: "Clínicas" }] }),
  component: Clinicas,
});

interface Clinic { id: string; nome: string; percentual_repasse: number; ativo: boolean; }

function Clinicas() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Clinic> | null>(null);
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["clinics"],
    queryFn: async () => (await supabase.from("clinics").select("*").order("nome")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (row: Partial<Clinic>) => {
      const payload = { nome: row.nome!, percentual_repasse: row.percentual_repasse ?? 0, ativo: row.ativo ?? true };
      if (row.id) {
        const { error } = await supabase.from("clinics").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clinics").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinics"] }); toast.success("Clínica salva."); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("clinics").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinics"] }); toast.success("Excluída."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clínicas</h1>
          <p className="text-sm text-muted-foreground">Cadastro de clínicas parceiras e % de repasse.</p>
        </div>
        <Button onClick={() => { setEdit({ nome: "", percentual_repasse: 0, ativo: true }); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Nova clínica
        </Button>
      </header>

      <Card className="border-border/60">
        <CardHeader><CardTitle className="text-base">Cadastradas</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nome</TableHead><TableHead>Repasse</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>{Number(c.percentual_repasse).toFixed(2)}%</TableCell>
                  <TableCell>{c.ativo ? "Ativa" : "Inativa"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEdit(c); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm("Excluir clínica?") && del.mutate(c.id)}>Excluir</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!data?.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Sem clínicas cadastradas.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Editar" : "Nova"} clínica</DialogTitle></DialogHeader>
          {edit && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={edit.nome ?? ""} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Percentual de repasse (%)</Label>
                <Input type="number" step="0.01" min="0" max="100"
                  value={edit.percentual_repasse ?? 0}
                  onChange={(e) => setEdit({ ...edit, percentual_repasse: Number(e.target.value) })} />
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
