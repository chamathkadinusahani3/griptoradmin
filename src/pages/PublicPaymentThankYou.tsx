import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2Icon, XCircleIcon, ClockIcon } from 'lucide-react';
import { Logo } from '../components/layout/Logo';
import { formatCurrency } from '../lib/utils';
import { api } from '../lib/api';

interface InvoicePaymentStatus {
  invoiceNumber: string;
  total: number;
  balance: number;
  paymentStatus: 'Unpaid' | 'Partial' | 'Paid';
}

// Landing page after a PayHere checkout redirect (success or cancel) — UX
// reflection only. The notify callback (api/public/payhere-notify.ts) is
// the actual source of truth for marking an invoice paid, not this page or
// the redirect itself, so this just polls the invoice's current real status
// rather than trusting the ?cancelled= query param alone.
export function PublicPaymentThankYou() {
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get('invoiceId');
  const cancelled = searchParams.get('cancelled') === '1';
  const [status, setStatus] = useState<InvoicePaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!invoiceId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    api
      .get<InvoicePaymentStatus>(`/public/invoices/${invoiceId}/status`)
      .then(setStatus)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-soft-gray p-6 dark:bg-slate-950">
      <div className="w-full max-w-lg rounded-3xl border border-border-soft bg-white p-8 text-center shadow-soft-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex justify-center"><Logo /></div>

        {loading && <p className="text-sm text-text-gray dark:text-slate-400">Loading…</p>}

        {!loading && (notFound || !status) && (
          <div>
            <XCircleIcon className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 font-bold text-navy dark:text-slate-100">Invoice not found</p>
          </div>
        )}

        {!loading && status && status.paymentStatus === 'Paid' && (
          <div>
            <CheckCircle2Icon className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="mt-3 text-xl font-extrabold text-navy dark:text-slate-100">Payment received</h1>
            <p className="mt-1 text-sm text-text-gray dark:text-slate-400">
              Invoice {status.invoiceNumber} — {formatCurrency(status.total)} paid in full. Thank you!
            </p>
          </div>
        )}

        {!loading && status && status.paymentStatus !== 'Paid' && cancelled && (
          <div>
            <XCircleIcon className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h1 className="mt-3 text-xl font-extrabold text-navy dark:text-slate-100">Payment cancelled</h1>
            <p className="mt-1 text-sm text-text-gray dark:text-slate-400">
              Invoice {status.invoiceNumber} still has a balance of {formatCurrency(status.balance)}. You can try again anytime using the same payment link.
            </p>
          </div>
        )}

        {!loading && status && status.paymentStatus !== 'Paid' && !cancelled && (
          <div>
            <ClockIcon className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="mt-3 text-xl font-extrabold text-navy dark:text-slate-100">Processing…</h1>
            <p className="mt-1 text-sm text-text-gray dark:text-slate-400">
              We're still confirming your payment for invoice {status.invoiceNumber}. This usually only takes a moment — refresh in a bit if this doesn't update.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
