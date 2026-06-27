import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { consumeAccessToken } from "@/lib/access-tokens.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/acesso/$token")({
  ssr: false,
  component: AccessTokenPage,
});

function AccessTokenPage() {
  const { token } = Route.useParams();
  const consume = useServerFn(consumeAccessToken);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { actionLink } = await consume({
          data: { token, redirectTo: `${window.location.origin}/` },
        });
        if (!cancelled) window.location.replace(actionLink);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Erro ao validar link.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, consume]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-destructive">Acesso não autorizado</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <a href="/auth" className="mt-4 inline-block text-sm underline">
              Ir para login
            </a>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Validando seu link de acesso…</p>
          </div>
        )}
      </div>
    </div>
  );
}
