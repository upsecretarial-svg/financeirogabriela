import { Plus, Search, RotateCcw, CalendarDays, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AppointmentsToolbarProps {
  search: string;
  from: string;
  to: string;
  count: number | undefined;
  onSearchChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onNew: () => void;
}

export function AppointmentsToolbar({ search, from, to, count, onSearchChange, onFromChange, onToChange, onNew }: AppointmentsToolbarProps) {
  const reset = () => {
    const date = new Date();
    onSearchChange("");
    onFromChange(new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10));
    onToChange(new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10));
  };

  return (
    <>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border pb-7">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            <ClipboardList className="h-4 w-4 shrink-0" /> Atendimento clínico
          </div>
          <h1 className="text-3xl font-bold text-foreground sm:text-4xl">Atendimentos</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">Registro e acompanhamento dos atendimentos.</p>
        </div>
        <Button onClick={onNew} className="h-12 gap-2 rounded-lg px-4 text-sm font-semibold shadow-none sm:px-5">
          <Plus className="h-5 w-5 shrink-0" /> <span className="hidden sm:inline">Novo atendimento</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </header>
      <section aria-label="Filtros de atendimentos" className="space-y-5 py-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="text-lg font-semibold">Lista de atendimentos</h2>
          <span className="shrink-0 text-sm text-muted-foreground">{count === undefined ? "Carregando…" : `${count} registros`}</span>
        </div>
        <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,220px)_minmax(150px,180px)_minmax(150px,180px)_auto]">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="appointments-search" className="text-sm font-medium">Buscar atendimento</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
              <Input id="appointments-search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Tutor, pet ou número interno" className="h-12 bg-card pl-10 text-base shadow-none" />
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="appointments-month" className="flex items-center gap-1.5 text-sm font-medium"><CalendarDays className="h-4 w-4 text-primary" /> Mês de referência</Label>
            <Input id="appointments-month" type="month" value={from.slice(0, 7)} className="h-12 bg-card text-sm shadow-none" onChange={(event) => {
              if (!event.target.value) return;
              const [year, month] = event.target.value.split("-").map(Number);
              onFromChange(new Date(year, month - 1, 1).toISOString().slice(0, 10));
              onToChange(new Date(year, month, 0).toISOString().slice(0, 10));
            }} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="appointments-from" className="text-sm font-medium">De</Label>
            <Input id="appointments-from" type="date" value={from} onChange={(event) => onFromChange(event.target.value)} className="h-12 bg-card text-sm shadow-none" />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="appointments-to" className="text-sm font-medium">Até</Label>
            <Input id="appointments-to" type="date" value={to} onChange={(event) => onToChange(event.target.value)} className="h-12 bg-card text-sm shadow-none" />
          </div>
          <Button variant="outline" onClick={reset} className="h-12 gap-2 bg-card shadow-none" title="Voltar ao mês atual">
            <RotateCcw className="h-4 w-4" /> Limpar
          </Button>
        </div>
      </section>
    </>
  );
}