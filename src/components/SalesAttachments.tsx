import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PaperclipIcon, UploadIcon, TrashIcon, FileTextIcon, ImageIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Attachment } from '../types/attachment';
import { uploadSalesAttachment, SalesAttachmentDocType } from '../lib/salesAttachmentUpload';
import { formatDate } from '../lib/utils';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface SalesAttachmentsProps {
  docType: SalesAttachmentDocType;
  /** e.g. `/quotations/${id}/attachments` */
  basePath: string;
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
}

/**
 * Sales Module Phase 16 — a single reusable attach/view/remove control used
 * identically by Quotations, Sales Orders, Customer Invoices, and Returns
 * (a signed PO, a delivery photo, a payment slip), since all four documents
 * share the exact same attachment shape and API surface
 * (routes/<doc>/[id]/attachments.ts). Only `docType`/`basePath` differ per
 * caller.
 */
export function SalesAttachmentsButton({ docType, basePath, attachments, onChange }: SalesAttachmentsProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0 || !user?.clientId) return;
    setUploading(true);
    for (const file of files) {
      try {
        const uploaded = await uploadSalesAttachment(user.clientId, docType, file);
        const { attachments: updated } = await api.post<{ attachments: Attachment[] }>(basePath, uploaded);
        onChange(updated);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : `Failed to attach ${file.name}`);
      }
    }
    setUploading(false);
  };

  const remove = async (url: string) => {
    setRemovingUrl(url);
    try {
      const { attachments: updated } = await api.delete<{ attachments: Attachment[] }>(`${basePath}?url=${encodeURIComponent(url)}`);
      onChange(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove attachment');
    } finally {
      setRemovingUrl(null);
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <PaperclipIcon className="h-3.5 w-3.5" /> Attachments{attachments.length > 0 ? ` (${attachments.length})` : ''}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Attachments"
        footer={<Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>}
      >
        <div className="space-y-3">
          <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleFiles} />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} loading={uploading}>
            <UploadIcon className="h-3.5 w-3.5" /> Upload file
          </Button>

          {attachments.length === 0 ? (
            <p className="text-sm text-text-gray dark:text-slate-400">No attachments yet — a signed PO, a delivery photo, or a payment slip, for example.</p>
          ) : (
            <ul className="divide-y divide-border-soft dark:divide-slate-800">
              {attachments.map((a) => (
                <li key={a.url} className="flex items-center justify-between gap-3 py-2.5">
                  <a href={a.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm text-navy hover:underline dark:text-slate-100">
                    {a.contentType?.startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0 text-text-gray dark:text-slate-500" /> : <FileTextIcon className="h-4 w-4 shrink-0 text-text-gray dark:text-slate-500" />}
                    <span className="truncate">{a.name}</span>
                  </a>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-text-gray dark:text-slate-500">{formatDate(a.uploadedAt)}</span>
                    <button
                      type="button"
                      onClick={() => remove(a.url)}
                      disabled={removingUrl === a.url}
                      className="flex items-center justify-center rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
