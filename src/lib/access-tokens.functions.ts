import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SUPER_ADMIN_EMAIL = "upsecretarial@gmail.com";

async function assertAdmin(context: { supabase: any; userId: string; claims?: any }) {
  const email = (context.claims?.email ?? "").toString().toLowerCase();
  if (email !== SUPER_ADMIN_EMAIL) throw new Error("Acesso negado.");
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const listAccessTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("access_tokens")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createAccessToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { email: string; label?: string; ttlHours: number | null }) =>
    z.object({
      email: z.string().email(),
      label: z.string().optional(),
      ttlHours: z.number().int().min(1).max(24 * 365).nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const token = randomToken();
    const expiresAt =
      data.ttlHours == null
        ? null
        : new Date(Date.now() + data.ttlHours * 3600 * 1000).toISOString();
    const { data: row, error } = await context.supabase
      .from("access_tokens")
      .insert({
        token,
        email: data.email.toLowerCase(),
        label: data.label ?? null,
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAccessToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("access_tokens")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeAccessToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renewAccessToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; ttlHours: number | null }) =>
    z.object({
      id: z.string().uuid(),
      ttlHours: z.number().int().min(1).max(24 * 365).nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const expiresAt =
      data.ttlHours == null
        ? null
        : new Date(Date.now() + data.ttlHours * 3600 * 1000).toISOString();
    const { data: row, error } = await context.supabase
      .from("access_tokens")
      .update({ expires_at: expiresAt, revoked_at: null })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const consumeAccessToken = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; redirectTo?: string }) =>
    z.object({
      token: z.string().min(10),
      redirectTo: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("access_tokens")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Link inválido.");
    if (row.revoked_at) throw new Error("Link revogado.");
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
      throw new Error("Link expirado.");

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: row.email,
      options: { redirectTo: data.redirectTo },
    });
    if (linkErr) throw new Error(linkErr.message);
    const actionLink = link?.properties?.action_link;
    if (!actionLink) throw new Error("Falha ao gerar link de acesso.");

    await supabaseAdmin
      .from("access_tokens")
      .update({ used_at: new Date().toISOString(), used_count: (row.used_count ?? 0) + 1 })
      .eq("id", row.id);

    return { actionLink };
  });
