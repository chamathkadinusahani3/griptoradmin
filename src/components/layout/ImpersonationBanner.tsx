import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/** Shown across every tenant page while a Super Admin is impersonating that tenant's Owner — always visible, never dismissible, so it's never possible to forget you're inside someone else's account. */
export function ImpersonationBanner() {
  const { user, exitImpersonation } = useAuth();
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);

  if (!user?.impersonatedBy) return null;

  const exit = async () => {
    setExiting(true);
    await exitImpersonation();
    navigate('/admin');
  };

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950">
      <AlertTriangleIcon className="h-4 w-4 shrink-0" />
      <span>
        Viewing as <strong>{user.name}</strong> ({user.garageName}) — impersonated by {user.impersonatorName ?? 'you'}
      </span>
      <button
        onClick={exit}
        disabled={exiting}
        className="rounded-full bg-amber-950 px-3 py-1 text-xs font-bold text-amber-50 transition hover:bg-amber-900 disabled:opacity-60">

        {exiting ? 'Exiting…' : 'Exit'}
      </button>
    </div>);

}
