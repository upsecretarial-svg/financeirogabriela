import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listUsers,
  createUser,
  deleteUser,
  sendPasswordReset,
  setUserPassword,
  setUserBlocked,
  updateUser,
  revokeUserSessions,
  listLoginEvents,
  adminStats,
} from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, KeyRound, Lock, Unlock, Trash2, Pencil, Mail, LogOut, Search, Users, ShieldAlert, ShieldCheck, Activity } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Super Admin" }] }),
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

type LoginEvent = {
  id: string;
  user_id: string;
  tipo: string;
  ip: string | null;
  user_agent: string | null;
  criado_em: string;
  nome: string | null;
  email: string | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function StatCard({ icon: Icon, label, value, tone = "default" }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; tone?: "default" | "success" | "destructive" | "warning" }) {
  const tones: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/15 text-warning-foreground",
  };
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Usuarios() {
  const { isAdmin, user } = useAuth();
  const isSuperAdmin = (user?.email ?? "").toLowerCase() === "upsecretarial@gmail.com" && isAdmin;

  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const remove = useServerFn(deleteUser);
  const reset = useServerFn(sendPasswordReset);
  const setPass = useServerFn(setUserPassword);
  const setBlocked = useServerFn(setUserBlocked);
  const update = useServerFn(updateUser);
  const revoke = useServerFn(revokeUserSessions);
  const events = useServerFn(listLoginEvents);
  const stats = useServerFn(adminStats);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", password: "", role: "vet" as "admin" | "vet" });
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState("");
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "blocked">("all");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "vet">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => list(),
    enabled: isSuperAdmin,
  });
  const { data: statsData } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => stats(),
    enabled: isSuperAdmin,
  });
  const { data: eventsData } = useQuery({
    queryKey: ["login-events"],
    queryFn: () => events({ data: { limit: 100 } }),
    enabled: isSuperAdmin,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const createMut = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => { toast.success("Usuário criado."); invalidate(); setOpen(false); setForm({ nome: "", email: "", password: "", role: "vet" }); },
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
  const revokeMut = useMutation({
    mutationFn: (userId: string) => revoke({ data: { userId } }),
    onSuccess: () => toast.success("Sessões encerradas."),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const arr = (data as UserRow[] | undefined) ?? [];
    const q = search.trim().toLowerCase();
    return arr.filter((u) => {
      if (filterStatus === "active" && u.blocked) return false;
      if (filterStatus === "blocked" && !u.blocked) return false;
      if (filterRole !== "all" && !u.roles.includes(filterRole)) return false;
      if (q && !u.nome.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, filterStatus, filterRole]);

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta área é exclusiva do administrador master (<strong>upsecretarial@gmail.com</strong>).
        </p>
      </div>
    );
  }
  // unreachable placeholder
  if (false) {

    return <p className="text-sm text-muted-foreground">Acesso restrito ao administrador.</p>;
  }

  const s = statsData as { total: number; admins: number; blocked: number; loginsWeek: number } | undefined;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Super Admin</h1>
          <p className="text-sm text-muted-foreground">Controle total: usuários, sessões, acessos e auditoria.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Novo usuário</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Users} label="Usuários" value={s?.total ?? "—"} />
        <StatCard icon={ShieldCheck} label="Administradores" value={s?.admins ?? "—"} tone="success" />
        <StatCard icon={ShieldAlert} label="Bloqueados" value={s?.blocked ?? "—"} tone="destructive" />
        <StatCard icon={Activity} label="Logins (7 dias)" value={s?.loginsWeek ?? "—"} tone="warning" />
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="events">Acessos recentes</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Cadastrados</CardTitle>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar por nome ou e-mail…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="blocked">Bloqueados</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterRole} onValueChange={(v) => setFilterRole(v as typeof filterRole)}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos papéis</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="vet">Veterinária</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
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
                  {!isLoading && !filtered.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</TableCell></TableRow>}
                  {filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.nome}</TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell className="space-x-1">
                        {u.roles.length ? u.roles.map((r) => <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}
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
                            <DropdownMenuItem onClick={() => setEditUser({ ...u })}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => resetMut.mutate(u.email)}><Mail className="mr-2 h-4 w-4" /> Enviar redefinição por e-mail</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setPwUser(u); setNewPw(""); }}><KeyRound className="mr-2 h-4 w-4" /> Definir nova senha</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => revokeMut.mutate(u.id)}><LogOut className="mr-2 h-4 w-4" /> Encerrar sessões</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {u.blocked ? (
                              <DropdownMenuItem onClick={() => blockMut.mutate({ userId: u.id, blocked: false })}><Unlock className="mr-2 h-4 w-4" /> Desbloquear acesso</DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => blockMut.mutate({ userId: u.id, blocked: true })}><Lock className="mr-2 h-4 w-4" /> Bloquear acesso</DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => confirm(`Excluir ${u.email}?`) && delMut.mutate(u.id)}>
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
        </TabsContent>

        <TabsContent value="events">
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Últimos 100 acessos</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>User-Agent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!(eventsData as LoginEvent[] | undefined)?.length && (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Sem registros.</TableCell></TableRow>
                  )}
                  {(eventsData as LoginEvent[] | undefined)?.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{fmtDate(e.criado_em)}</TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{e.nome ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{e.email ?? e.user_id}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{e.tipo}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{e.ip ?? "—"}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground" title={e.user_agent ?? ""}>{e.user_agent ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
                <Select value={(editUser.roles[0] as "admin" | "vet") ?? "vet"} onValueChange={(v) => setEditUser({ ...editUser, roles: [v] })}>
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
