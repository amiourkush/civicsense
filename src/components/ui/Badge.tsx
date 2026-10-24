import React from 'react';
import { cn, STATUS_COLORS, PRIORITY_COLORS } from '../../lib/utils';
import type { ComplaintStatus, ComplaintPriority } from '../../types';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  const colors = STATUS_COLORS[status];
  return (
    <Badge className={cn(colors.bg, colors.text, 'border', colors.border)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
      {status}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: ComplaintPriority }) {
  const colors = PRIORITY_COLORS[priority];
  return (
    <Badge className={cn(colors.bg, colors.text, 'border', colors.border)}>
      {priority === 'Critical' && <span className="animate-pulse mr-0.5">!</span>}
      {priority}
    </Badge>
  );
}

export function DuplicateBadge() {
  return (
    <Badge className="bg-purple-50 text-purple-700 border border-purple-200">
      🔗 Duplicate
    </Badge>
  );
}

export function OverdueBadge() {
  return (
    <Badge className="bg-red-50 text-red-700 border border-red-200 animate-pulse">
      ⏱ Overdue
    </Badge>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-govblue-600" />
      {category}
    </span>
  );
}
