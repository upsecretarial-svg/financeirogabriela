import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listAccessTokens,
  createAccessToken,
  revokeAccessToken,
  deleteAccessToken,
  renewAccessToken,
  togglePermanentHold,
} from "@/lib/access-tokens.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Infinity as InfinityIcon, Link2Off, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/links-acesso")({
  component: LinksAcessoPage,
});

function LinksAcessoPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAccessTokens);
  const create = useServerFn(createAccessToken);
  const revoke = useServerFn(revokeAccessToken);
  const remove = useServerFn(deleteAccessToken);
  const renew = useServerFn(renewAccessToken);

  const { data, isLoading } = useQuery({
    queryKey: ["access-tokens"],
    queryFn: () => list(),
  });

  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [ttlHours, setTtlHours] = useState(24);
  const [permanent, setPermanent] = useState(false);

  const createMut = useMutation({
    mutationFn: (vars: { email: string; label?: string; ttlHours: number | null }) =>
      create({ data: vars }),
    onSuccess: () => {
      toast.success("Link gerado com sucesso");
      setEmail("");
      setLabel("");
      setPermanent(false);
      qc.invalidateQueries({ queryKey: ["access-tokens"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao gerar link"),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Link revogado");
      qc.invalidateQueries({ queryKey: ["access-tokens"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao revogar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Link excluído");
      qc.invalidateQueries({ queryKey: ["access-tokens"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir"),
  });

  const renewMut = useMutation({
    mutationFn: (vars: { id: string; ttlHours: number | null }) => renew({ data: vars }),
    onSuccess: () => {
      toast.success("Link renovado");
      qc.invalidateQueries({ queryKey: ["access-tokens"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao renovar"),
  });

  const buildUrl = (token: string) => `${window.location.origin}/acesso/${token}`;

  const statusOf = (row: any) => {
    if (row.revoked_at) return { label: "Revogado", variant: "destructive" as const };
    if (!row.expires_at) return { label: "Permanente", variant: "default" as const };
    if (new Date(row.expires_at).getTime() < Date.now())
      return { label: "Expirado", variant: "secondary" as const };
    return { label: "Ativo", variant: "default" as const };
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Links de Acesso</h1>
        <p className="text-sm text-muted-foreground">
          Gere links temporários para entrar no sistema sem senha. Cada link tem expiração e pode ser revogado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gerar novo link</CardTitle>
          <CardDescription>O destinatário entrará automaticamente como esse e-mail.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-[1fr_1fr_140px_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email) return;
              createMut.mutate({
                email,
                label: label || undefined,
                ttlHours: permanent ? null : ttlHours,
              });
            }}
          >
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@exemplo.com"
                required
              />
            </div>
            <div>
              <Label>Identificação (opcional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Acesso temporário Douglas" />
            </div>
            <div>
              <Label>Expira em (horas)</Label>
              <Input
                type="number"
                min={1}
                max={8760}
                value={ttlHours}
                disabled={permanent}
                onChange={(e) => setTtlHours(Number(e.target.value) || 1)}
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={permanent}
                  onCheckedChange={(v) => setPermanent(v === true)}
                />
                Acesso permanente (sem expiração)
              </label>
            </div>
            <div className="flex items-start">
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar link"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links existentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum link gerado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">E-mail</th>
                    <th className="py-2 pr-3">Identificação</th>
                    <th className="py-2 pr-3">Expira</th>
                    <th className="py-2 pr-3">Usos</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row: any) => {
                    const s = statusOf(row);
                    const url = buildUrl(row.token);
                    return (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{row.email}</td>
                        <td className="py-2 pr-3">{row.label ?? "—"}</td>
                        <td className="py-2 pr-3">
                          {row.expires_at ? new Date(row.expires_at).toLocaleString("pt-BR") : "Permanente"}
                        </td>
                        <td className="py-2 pr-3">{row.used_count ?? 0}</td>
                        <td className="py-2 pr-3"><Badge variant={s.variant}>{s.label}</Badge></td>
                        <td className="py-2 pr-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                await navigator.clipboard.writeText(url);
                                toast.success("Link copiado");
                              }}
                              disabled={s.label !== "Ativo" && s.label !== "Permanente"}
                            >
                              <Copy className="mr-1 h-3 w-3" /> Copiar
                            </Button>
                            {!row.revoked_at && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => revokeMut.mutate(row.id)}
                                disabled={revokeMut.isPending}
                              >
                                <Link2Off className="mr-1 h-3 w-3" /> Revogar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const input = prompt(
                                  "Renovar por quantas horas? (deixe vazio para tornar permanente)",
                                  row.expires_at ? "24" : "",
                                );
                                if (input === null) return;
                                const trimmed = input.trim();
                                const ttl = trimmed === "" ? null : Number(trimmed);
                                if (ttl !== null && (!Number.isFinite(ttl) || ttl < 1)) {
                                  toast.error("Informe um número válido de horas.");
                                  return;
                                }
                                renewMut.mutate({ id: row.id, ttlHours: ttl });
                              }}
                              disabled={renewMut.isPending}
                            >
                              <RefreshCw className="mr-1 h-3 w-3" /> Renovar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("Excluir este link permanentemente?")) {
                                  deleteMut.mutate(row.id);
                                }
                              }}
                              disabled={deleteMut.isPending}
                            >
                              <Trash2 className="mr-1 h-3 w-3" /> Excluir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
