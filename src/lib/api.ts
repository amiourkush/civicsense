// ============================================================
// CivicSense – Mock REST API Layer
// ============================================================
// All functions simulate async REST endpoints with a small
// artificial delay. To swap in a real backend, replace each
// function body with a fetch() call to your API endpoint.
//
// Example swap for GET /complaints:
//   export async function getComplaints(filters) {
//     const params = new URLSearchParams(filters);
//     const res = await fetch(`/api/complaints?${params}`);
//     if (!res.ok) throw new Error('Failed to fetch complaints');
//     return res.json();
//   }
// ============================================================

import { SEED_COMPLAINTS } from '../data/complaints';
import { MOCK_USERS, MOCK_CREDENTIALS } from '../data/users';
import type {
  Complaint,
  ComplaintStatus,
  ComplaintCategory,
  ComplaintPriority,
  Department,
  Evidence,
  TimelineEntry,
  User,
} from '../types';
import { isAfter, parseISO } from 'date-fns';

// In-memory state (simulates a database)
let complaints: Complaint[] = JSON.parse(JSON.stringify(SEED_COMPLAINTS));

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// ──────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
): Promise<User> {
  await delay(500);
  const expectedPwd = MOCK_CREDENTIALS[email];
  if (!expectedPwd || expectedPwd !== password) {
    throw new Error('Invalid credentials');
  }
  const user = MOCK_USERS.find((u) => u.email === email);
  if (!user) throw new Error('User not found');
  return user;
}

export async function logout(): Promise<void> {
  await delay(200);
}

// ──────────────────────────────────────────────────────────
// Complaints – Read
// ──────────────────────────────────────────────────────────

export interface ComplaintFilters {
  search?: string;
  category?: ComplaintCategory;
  status?: ComplaintStatus;
  department?: Department;
  priority?: ComplaintPriority;
  dateFrom?: string;
  dateTo?: string;
  /** If set, only return complaints for this department (role-based) */
  scopedDepartment?: Department;
}

export async function getComplaints(
  filters: ComplaintFilters = {},
): Promise<Complaint[]> {
  await delay(300);
  let result = [...complaints];

  // Role-based scoping
  if (filters.scopedDepartment) {
    result = result.filter(
      (c) => c.assignedDepartment === filters.scopedDepartment,
    );
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.location.address.toLowerCase().includes(q),
    );
  }
  if (filters.category) result = result.filter((c) => c.category === filters.category);
  if (filters.status) result = result.filter((c) => c.status === filters.status);
  if (filters.department) result = result.filter((c) => c.assignedDepartment === filters.department);
  if (filters.priority) result = result.filter((c) => c.priority === filters.priority);
  if (filters.dateFrom) {
    const from = parseISO(filters.dateFrom);
    result = result.filter((c) => isAfter(parseISO(c.reportedAt), from));
  }
  if (filters.dateTo) {
    const to = parseISO(filters.dateTo);
    result = result.filter((c) => !isAfter(parseISO(c.reportedAt), to));
  }

  return result;
}

export async function getComplaintById(id: string): Promise<Complaint | null> {
  await delay(200);
  return complaints.find((c) => c.id === id) ?? null;
}

// ──────────────────────────────────────────────────────────
// Complaints – Write
// ──────────────────────────────────────────────────────────

export async function updateComplaintStatus(
  id: string,
  newStatus: ComplaintStatus,
  changedBy: string,
  note?: string,
): Promise<Complaint> {
  await delay(400);
  const idx = complaints.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Complaint ${id} not found`);

  const entry: TimelineEntry = {
    id: `tl-${Date.now()}`,
    status: newStatus,
    changedBy,
    changedAt: new Date().toISOString(),
    note,
  };

  complaints[idx] = {
    ...complaints[idx],
    status: newStatus,
    timeline: [...complaints[idx].timeline, entry],
  };

  return complaints[idx];
}

export async function assignComplaint(
  id: string,
  department: Department,
  officer: string,
  changedBy: string,
): Promise<Complaint> {
  await delay(400);
  const idx = complaints.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Complaint ${id} not found`);

  const prevStatus = complaints[idx].status;
  const newStatus: ComplaintStatus =
    prevStatus === 'New' || prevStatus === 'Acknowledged' ? 'Assigned' : prevStatus;

  const entry: TimelineEntry = {
    id: `tl-${Date.now()}`,
    status: newStatus,
    changedBy,
    changedAt: new Date().toISOString(),
    note: `Assigned to ${department} – ${officer}`,
  };

  complaints[idx] = {
    ...complaints[idx],
    assignedDepartment: department,
    assignedOfficer: officer,
    status: newStatus,
    timeline: [...complaints[idx].timeline, entry],
  };

  return complaints[idx];
}

export async function addEvidence(
  id: string,
  evidence: Omit<Evidence, 'id' | 'uploadedAt'>,
): Promise<Complaint> {
  await delay(400);
  const idx = complaints.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Complaint ${id} not found`);

  const newEv: Evidence = {
    ...evidence,
    id: `ev-${Date.now()}`,
    uploadedAt: new Date().toISOString(),
  };

  complaints[idx] = {
    ...complaints[idx],
    evidence: [...complaints[idx].evidence, newEv],
  };

  return complaints[idx];
}

export async function mergeComplaint(
  duplicateId: string,
  primaryId: string,
  changedBy: string,
): Promise<void> {
  await delay(400);

  const dupIdx = complaints.findIndex((c) => c.id === duplicateId);
  const primIdx = complaints.findIndex((c) => c.id === primaryId);
  if (dupIdx === -1 || primIdx === -1) throw new Error('Complaint not found');

  const entry: TimelineEntry = {
    id: `tl-${Date.now()}`,
    status: 'Duplicate',
    changedBy,
    changedAt: new Date().toISOString(),
    note: `Merged into ${primaryId} as duplicate.`,
  };

  // Mark duplicate
  complaints[dupIdx] = {
    ...complaints[dupIdx],
    status: 'Duplicate',
    duplicateOf: primaryId,
    timeline: [...complaints[dupIdx].timeline, entry],
  };

  // Update primary with merged list
  complaints[primIdx] = {
    ...complaints[primIdx],
    mergedComplaints: [
      ...(complaints[primIdx].mergedComplaints ?? []),
      duplicateId,
    ],
  };
}

export async function bulkUpdateStatus(
  ids: string[],
  status: ComplaintStatus,
  changedBy: string,
): Promise<void> {
  await delay(500);
  for (const id of ids) {
    await updateComplaintStatus(id, status, changedBy);
  }
}

export async function bulkAssign(
  ids: string[],
  department: Department,
  officer: string,
  changedBy: string,
): Promise<void> {
  await delay(500);
  for (const id of ids) {
    await assignComplaint(id, department, officer, changedBy);
  }
}

// ──────────────────────────────────────────────────────────
// Analytics
// ──────────────────────────────────────────────────────────

export async function getAnalytics() {
  await delay(300);
  const all = [...complaints];
  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);

  const overdue = all.filter(
    (c) =>
      c.status !== 'Resolved' &&
      c.status !== 'Closed' &&
      c.status !== 'Rejected' &&
      c.status !== 'Duplicate' &&
      isAfter(now, parseISO(c.dueDate)),
  );

  const resolvedThisWeek = all.filter(
    (c) => {
      const lastEntry = c.timeline[c.timeline.length - 1];
      return (
        c.status === 'Resolved' &&
        lastEntry &&
        isAfter(parseISO(lastEntry.changedAt), oneWeekAgo)
      );
    }
  );

  // Avg resolution time in days (only for resolved complaints)
  const resolved = all.filter((c) => c.status === 'Resolved' || c.status === 'Closed');
  const avgResolutionMs =
    resolved.length > 0
      ? resolved.reduce((sum, c) => {
          const start = parseISO(c.reportedAt).getTime();
          const lastEntry = c.timeline[c.timeline.length - 1];
          const end = lastEntry
            ? parseISO(lastEntry.changedAt).getTime()
            : now.getTime();
          return sum + (end - start);
        }, 0) / resolved.length
      : 0;
  const avgResolutionDays = avgResolutionMs / (1000 * 60 * 60 * 24);

  // Category breakdown
  const categoryMap: Record<string, number> = {};
  const statusMap: Record<string, number> = {};
  const departmentMap: Record<string, number> = {};

  for (const c of all) {
    categoryMap[c.category] = (categoryMap[c.category] ?? 0) + 1;
    statusMap[c.status] = (statusMap[c.status] ?? 0) + 1;
    if (c.assignedDepartment) {
      departmentMap[c.assignedDepartment] = (departmentMap[c.assignedDepartment] ?? 0) + 1;
    }
  }

  // 30-day trend (complaints per day)
  const trendMap: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    trendMap[key] = 0;
  }
  for (const c of all) {
    const key = c.reportedAt.slice(0, 10);
    if (key in trendMap) trendMap[key]++;
  }

  return {
    kpi: {
      total: all.length,
      open: all.filter((c) => c.status === 'New' || c.status === 'Acknowledged').length,
      inProgress: all.filter((c) => c.status === 'In Progress' || c.status === 'Assigned').length,
      resolved: resolved.length,
      overdue: overdue.length,
      resolvedThisWeek: resolvedThisWeek.length,
      resolvedThisWeekPct:
        all.length > 0 ? Math.round((resolvedThisWeek.length / all.length) * 100) : 0,
      avgResolutionDays: Math.round(avgResolutionDays * 10) / 10,
    },
    categoryBreakdown: Object.entries(categoryMap).map(([category, count]) => ({
      category,
      count,
    })),
    statusBreakdown: Object.entries(statusMap).map(([status, count]) => ({
      status,
      count,
    })),
    departmentBreakdown: Object.entries(departmentMap).map(([department, count]) => ({
      department,
      count,
    })),
    trend: Object.entries(trendMap).map(([date, count]) => ({ date, count })),
    needsAttention: [
      ...overdue,
      ...all.filter((c) => c.priority === 'Critical' && c.status !== 'Resolved' && c.status !== 'Closed'),
    ]
      .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
      .slice(0, 10),
  };
}

// ──────────────────────────────────────────────────────────
// Users
// ──────────────────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  await delay(200);
  return MOCK_USERS;
}

export async function getUsersByDepartment(dept: Department): Promise<User[]> {
  await delay(200);
  return MOCK_USERS.filter(
    (u) => u.department === dept && u.role !== 'Super Admin',
  );
}
