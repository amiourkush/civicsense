import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ComplaintStatus, ComplaintPriority, ComplaintCategory } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Status color system ──────────────────────────────────
export const STATUS_COLORS: Record<ComplaintStatus, { bg: string; text: string; border: string; dot: string }> = {
  New: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', dot: 'bg-slate-500' },
  Acknowledged: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300', dot: 'bg-blue-500' },
  Assigned: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-300', dot: 'bg-indigo-500' },
  'In Progress': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', dot: 'bg-amber-500' },
  Resolved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300', dot: 'bg-emerald-500' },
  Closed: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-300', dot: 'bg-green-600' },
  Rejected: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300', dot: 'bg-red-500' },
  Duplicate: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-300', dot: 'bg-purple-500' },
};

// ── Priority color system ────────────────────────────────
export const PRIORITY_COLORS: Record<ComplaintPriority, { bg: string; text: string; border: string }> = {
  Low: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
  Medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  High: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  Critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

// ── Category icons / colors ──────────────────────────────
export const CATEGORY_COLORS: Record<ComplaintCategory, string> = {
  'Waste & Garbage': '#10b981',
  'Roads & Potholes': '#f59e0b',
  Streetlights: '#fbbf24',
  'Water Supply': '#3b82f6',
  Drainage: '#6366f1',
  'Parks & Recreation': '#22c55e',
  'Noise Pollution': '#ec4899',
  Other: '#94a3b8',
};

// ── Date helpers ─────────────────────────────────────────
import { formatDistanceToNow, format, isAfter, parseISO } from 'date-fns';

export function formatRelative(dateStr: string): string {
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'dd MMM yyyy');
}

export function formatDateTime(dateStr: string): string {
  return format(parseISO(dateStr), 'dd MMM yyyy, h:mm a');
}

export function isOverdue(dueDateStr: string, status: ComplaintStatus): boolean {
  if (['Resolved', 'Closed', 'Rejected', 'Duplicate'].includes(status)) return false;
  return isAfter(new Date(), parseISO(dueDateStr));
}

// ── SLA helpers ──────────────────────────────────────────
// Default SLA days by priority
export const SLA_DAYS: Record<ComplaintPriority, number> = {
  Critical: 1,
  High: 3,
  Medium: 7,
  Low: 14,
};

export function computeDueDate(reportedAt: string, priority: ComplaintPriority): string {
  const d = parseISO(reportedAt);
  d.setDate(d.getDate() + SLA_DAYS[priority]);
  return d.toISOString();
}

// ── Misc ─────────────────────────────────────────────────
export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
