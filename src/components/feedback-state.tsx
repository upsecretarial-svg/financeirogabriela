import { type LucideIcon, Loader2, AlertCircle, Inbox, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Variant = "empty" | "error" | "no-results";

interface FeedbackStateProps {
  variant?: Variant;
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function FeedbackState({
  variant = "empty",
  icon,
  title,
  description,
  action,
  className,
}: FeedbackStateProps) {
  const Icon =
    icon ??
    (variant === "no-results" ? SearchX : variant === "error" ? AlertCircle : Inbox);
  const tone =
    variant === "error"
      ? "text-destructive"
      : variant === "no-results"
        ? "text-indigo-300"
        : "text-muted-foreground";
  const bg =
    variant === "error"
      ? "bg-destructive/10"
      : variant === "no-results"
        ? "bg-indigo-500/10"
        : "bg-white/5";
  return (
    <div
      className={cn(
        "grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center",
        className,
      )}
    >
      <div className={cn("grid h-14 w-14 place-items-center rounded-2xl", bg, tone)}>
        <Icon className="h-7 w-7" />
      </div>
      <div className="mt-4 text-sm font-semibold text-foreground">{title}</div>
      {description && (
        <div className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</div>
      )}
      {action && (
        <Button size="sm" variant="outline" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function LoadingState({
  label = "Carregando…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] py-14 text-sm text-muted-foreground",
        className,
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
        <Loader2 className="relative h-6 w-6 animate-spin text-primary" />
      </div>
      {label}
    </div>
  );
}
