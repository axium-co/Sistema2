'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FolderPlus, FolderOpen, Download, Trash2, RotateCcw, FileText, Image as ImageIcon, File as FileIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, fileUrl } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, EmptyState, Field, Input, Modal, Skeleton } from '@/components/ui';
import { formatDate } from '@/lib/labels';
import { cn } from '@/lib/utils';

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

  const { data: folders } = useQuery({ queryKey: ['folders'], queryFn: () => api.get<any[]>('/api/files/folders') });
  const { data, isLoading } = useQuery({
    queryKey: ['files', folderId, trash],
    queryFn: () => api.get<{ items: any[]; total: number }>(`/api/files?pageSize=100${folderId ? `&folderId=${folderId}` : ''}${trash ? '&trashed=true' : ''}`),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      if (folderId) fd.append('folderId', folderId);
      return api.post('/api/files/upload', fd);
    },
    onSuccess: () => {
      toast.success('Arquivo enviado');
      qc.invalidateQueries({ queryKey: ['files'] });
      qc.invalidateQueries({ queryKey: ['folders'] });
    },
    onError: (e: any) => toast.error(e.message),
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
                            <a href={fileUrl(f.id, true)} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg" title="Baixar">
                              <Download size={14} />
                            </a>
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
