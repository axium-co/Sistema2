import { cn } from '@/lib/utils';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 px-6 py-6 lg:px-8', className)}>
      <div>
        {eyebrow && <p className="text-eyebrow uppercase text-faint">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: 'success' | 'warning' | 'danger' | 'info';
}) {
  const color =
    accent === 'success'
      ? 'text-success'
      : accent === 'warning'
        ? 'text-warning'
        : accent === 'danger'
          ? 'text-danger'
          : accent === 'info'
            ? 'text-info'
            : 'text-fg';
  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-5">
      <p className="text-eyebrow uppercase text-faint">{label}</p>
      <p className={cn('mt-2 text-2xl font-extrabold tracking-tight', color)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
