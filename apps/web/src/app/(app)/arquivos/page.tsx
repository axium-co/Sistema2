'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FolderPlus, FolderOpen, Download, Trash2, RotateCcw, FileText, Image as ImageIcon, File as FileIcon, X, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, fileUrl } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Skeleton } from '@/components/ui';
import { formatDate, FILE_STATUS_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  UPLOADING: '#BFA27C',
  SCANNING: '#BFA27C',
  AVAILABLE: '#8FBF9F',
  QUARANTINED: '#C9A69B',
  DELETED: '#71717A',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#71717A';
  const icon =
    status === 'SCANNING' || status === 'UPLOADING' ? <Loader2 size={11} className="animate-spin" /> : status === 'QUARANTINED' ? <ShieldAlert size={11} /> : status === 'AVAILABLE' ? <ShieldCheck size={11} /> : null;
  return (
    <Badge color={color} className="gap-1">
      {icon}
      {FILE_STATUS_LABELS[status as keyof typeof FILE_STATUS_LABELS] ?? status}
    </Badge>
  );
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon size={16} />;
  if (mime.includes('pdf') || mime.startsWith('text/')) return <FileText size={16} />;
  return <FileIcon size={16} />;
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ArquivosPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState<string | undefined>();
  const [trash, setTrash] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);

  const { data: folders } = useQuery({ queryKey: ['folders'], queryFn: () => api.get<any[]>('/api/files/folders') });
  const { data: capabilities } = useQuery({
    queryKey: ['files-capabilities'],
    queryFn: () =>
      api.get<{ driver: string; directUpload: boolean; chunkedUpload?: boolean; chunkSizeMb?: number; scanEnabled: boolean; maxSizeMb: number }>(
        '/api/files/capabilities',
      ),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['files', folderId, trash],
    queryFn: () => api.get<{ items: any[]; total: number }>(`/api/files?pageSize=100${folderId ? `&folderId=${folderId}` : ''}${trash ? '&trashed=true' : ''}`),
  });

  const uploadChunked = async (file: File) => {
    const mimeType = file.type || 'application/octet-stream';
    const init = await api.post<{ uploadId: string; chunkSize: number; totalChunks: number }>('/api/files/uploads/init', {
      name: file.name,
      mimeType,
      size: file.size,
      folderId,
    });
    setProgress({ name: file.name, pct: 0 });
    try {
      for (let index = 0; index < init.totalChunks; index++) {
        const start = index * init.chunkSize;
        const part = file.slice(start, Math.min(start + init.chunkSize, file.size));
        for (let attempt = 0; ; attempt++) {
          try {
            const fd = new FormData();
            fd.append('chunk', part, `${file.name}.part${index}`);
            await api.post(`/api/files/uploads/${init.uploadId}/chunks/${index}`, fd);
            break;
          } catch (err) {
            if (attempt >= 2) throw err;
          }
        }
        setProgress({ name: file.name, pct: Math.round(((index + 1) / init.totalChunks) * 100) });
      }
      return await api.post(`/api/files/uploads/${init.uploadId}/complete`);
    } catch (err) {
      await api.del(`/api/files/uploads/${init.uploadId}`).catch(() => undefined);
      throw err;
    }
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (capabilities?.directUpload) {
        const presign = await api.post<{ id: string; uploadUrl: string; method: string; headers: Record<string, string> }>('/api/files/presign', {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          folderId,
        });
        const put = await fetch(presign.uploadUrl, { method: presign.method || 'PUT', headers: presign.headers, body: file });
        if (!put.ok) throw new Error('Falha ao enviar o arquivo para o storage');
        return api.post(`/api/files/${presign.id}/complete`);
      }
      if (capabilities?.chunkedUpload && file.size > (capabilities.chunkSizeMb ?? 5) * 1024 * 1024) {
        return uploadChunked(file);
      }
      const fd = new FormData();
      fd.append('file', file);
      if (folderId) fd.append('folderId', folderId);
      return api.post('/api/files/upload', fd);
    },
    onSuccess: () => {
      toast.success('Arquivo enviado — verificação de segurança em andamento');
      qc.invalidateQueries({ queryKey: ['files'] });
      qc.invalidateQueries({ queryKey: ['folders'] });
    },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setProgress(null),
  });

  const createFolder = useMutation({
    mutationFn: (name: string) => api.post('/api/files/folders', { name }),
    onSuccess: () => {
      setNewFolder(null);
      qc.invalidateQueries({ queryKey: ['folders'] });
    },
  });

  const delFolder = useMutation({ mutationFn: (id: string) => api.del(`/api/files/folders/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }) });
  const trashFile = useMutation({ mutationFn: (id: string) => api.post(`/api/files/${id}/trash`), onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }) });
  const restoreFile = useMutation({ mutationFn: (id: string) => api.post(`/api/files/${id}/restore`), onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }) });
  const purgeFile = useMutation({ mutationFn: (id: string) => api.del(`/api/files/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }) });
  const rescanFile = useMutation({ mutationFn: (id: string) => api.post(`/api/files/${id}/rescan`), onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }) });

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    Array.from(e.dataTransfer.files).forEach((f) => upload.mutate(f));
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Documentos"
        title="Arquivos"
        description="Propostas, contratos e materiais centralizados e vinculados."
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewFolder('')}>
              <FolderPlus size={15} /> Pasta
            </Button>
            <Button onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
              <Upload size={15} /> {upload.isPending ? 'Enviando…' : 'Enviar arquivo'}
            </Button>
          </>
        }
      />
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => Array.from(e.target.files ?? []).forEach((f) => upload.mutate(f))} />

      {progress && (
        <div className="mx-6 mb-4 lg:mx-8">
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="truncate">Enviando {progress.name}</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-fg/70 transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      <div className="grid gap-6 px-6 lg:grid-cols-[220px_1fr] lg:px-8">
        <div className="space-y-1">
          <button
            onClick={() => {
              setTrash(false);
              setFolderId(undefined);
            }}
            className={cn('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm', !folderId && !trash ? 'bg-white/5 text-fg' : 'text-muted hover:bg-white/5 hover:text-fg')}
          >
            <FolderOpen size={15} /> Todos os arquivos
          </button>
          {(folders ?? []).map((f) => (
            <div key={f.id} className="group flex items-center">
              <button
                onClick={() => {
                  setTrash(false);
                  setFolderId(f.id);
                }}
                className={cn('flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-sm', folderId === f.id ? 'bg-white/5 text-fg' : 'text-muted hover:bg-white/5 hover:text-fg')}
              >
                <FolderOpen size={15} /> <span className="truncate">{f.name}</span>
                <span className="ml-auto text-xs text-faint">{f._count?.files ?? 0}</span>
              </button>
              <button onClick={() => confirm(`Excluir a pasta ${f.name}?`) && delFolder.mutate(f.id)} className="p-1.5 text-faint opacity-0 hover:text-danger group-hover:opacity-100">
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              setTrash(true);
              setFolderId(undefined);
            }}
            className={cn('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm', trash ? 'bg-white/5 text-fg' : 'text-muted hover:bg-white/5 hover:text-fg')}
          >
            <Trash2 size={15} /> Lixeira
          </button>
        </div>

        <Card glow={false} onDragOver={(e: any) => e.preventDefault()} onDrop={onDrop}>
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (data?.items ?? []).length === 0 ? (
            <EmptyState
              icon={<Upload size={20} />}
              title={trash ? 'Lixeira vazia' : 'Nenhum arquivo'}
              description={trash ? 'Arquivos removidos aparecem aqui.' : 'Arraste arquivos para cá ou use o botão enviar.'}
              action={!trash ? <Button onClick={() => inputRef.current?.click()}>Enviar arquivo</Button> : undefined}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-eyebrow uppercase text-faint">
                  <th className="px-5 py-3 font-medium">Arquivo</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Tamanho</th>
                  <th className="px-5 py-3 font-medium">Enviado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data!.items.map((f) => (
                  <tr key={f.id} className="group hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-elevated text-muted">{fileIcon(f.mimeType)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-fg">{f.name}</p>
                          <p className="text-xs text-faint">{f.folder?.name ?? 'Sem pasta'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={trash ? 'DELETED' : f.status} />
                    </td>
                    <td className="px-5 py-3 text-muted">{humanSize(Number(f.sizeBytes))}</td>
                    <td className="px-5 py-3 text-muted">
                      {formatDate(f.createdAt)}
                      <span className="block text-xs text-faint">{f.uploader?.name}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {trash ? (
                          <>
                            <button onClick={() => restoreFile.mutate(f.id)} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg" title="Restaurar">
                              <RotateCcw size={14} />
                            </button>
                            <button onClick={() => confirm('Excluir definitivamente?') && purgeFile.mutate(f.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" title="Excluir">
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            {f.status === 'AVAILABLE' && (
                              <a href={fileUrl(f.id, true)} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg" title="Baixar">
                                <Download size={14} />
                              </a>
                            )}
                            {f.status === 'QUARANTINED' && (
                              <button onClick={() => rescanFile.mutate(f.id)} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg" title="Verificar novamente">
                                <RotateCcw size={14} />
                              </button>
                            )}
                            <button onClick={() => trashFile.mutate(f.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" title="Mover para lixeira">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Modal open={newFolder !== null} onClose={() => setNewFolder(null)} title="Nova pasta">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newFolder) createFolder.mutate(newFolder);
          }}
          className="space-y-4"
        >
          <Field label="Nome da pasta">
            <Input autoFocus required value={newFolder ?? ''} onChange={(e) => setNewFolder(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNewFolder(null)}>
              Cancelar
            </Button>
            <Button type="submit">Criar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
