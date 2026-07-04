import { cn } from "@/lib/utils.ts";

export const STATUS_META: Record<
  string,
  { label: string; className: string; active?: boolean }
> = {
  queued: { label: "Na fila", className: "bg-muted text-muted-foreground" },
  creating_repo: {
    label: "Criando repo",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    active: true,
  },
  provisioning_sandbox: {
    label: "Subindo sandbox",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    active: true,
  },
  migrating: {
    label: "Migrando",
    className: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    active: true,
  },
  migrating2: {
    label: "Migrando",
    className: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    active: true,
  },
  migrating3: {
    label: "Migrando",
    className: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    active: true,
  },
  installing_sync: {
    label: "Instalando sync",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    active: true,
  },
  validating: {
    label: "Validando paridade",
    className: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    active: true,
  },
  validating2: {
    label: "Validando paridade",
    className: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    active: true,
  },
  validating3: {
    label: "Validando paridade",
    className: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    active: true,
  },
  deploying_cf: {
    label: "Deploy CF",
    className: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    active: true,
  },
  done: {
    label: "100% TanStack",
    className: "bg-primary/20 text-emerald-700 dark:text-emerald-300",
  },
  needs_human: {
    label: "Precisa de humano",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  paused: { label: "Pausado", className: "bg-muted text-muted-foreground" },
  failed: {
    label: "Falhou",
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  archived: { label: "Arquivado", className: "bg-muted text-muted-foreground" },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        meta.className,
      )}
    >
      {meta.active && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {meta.label}
    </span>
  );
}
