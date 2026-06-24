import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listUsers,
  createUser,
  deleteUser,
  sendPasswordReset,
  setUserPassword,
  setUserBlocked,
  updateUser,
} from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, KeyRound, Lock, Unlock, Trash2, Pencil, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários" }] }),
  component: Usuarios,
});

type UserRow = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  roles: string[];
  last_sign_in_at: string | null;
  blocked: boolean;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Usuarios() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const remove = useServerFn(deleteUser);
  const reset = useServerFn(sendPasswordReset);
  const setPass = useServerFn(setUserPassword);
  const setBlocked = useServerFn(setUserBlocked);
  const update = useServerFn(updateUser);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", password: "", role: "vet" as "admin" | "vet" });
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState("");
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => list(),
    enabled: isAdmin,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const createMut = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => {
      toast.success("Usuário criado.");
      invalidate();
      setOpen(false);
      setForm({ nome: "", email: "", password: "", role: "vet" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (userId: string) => remove({ data: { userId } }),
    onSuccess: () => { invalidate(); toast.success("Excluído."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: (email: string) => reset({ data: { email, redirectTo: `${window.location.origin}/auth` } }),
    onSuccess: () => toast.success("E-mail de redefinição enviado."),
    onError: (e: Error) => toast.error(e.message),
  });

  const blockMut = useMutation({
    mutationFn: (v: { userId: string; blocked: boolean }) => setBlocked({ data: v }),
    onSuccess: (_d, v) => { invalidate(); toast.success(v.blocked ? "Usuário bloqueado." : "Usuário desbloqueado."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pwMut = useMutation({
    mutationFn: () => setPass({ data: { userId: pwUser!.id, password: newPw } }),
    onSuccess: () => { toast.success("Senha redefinida."); setPwUser(null); setNewPw(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMut = useMutation({
    mutationFn: () => update({ data: { userId: editUser!.id, nome: editUser!.nome, role: (editUser!.roles[0] as "admin" | "vet") ?? "vet" } }),
    onSuccess: () => { invalidate(); toast.success("Usuário atualizado."); setEditUser(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">Acesso restrito ao administrador.</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">Gerencie acessos, papéis, senhas e bloqueios.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Novo usuário</Button>
      </header>

      <Card className="border-border/60">
        <CardHeader><CardTitle className="text-base">Cadastrados</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>}
              {(data as UserRow[] | undefined)?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome}</TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell className="space-x-1">
                    {u.roles.map((r) => <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>)}
                  </TableCell>
                  <TableCell>
                    {u.blocked
                      ? <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">Bloqueado</Badge>
                      : <Badge variant="outline" className="border-success/40 bg-success/10 text-success">Ativo</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(u.last_sign_in_at)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditUser({ ...u })}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resetMut.mutate(u.email)}>
                          <Mail className="mr-2 h-4 w-4" /> Enviar redefinição por e-mail
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setPwUser(u); setNewPw(""); }}>
                          <KeyRound className="mr-2 h-4 w-4" /> Definir nova senha
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {u.blocked ? (
                          <DropdownMenuItem onClick={() => blockMut.mutate({ userId: u.id, blocked: false })}>
                            <Unlock className="mr-2 h-4 w-4" /> Desbloquear acesso
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => blockMut.mutate({ userId: u.id, blocked: true })}>
                            <Lock className="mr-2 h-4 w-4" /> Bloquear acesso
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => confirm(`Excluir ${u.email}?`) && delMut.mutate(u.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Novo usuário */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}>
            <div className="space-y-2"><Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div className="space-y-2"><Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-2"><Label>Senha (mín. 8 caracteres)</Label>
              <Input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div className="space-y-2"><Label>Papel</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "admin" | "vet" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vet">Veterinária</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMut.isPending}>{createMut.isPending ? "Criando…" : "Criar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Editar usuário */}
      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
          {editUser && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); editMut.mutate(); }}>
              <div className="space-y-2"><Label>Nome</Label>
                <Input value={editUser.nome} onChange={(e) => setEditUser({ ...editUser, nome: e.target.value })} required />
              </div>
              <div className="space-y-2"><Label>E-mail</Label>
                <Input value={editUser.email} disabled />
              </div>
              <div className="space-y-2"><Label>Papel</Label>
                <Select
                  value={(editUser.roles[0] as "admin" | "vet") ?? "vet"}
                  onValueChange={(v) => setEditUser({ ...editUser, roles: [v] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vet">Veterinária</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditUser(null)}>Cancelar</Button>
                <Button type="submit" disabled={editMut.isPending}>{editMut.isPending ? "Salvando…" : "Salvar"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Nova senha */}
      <Dialog open={!!pwUser} onOpenChange={(v) => { if (!v) { setPwUser(null); setNewPw(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Definir nova senha</DialogTitle></DialogHeader>
          {pwUser && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); pwMut.mutate(); }}>
              <p className="text-sm text-muted-foreground">Usuário: <span className="font-medium text-foreground">{pwUser.email}</span></p>
              <div className="space-y-2"><Label>Nova senha (mín. 8 caracteres)</Label>
                <Input type="password" minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => { setPwUser(null); setNewPw(""); }}>Cancelar</Button>
                <Button type="submit" disabled={pwMut.isPending}>{pwMut.isPending ? "Salvando…" : "Redefinir"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
