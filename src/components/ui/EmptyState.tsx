import React from "react";
import { BoxIcon } from "lucide-react";
export function EmptyState({
  icon: Icon,
  title,
  description,
  action





}: {icon: BoxIcon;title: string;description?: string;action?: React.ReactNode;}) {
  return <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-light-blue text-teal dark:bg-teal/15">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-base font-bold text-navy dark:text-slate-100">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-text-gray dark:text-slate-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>;
}