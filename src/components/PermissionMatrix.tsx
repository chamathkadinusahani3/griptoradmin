import React, { useMemo } from 'react';
import { groupPermissionsByModule, titleCase } from '../lib/permissionGroups';

interface Props {
  /** Every permission key that could possibly be granted (api/_lib/permissions.ts's full PERMISSIONS catalog). */
  allPermissions: string[];
  selected: string[];
  onToggle: (key: string) => void;
  onToggleMany: (keys: string[], checked: boolean) => void;
}

/**
 * Shared module-grouped, checkbox-grid permission picker — used identically
 * by the tenant-side Roles & Permissions page and the Super Admin per-user
 * permission override modal, so both stay visually and behaviorally in
 * sync. Sections follow each product module's own display order (Core /
 * General last, for tenant-wide resources with no module of their own —
 * see permissionGroups.ts), each with a "select all" checkbox in its header
 * and one row per resource listing whichever real action checkboxes that
 * resource actually has (View/Manage for most, a handful of standalone
 * single-action resources like Staff/Roles/Settings).
 */
export function PermissionMatrix({ allPermissions, selected, onToggle, onToggleMany }: Props) {
  const groups = useMemo(() => groupPermissionsByModule(allPermissions), [allPermissions]);

  return (
    <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-border-soft dark:border-slate-800">
      {groups.map((g) => {
        const groupKeys = g.resources.flatMap((r) => r.keys);
        const allChecked = groupKeys.length > 0 && groupKeys.every((k) => selected.includes(k));
        return (
          <div key={g.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
            <div className="flex items-center justify-between bg-soft-gray px-3 py-2 dark:bg-slate-800/60">
              <p className="text-xs font-bold uppercase tracking-wide text-navy dark:text-slate-100">{g.name}</p>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-gray dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => onToggleMany(groupKeys, !allChecked)}
                  className="h-3.5 w-3.5 rounded border-border-soft text-teal focus:ring-teal dark:border-slate-700" />

                Select all
              </label>
            </div>
            <div className="divide-y divide-border-soft dark:divide-slate-800">
              {g.resources.map((r) =>
              <div key={r.resource} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2">
                  <p className="w-40 shrink-0 text-sm font-semibold text-navy dark:text-slate-200">{titleCase(r.resource)}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {r.keys.map((k) => {
                    const action = k.split(':')[1];
                    return (
                      <label key={k} className="flex items-center gap-1.5 text-sm text-text-gray dark:text-slate-400">
                          <input
                          type="checkbox"
                          checked={selected.includes(k)}
                          onChange={() => onToggle(k)}
                          className="h-4 w-4 rounded border-border-soft text-teal focus:ring-teal dark:border-slate-700" />

                          {titleCase(action)}
                        </label>);

                  })}
                  </div>
                </div>
              )}
            </div>
          </div>);

      })}
    </div>);

}
