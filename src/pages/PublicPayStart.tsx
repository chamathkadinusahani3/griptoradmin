import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { XCircleIcon } from 'lucide-react';
import { Logo } from '../components/layout/Logo';
import { formatCurrency } from '../lib/utils';
import { api, ApiError } from '../lib/api';
import { submitPayHereCheckout } from '../lib/payhereCheckout';

interface PayStartResponse {
  actionUrl: string;
  fields: Record<string, string>;
  invoiceNumber: string;
  balance: number;
}

// Landing page for a staff-shared payment link (api/customer-invoices/[id]/checkout.ts
// generates the link, api/public/pay/[token].ts resolves it). PayHere's
// checkout is a form POST, not a single URL to share, so this page's own
// job is just to fetch the real checkout fields and immediately auto-submit
// them — the visible UI here is only shown briefly, or if something fails.
export function PublicPayStart() {
  const { token } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ invoiceNumber: string; balance: number } | null>(null);

  useEffect(() => {
    if (!token) {
      setError('This payment link is invalid.');
      return;
    }
    api
      .get<PayStartResponse>(`/public/pay/${token}`)
      .then(({ actionUrl, fields, invoiceNumber, balance }) => {
        setInfo({ invoiceNumber, balance });
        submitPayHereCheckout(actionUrl, fields);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'This payment link is no longer valid.'));
  }, [token]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-soft-gray p-6 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-border-soft bg-white p-8 text-center shadow-soft-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex justify-center"><Logo /></div>

        {error ? (
          <div>
            <XCircleIcon className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 font-bold text-navy dark:text-slate-100">{error}</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-text-gray dark:text-slate-400">Redirecting you to a secure payment page…</p>
            {info && (
              <p className="mt-2 text-sm font-semibold text-navy dark:text-slate-100">
                Invoice {info.invoiceNumber} — {formatCurrency(info.balance)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
