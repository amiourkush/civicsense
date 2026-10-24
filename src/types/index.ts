// ============================================================
// CivicSense – Core TypeScript Types
// ============================================================

export type ComplaintCategory =
  | 'Waste & Garbage'
  | 'Roads & Potholes'
  | 'Streetlights'
  | 'Water Supply'
  | 'Drainage'
  | 'Parks & Recreation'
  | 'Noise Pollution'
  | 'Other';

export type ComplaintStatus =
  | 'New'
  | 'Acknowledged'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Closed'
  | 'Rejected'
  | 'Duplicate';

export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type Department =
  | 'Sanitation'
  | 'Roads & Infrastructure'
  | 'Electrical / Streetlights'
  | 'Water & Drainage'
  | 'Parks';

export type UserRole = 'Super Admin' | 'Department Officer' | 'Field Agent';

// Valid status transitions (enforced in the UI)
export const STATUS_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  New: ['Acknowledged', 'Rejected', 'Duplicate'],
  Acknowledged: ['Assigned', 'Rejected', 'Duplicate'],
  Assigned: ['In Progress', 'Rejected', 'Duplicate'],
  'In Progress': ['Resolved', 'Rejected'],
  Resolved: ['Closed'],
  Closed: [],
  Rejected: [],
  Duplicate: [],
};

export interface GeoLocation {
  address: string;
  lat: number;
  lng: number;
}

export interface Evidence {
  id: string;
  type: 'image' | 'note' | 'document';
  url?: string;           // data URL for uploaded images
  filename?: string;
  note?: string;
  phase: 'before' | 'after' | 'general';
  uploadedBy: string;
  uploadedAt: string;     // ISO date string
}

export interface TimelineEntry {
  id: string;
  status: ComplaintStatus;
  changedBy: string;
  changedAt: string;      // ISO date string
  note?: string;
}

export interface Complaint {
  id: string;             // e.g. "CS-0001"
  title: string;
  description: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  location: GeoLocation;
  reportedBy: string;     // citizen name/identifier
  reportedAt: string;     // ISO date string
  assignedDepartment?: Department;
  assignedOfficer?: string;
  dueDate: string;        // ISO date string (SLA deadline)
  duplicateOf?: string;   // ID of primary complaint if this is a duplicate
  mergedComplaints?: string[]; // IDs merged into this one (only on primary)
  evidence: Evidence[];
  timeline: TimelineEntry[];
  tags?: string[];        // additional keyword tags for similarity matching
}

// ──────────────────────────────────────────────
// User / Auth types
// ──────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: Department;  // scoped for Department Officer / Field Agent
  avatarInitials: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

// ──────────────────────────────────────────────
// Dashboard / Analytics types
// ──────────────────────────────────────────────

export interface KPIData {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  overdue: number;
  resolvedThisWeek: number;
  resolvedThisWeekPct: number;
  avgResolutionDays: number;
}

export interface CategoryCount {
  category: ComplaintCategory;
  count: number;
}

export interface StatusCount {
  status: ComplaintStatus;
  count: number;
}

export interface DepartmentCount {
  department: Department;
  count: number;
}

export interface TrendPoint {
  date: string;   // "YYYY-MM-DD"
  count: number;
}

// ──────────────────────────────────────────────
// Duplicate detection types
// ──────────────────────────────────────────────

export interface DuplicateMatch {
  complaintId: string;
  score: number;      // 0–1 similarity score
  reasons: string[];  // e.g. ["Same category", "Location <50m", "Text similarity 78%"]
}
