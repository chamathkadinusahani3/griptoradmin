import React from "react";
import { cn } from "../../lib/utils";
import { BoxIcon } from "lucide-react";
const base = 'w-full rounded-xl border border-border-soft bg-white text-sm text-navy placeholder:text-slate-400 transition focus:border-bright-blue focus:ring-2 focus:ring-bright-blue/30 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';
export function Label({
  children,
  htmlFor



}: {children: React.ReactNode;htmlFor?: string;}) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-navy dark:text-slate-200">
      {children}
    </label>;
}
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: BoxIcon;
}
export function Input({
  icon: Icon,
  className,
  ...props
}: InputProps) {
  return <div className="relative">
      {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      <input className={cn(base, 'h-10 px-3.5', Icon && 'pl-9', className)} {...props} />
    </div>;
}
export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, 'min-h-[96px] px-3.5 py-2.5', className)} {...props} />;
}
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, 'h-10 px-3.5', className)} {...props}>
      {children}
    </select>;
}