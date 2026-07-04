import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Row of action buttons for tables — consistent size, spacing, alignment and tooltips.
 *
 *   <TableActions>
 *     <TableAction label="Editar" icon={Pencil} onClick={...} />
 *     <TableAction label="Excluir" icon={Trash2} tone="destructive" onClick={...} />
 *   </TableActions>
 */
export function TableActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          "flex items-center justify-end gap-0.5 whitespace-nowrap",
          className,
        )}
      >
        {children}
      </div>
    </TooltipProvider>
  );
}

type Tone = "default" | "success" | "destructive" | "muted";

const toneClass: Record<Tone, string> = {
  default: "text-muted-foreground hover:text-foreground",
  success: "text-success hover:text-success",
  destructive: "text-destructive hover:text-destructive",
  muted: "text-muted-foreground/70 hover:text-muted-foreground",
};

export interface TableActionProps
  extends Omit<ButtonProps, "size" | "children" | "title" | "aria-label"> {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
}

export const TableAction = React.forwardRef<HTMLButtonElement, TableActionProps>(
  ({ label, icon: Icon, tone = "default", className, variant = "ghost", disabled, ...props }, ref) => {
    const button = (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size="icon"
        aria-label={label}
        disabled={disabled}
        className={cn(
          "h-8 w-8 rounded-md transition-colors [&_svg]:size-4",
          toneClass[tone],
          className,
        )}
        {...props}
      >
        <Icon />
      </Button>
    );

    // Radix Tooltip won't fire on a disabled button. Wrap it so hover/touch still shows the label.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {disabled ? (
            <span className="inline-flex" tabIndex={0} aria-label={label}>
              {button}
            </span>
          ) : (
            button
          )}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  },
);
TableAction.displayName = "TableAction";
