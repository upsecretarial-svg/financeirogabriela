import { supabase } from "@/integrations/supabase/client";

export async function logLoginEvent(tipo: "login" | "logout" | "bootstrap" | "password_reset") {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    await supabase.from("login_events").insert({
      user_id: uid,
      tipo,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
  } catch {
    // best-effort, never block auth flow
  }
}
