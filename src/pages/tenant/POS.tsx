import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ScanBarcodeIcon, PlusIcon, MinusIcon, Trash2Icon, ShoppingCartIcon, CreditCardIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Part } from '../../types/part';
import { Sale } from '../../types/sale';
import { Branch } from '../../types/branch';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface CartLine {
  part: Part;
  qty: number;
}

export function POS() {
  const { user } = useAuth();
  // Preview only — the server always recomputes tax authoritatively
  // (api/_lib/accounting.ts's getTaxRatePct) at checkout.
  const taxRatePct = user?.taxRatePct ?? 8;
  const [parts, setParts] = useState<Part[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Bank Transfer' | 'Other'>('Cash');

  const loadParts = () => {
    api
      .get<{ parts: Part[] }>(`/parts${branchId ? `?branchId=${branchId}` : ''}`)
      .then(({ parts }) => setParts(parts))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load parts'));
  };

  useEffect(loadParts, [branchId]);
  useEffect(() => {
    api
      .get<{ branches: Branch[] }>('/branches')
      .then(({ branches }) => {
        setBranches(branches);
        const defaultBranch = branches.find((b) => b.isDefault);
        if (defaultBranch) setBranchId(defaultBranch.id);
      })
      .catch(() => setBranches([]));
  }, []);

  const results = useMemo(
    () => parts.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || (p.barcode ?? '').includes(query)),
    [parts, query]
  );

  const add = (part: Part) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.part.id === part.id);
      if (existing) return prev.map((l) => l.part.id === part.id ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { part, qty: 1 }];
    });
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
    prev.
    map((l) => l.part.id === id ? { ...l, qty: l.qty + delta } : l).
    filter((l) => l.qty > 0)
    );
  };

  const remove = (id: string) => setCart((prev) => prev.filter((l) => l.part.id !== id));

  const subtotal = cart.reduce((s, l) => s + l.part.price * l.qty, 0);
  const tax = subtotal * (taxRatePct / 100);
  const total = subtotal + tax;

  const checkout = async () => {
    setCheckingOut(true);
    try {
      const { sale } = await api.post<{ sale: Sale }>('/sales', {
        items: cart.map((l) => ({ partId: l.part.id, qty: l.qty })),
        branchId: branchId || undefined,
        paymentMethod,
      });
      setCart([]);
      loadParts();
      toast.success(`Sale completed — ${formatCurrency(sale.total)} charged`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div>
      <PageHeader title="Point of Sale" description="Scan or search parts, build a cart, and check out." />

      {branches.length > 1 &&
      <div className="mb-4 max-w-xs">
          <Select
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setCart([]); // cart lines reference a specific branch's stock
          }}>

            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
      }

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Product search */}
        <div className="lg:col-span-3">
          <Card>
            <div className="border-b border-border-soft p-4 dark:border-slate-800">
              <Input icon={ScanBarcodeIcon} placeholder="Scan barcode or search parts…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search or scan parts" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
              {results.map((p) =>
              <button
                key={p.id}
                onClick={() => add(p)}
                className="rounded-xl border border-border-soft p-3 text-left transition hover:border-bright-blue hover:bg-light-blue/40 dark:border-slate-800 dark:hover:bg-slate-800">

                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-light-blue text-teal dark:bg-teal/15">
                    <ScanBarcodeIcon className="h-5 w-5" />
                  </div>
                  <p className="line-clamp-2 text-sm font-bold text-navy dark:text-slate-100">{p.name}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm font-extrabold text-navy dark:text-slate-100">{formatCurrency(p.price)}</span>
                    <span className="text-xs text-slate-400">{p.stock} in stock</span>
                  </div>
                </button>
              )}
              {results.length === 0 && <p className="col-span-full py-8 text-center text-sm text-slate-400">No matching parts</p>}
            </div>
          </Card>
        </div>

        {/* Cart */}
        <div className="lg:col-span-2">
          <Card className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-border-soft p-4 dark:border-slate-800">
              <ShoppingCartIcon className="h-5 w-5 text-teal" />
              <h3 className="font-bold text-navy dark:text-slate-100">Current sale</h3>
              {cart.length > 0 && <span className="ml-auto rounded-full bg-light-blue px-2 py-0.5 text-xs font-bold text-teal dark:bg-teal/15 dark:text-cyan">{cart.reduce((s, l) => s + l.qty, 0)} items</span>}
            </div>

            {cart.length === 0 ?
            <EmptyState icon={ShoppingCartIcon} title="Cart is empty" description="Add parts from the left to start a sale." /> :

            <>
                <div className="scrollbar-thin max-h-[42vh] flex-1 divide-y divide-border-soft overflow-y-auto dark:divide-slate-800">
                  {cart.map((l) =>
                <div key={l.part.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-navy dark:text-slate-100">{l.part.name}</p>
                        <p className="text-xs text-text-gray dark:text-slate-400">{formatCurrency(l.part.price)} each</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => changeQty(l.part.id, -1)} className="rounded-lg border border-border-soft p-1 text-text-gray transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" aria-label="Decrease quantity">
                          <MinusIcon className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-bold text-navy dark:text-slate-100">{l.qty}</span>
                        <button onClick={() => changeQty(l.part.id, 1)} className="rounded-lg border border-border-soft p-1 text-text-gray transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" aria-label="Increase quantity">
                          <PlusIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="w-16 text-right text-sm font-extrabold text-navy dark:text-slate-100">{formatCurrency(l.part.price * l.qty)}</span>
                      <button onClick={() => remove(l.part.id)} className="rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10" aria-label="Remove item">
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </div>
                )}
                </div>

                <div className="border-t border-border-soft p-4 dark:border-slate-800">
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-text-gray dark:text-slate-400"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                    <div className="flex justify-between text-text-gray dark:text-slate-400"><span>Tax ({taxRatePct}%)</span><span>{formatCurrency(tax)}</span></div>
                    <div className="flex justify-between border-t border-border-soft pt-2 text-base font-extrabold text-navy dark:border-slate-800 dark:text-slate-100"><span>Total</span><span>{formatCurrency(total)}</span></div>
                  </div>
                  <Select
                    aria-label="Payment method"
                    className="mt-3"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>

                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Other">Other</option>
                  </Select>
                  <Button className="mt-3 w-full" size="lg" loading={checkingOut} onClick={checkout}>
                    <CreditCardIcon className="h-4 w-4" /> Charge {formatCurrency(total)}
                  </Button>
                </div>
              </>
            }
          </Card>
        </div>
      </div>
    </div>);

}
