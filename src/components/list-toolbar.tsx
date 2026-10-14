import { type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  filters,
  actions,
  className,
}: ListToolbarProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.02] p-3 backdrop-blur-xl md:p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl border-white/10 bg-white/[0.03] pl-10 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-indigo-400/40"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {filters && <div className="flex flex-wrap gap-2">{filters}</div>}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

interface FilterChipProps {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}

export function FilterChip({ label, count, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all",
        active
          ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-100 shadow-[0_0_20px_rgba(99,102,241,0.2)]"
          : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-white",
      )}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={cn(
            "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            active ? "bg-indigo-400/30 text-white" : "bg-white/10 text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
