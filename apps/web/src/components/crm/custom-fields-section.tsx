'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Field, Input } from '@/components/ui';

interface CustomFieldDef {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options?: { choices?: string[] } | null;
}

interface CustomFieldRow {
  field: CustomFieldDef;
  value: unknown;
}

export function CustomFieldsSection({ entityType, entityId }: { entityType: string; entityId: string }) {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['custom-values', entityType, entityId],
    queryFn: () => api.get<CustomFieldRow[]>(`/api/crm/custom-fields/values?entityType=${entityType}&entityId=${entityId}`),
    enabled: !!entityId,
  });

  const setValue = useMutation({
    mutationFn: (payload: { customFieldId: string; value: unknown }) =>
      api.put('/api/crm/custom-fields/values', { entityId, ...payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-values', entityType, entityId] }),
    onError: (e: any) => toast.error(e.message),
  });

  if (!data || data.length === 0) return null;

  return (
    <div>
      <span className="text-xs font-medium text-muted">Campos personalizados</span>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {data.map(({ field, value }) => (
          <Field key={field.id} label={field.label}>
            {field.type === 'boolean' ? (
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  defaultChecked={!!value}
                  onChange={(e) => setValue.mutate({ customFieldId: field.id, value: e.target.checked })}
                />
                {value ? 'Sim' : 'Não'}
              </label>
            ) : field.type === 'select' ? (
              <select
                defaultValue={value != null ? String(value) : ''}
                onChange={(e) => setValue.mutate({ customFieldId: field.id, value: e.target.value || null })}
                className="w-full rounded-xl border border-white/10 bg-surface px-3.5 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                <option value="">—</option>
                {(field.options?.choices ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                defaultValue={value != null ? String(value) : ''}
                onBlur={(e) =>
                  setValue.mutate({
                    customFieldId: field.id,
                    value: field.type === 'number' ? Number(e.target.value) : e.target.value || null,
                  })
                }
              />
            )}
          </Field>
        ))}
      </div>
    </div>
  );
}
