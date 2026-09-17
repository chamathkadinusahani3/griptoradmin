import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TruckIcon, CheckIcon, XIcon, PackageIcon, BoxIcon, CameraIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Label } from '../../components/ui/Input';
import { SignaturePad } from '../../components/ui/SignaturePad';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { DeliveryNote } from '../../types/deliveryNote';
import { SalesOrder } from '../../types/salesOrder';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const MAX_PHOTO_BYTES = 1_500_000;

export function DeliveryNotes() {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<DeliveryNote | null>(null);
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ deliveryNotes: DeliveryNote[] }>('/delivery-notes')
      .then(({ deliveryNotes }) => setNotes(deliveryNotes))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load delivery notes'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const setStatus = async (note: DeliveryNote, action: 'pick' | 'pack' | 'cancel') => {
    setActingId(note.id);
    try {
      const { deliveryNote } = await api.patch<{ deliveryNote: DeliveryNote }>(`/delivery-notes/${note.id}`, { action });
      setNotes((prev) => prev.map((n) => (n.id === deliveryNote.id ? deliveryNote : n)));
      toast.success(
        action === 'pick' ? `${deliveryNote.deliveryNoteNumber} marked Picked` :
        action === 'pack' ? `${deliveryNote.deliveryNoteNumber} marked Packed` :
        `${deliveryNote.deliveryNoteNumber} cancelled`
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update delivery note');
    } finally {
      setActingId(null);
    }
  };

  const openConfirm = (note: DeliveryNote) => {
    setReceiverName('');
    setReceiverPhone('');
    setSignatureDataUrl(null);
    setPhotoDataUrl(null);
    setConfirmTarget(note);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Photo is too large — please pick a smaller image');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const submitConfirm = async () => {
    if (!confirmTarget) return;
    setConfirming(true);
    try {
      const { deliveryNote } = await api.post<{ deliveryNote: DeliveryNote; salesOrder: SalesOrder }>(`/delivery-notes/${confirmTarget.id}/confirm`, {
        receiverName: receiverName.trim() || undefined,
        receiverPhone: receiverPhone.trim() || undefined,
        signatureDataUrl: signatureDataUrl || undefined,
        photoDataUrl: photoDataUrl || undefined,
      });
      setNotes((prev) => prev.map((n) => (n.id === deliveryNote.id ? deliveryNote : n)));
      toast.success(`${deliveryNote.deliveryNoteNumber} confirmed — stock updated`);
      setConfirmTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to confirm delivery');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div>
      <PageHeader title="Delivery Notes" description="Every handover of goods to a customer against a sales order — created when you deliver one." />

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      notes.length === 0 ?
      <Card><EmptyState icon={TruckIcon} title="No deliveries yet" description="Fulfilling a sales order (in full or in part) will create a record here." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Delivery note</th>
                  <th className="px-5 py-3 font-bold">Sales order</th>
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 font-bold">Items</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Proof</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((n) =>
              <tr key={n.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{n.deliveryNoteNumber}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{n.salesOrderNumber ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{n.customerName ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{n.items.map((i) => `${i.name} × ${i.quantityDelivered}`).join(', ')}</td>
                    <td className="px-5 py-3"><StatusBadge status={n.status} /></td>
                    <td className="px-5 py-3 text-xs text-text-gray dark:text-slate-400">
                      {n.receiverName || n.signatureDataUrl || n.photoDataUrl ?
                    <span>
                          {n.receiverName ?? '—'}
                          {n.signatureDataUrl && ' · signed'}
                          {n.photoDataUrl && ' · photo'}
                        </span> :
                    '—'
                    }
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(n.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        {n.status === 'Pending' &&
                    <Button size="sm" variant="secondary" loading={actingId === n.id} onClick={() => setStatus(n, 'pick')}><BoxIcon className="h-3.5 w-3.5" /> Picked</Button>
                    }
                        {n.status === 'Picked' &&
                    <Button size="sm" variant="secondary" loading={actingId === n.id} onClick={() => setStatus(n, 'pack')}><PackageIcon className="h-3.5 w-3.5" /> Packed</Button>
                    }
                        {(n.status === 'Pending' || n.status === 'Picked' || n.status === 'Packed') &&
                    <>
                            <Button size="sm" onClick={() => openConfirm(n)}><CheckIcon className="h-3.5 w-3.5" /> Confirm</Button>
                            <Button size="sm" variant="ghost" loading={actingId === n.id} onClick={() => setStatus(n, 'cancel')}><XIcon className="h-3.5 w-3.5" /> Cancel</Button>
                          </>
                    }
                      </div>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }

      <Modal
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget ? `Confirm ${confirmTarget.deliveryNoteNumber}` : 'Confirm delivery'}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setConfirmTarget(null)}>Cancel</Button>
            <Button onClick={submitConfirm} loading={confirming}>Confirm delivery</Button>
          </>
        }>

        <p className="mb-4 text-xs text-text-gray dark:text-slate-400">
          Capturing proof of delivery is optional — leave any of this blank and confirm anyway.
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dn-receiver-name">Receiver name</Label>
              <Input id="dn-receiver-name" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="dn-receiver-phone">Receiver phone</Label>
              <Input id="dn-receiver-phone" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Signature</Label>
            <SignaturePad onChange={setSignatureDataUrl} />
          </div>
          <div>
            <Label htmlFor="dn-photo">Photo</Label>
            <input id="dn-photo" type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="block w-full text-sm text-text-gray file:mr-3 file:rounded-lg file:border-0 file:bg-soft-gray file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-navy dark:text-slate-400 dark:file:bg-slate-800 dark:file:text-slate-100" />
            {photoDataUrl &&
            <div className="mt-2 flex items-center gap-2">
                <img src={photoDataUrl} alt="Delivery proof" className="h-16 w-16 rounded-lg object-cover" />
                <span className="flex items-center gap-1 text-xs text-text-gray dark:text-slate-400"><CameraIcon className="h-3.5 w-3.5" /> Photo attached</span>
              </div>
            }
          </div>
        </div>
      </Modal>
    </div>);

}
