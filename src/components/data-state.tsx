import { Loader2, AlertCircle, Inbox, type LucideIcon } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TableStateProps {
  colSpan: number;
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  skeletonRows?: number;
}

export function TableState({
  colSpan,
  isLoading,
  isError,
  isEmpty,
  error,
  onRetry,
  emptyTitle = "Nenhum registro encontrado",
  emptyDescription = "Ajuste os filtros ou adicione um novo lançamento.",
  emptyIcon: EmptyIcon = Inbox,
  skeletonRows = 5,
}: TableStateProps) {
  if (isLoading) {
    return (
      <>
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <TableRow key={i} className="hover:bg-transparent">
            {Array.from({ length: colSpan }).map((_, j) => (
              <TableCell key={j} className="py-3">
                <Skeleton className="h-4 w-full max-w-[140px]" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </>
    );
  }

  if (isError) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colSpan} className="py-12">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Não foi possível carregar</p>
              <p className="mt-1 text-xs text-muted-foreground">{error?.message ?? "Tente novamente em instantes."}</p>
            </div>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                Tentar novamente
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (isEmpty) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colSpan} className="py-16">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
              <EmptyIcon className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{emptyTitle}</p>
              <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
            </div>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return null;
}

export function PageLoader({ label = "Carregando…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground", className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
