import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "aurora" | "plain";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  stats?: ReactNode;
  variant?: Variant;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  stats,
  variant = "aurora",
  className,
}: PageHeaderProps) {
  if (variant === "plain") {
    return (
      <header className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
        <div className="min-w-0">
          {badge && <div className="mb-1.5">{badge}</div>}
          <h1 className="text-2xl font-black tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    );
  }

  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-[var(--radius)] border border-border bg-card/50 p-6 backdrop-blur-3xl dark:border-white/10 md:p-8",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          {badge && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-indigo-200">
              {badge}
            </div>
          )}
          <h1 className="bg-gradient-to-r from-foreground via-indigo-600 to-fuchsia-600 bg-clip-text text-3xl font-black tracking-tight text-transparent dark:from-foreground dark:via-indigo-100 dark:to-fuchsia-200 md:text-4xl">
            {title}
          </h1>
          {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {(actions || stats) && (
          <div className="flex flex-col items-end gap-3">
            {stats && <div className="flex flex-wrap items-center gap-2">{stats}</div>}
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
      </div>
    </header>
  );
}
