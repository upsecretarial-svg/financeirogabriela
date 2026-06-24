import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  nome: z.string().min(1),
  role: z.enum(["admin", "vet"]),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Acesso negado.");
}

/**
 * Bootstrap do primeiro administrador.
 * Só funciona se ainda NÃO existir nenhum admin no sistema.
 */
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; password: string; nome: string }) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      nome: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: hasAdmin, error: rpcErr } = await supabaseAdmin.rpc("has_any_admin");
    if (rpcErr) throw new Error(rpcErr.message);
    if (hasAdmin) throw new Error("Já existe um administrador cadastrado.");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error) throw new Error(error.message);
    if (!created.user) throw new Error("Falha ao criar usuário.");

    await supabaseAdmin.from("profiles").upsert({ id: created.user.id, email: data.email, nome: data.nome });
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "admin" });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, userId: created.user.id };
  });

/** Cria usuário (apenas admin). */
export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string; nome: string; role: "admin" | "vet" }) =>
    createUserSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error) throw new Error(error.message);
    if (!created.user) throw new Error("Falha ao criar usuário.");

    await supabaseAdmin.from("profiles").upsert({ id: created.user.id, email: data.email, nome: data.nome });
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: data.role });
    return { ok: true, userId: created.user.id };
  });

/** Lista usuários com último acesso e status (apenas admin). */
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, email, ativo, created_at")
      .order("created_at", { ascending: false });
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");

    // Pull auth metadata (last_sign_in, banned_until) page by page
    const authMap = new Map<string, { last_sign_in_at: string | null; banned_until: string | null }>();
    let page = 1;
    while (true) {
      const { data: au, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      for (const u of au.users) {
        authMap.set(u.id, {
          last_sign_in_at: u.last_sign_in_at ?? null,
          banned_until: (u as { banned_until?: string | null }).banned_until ?? null,
        });
      }
      if (au.users.length < 200) break;
      page += 1;
    }

    return (profiles ?? []).map((p) => {
      const a = authMap.get(p.id);
      const bannedUntil = a?.banned_until ?? null;
      const blocked = !!(bannedUntil && new Date(bannedUntil).getTime() > Date.now());
      return {
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
        last_sign_in_at: a?.last_sign_in_at ?? null,
        blocked,
      };
    });
  });

/** Excluir usuário. */
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a si mesmo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Enviar e-mail de redefinição de senha. */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; redirectTo?: string }) =>
    z.object({ email: z.string().email(), redirectTo: z.string().url().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Definir nova senha diretamente (admin). */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Bloquear / desbloquear acesso. */
export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; blocked: boolean }) =>
    z.object({ userId: z.string().uuid(), blocked: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode bloquear a si mesmo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // ban_duration: long string for block, "none" to unblock
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.blocked ? "876000h" : "none",
    } as Parameters<typeof supabaseAdmin.auth.admin.updateUserById>[1]);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ ativo: !data.blocked }).eq("id", data.userId);
    return { ok: true };
  });

/** Atualizar nome / papel do usuário. */
export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; nome?: string; role?: "admin" | "vet" }) =>
    z.object({
      userId: z.string().uuid(),
      nome: z.string().min(1).optional(),
      role: z.enum(["admin", "vet"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.nome) {
      await supabaseAdmin.from("profiles").update({ nome: data.nome }).eq("id", data.userId);
    }
    if (data.role) {
      // Replace roles
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    }
    return { ok: true };
  });

/** Revogar todas as sessões ativas do usuário (força logout em todos os dispositivos). */
export const revokeUserSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.signOut(data.userId, "global");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Listar eventos de login recentes com nome/email do usuário. */
export const listLoginEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) =>
    z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 100;
    const { data: events, error } = await supabaseAdmin
      .from("login_events")
      .select("id, user_id, tipo, ip, user_agent, criado_em")
      .order("criado_em", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((events ?? []).map((e) => e.user_id).filter(Boolean)));
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, nome, email").in("id", ids)
      : { data: [] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (events ?? []).map((e) => ({
      ...e,
      nome: map.get(e.user_id)?.nome ?? null,
      email: map.get(e.user_id)?.email ?? null,
    }));
  });

/** Estatísticas administrativas. */
export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [{ count: totalProfiles }, { count: admins }, { count: loginsWeek }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin"),
      supabaseAdmin.from("login_events").select("*", { count: "exact", head: true }).gte("criado_em", sevenDaysAgo),
    ]);

    // count blocked by paginating auth users
    let blocked = 0;
    let page = 1;
    while (true) {
      const { data: au, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      for (const u of au.users) {
        const bu = (u as { banned_until?: string | null }).banned_until ?? null;
        if (bu && new Date(bu).getTime() > Date.now()) blocked += 1;
      }
      if (au.users.length < 200) break;
      page += 1;
    }

    return {
      total: totalProfiles ?? 0,
      admins: admins ?? 0,
      blocked,
      loginsWeek: loginsWeek ?? 0,
    };
  });
