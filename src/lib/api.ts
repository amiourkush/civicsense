// ============================================================
// CivicSense – Centralized API Adapter Layer
// ============================================================
// Supports dual-mode operation:
// 1. LIVE BACKEND (VITE_USE_MOCK_API=false, default):
//    Connects directly to the Spring Boot REST API at VITE_API_BASE_URL.
//    Includes JWT bearer authorization, Spring Data page normalization,
//    direct S3 presigned upload pipeline, and real backend state machine.
// 2. MOCK SIMULATOR (VITE_USE_MOCK_API=true):
//    Uses the local seed dataset for offline demos and testing.
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
  UserRole,
  BackendComplaintDto,
  BackendLoginResponse,
  PresignedUrlRequest,
  PresignedUrlResponse,
  BackendPage,
} from '../types';
import { isAfter, parseISO } from 'date-fns';

// ──────────────────────────────────────────────────────────
// Configuration & Mode
// ──────────────────────────────────────────────────────────

const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');
export const isMockMode = import.meta.env.VITE_USE_MOCK_API === 'true';

// In-memory mock database state
let mockComplaints: Complaint[] = JSON.parse(JSON.stringify(SEED_COMPLAINTS));

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// ──────────────────────────────────────────────────────────
// Session & Auth Helpers
// ──────────────────────────────────────────────────────────

export function getAuthToken(): string | null {
  return sessionStorage.getItem('civicsense_jwt') || null;
}

export function getStoredUser(): User | null {
  try {
    const raw = sessionStorage.getItem('civicsense_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Robust fetch wrapper for Spring Boot backend endpoints.
 * Automatically attaches Authorization Bearer JWT.
 * Throws clean, actionable errors without falling back to mock data.
 */
async function backendFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = `${API_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err: any) {
    throw new Error(
      `Unable to connect to CivicSense backend at ${API_BASE_URL}. Ensure the Spring Boot server is running on port 8080. (${err.message || 'Connection refused'})`
    );
  }

  if (!res.ok) {
    let errorDetail = `Server returned HTTP ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.message) errorDetail = data.message;
      else if (typeof data === 'string') errorDetail = data;
    } catch {
      // Body not JSON
    }

    if (res.status === 401) {
      sessionStorage.removeItem('civicsense_jwt');
      sessionStorage.removeItem('civicsense_user');
      throw new Error(`Authentication expired or invalid credentials (${res.status}). Please sign in.`);
    }

    throw new Error(errorDetail);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json();
}

// ──────────────────────────────────────────────────────────
// Category & Status Mappings (Backend <-> Frontend)
// ──────────────────────────────────────────────────────────

export function mapBackendCategoryToFrontend(backendCat?: string | null): ComplaintCategory {
  const cat = (backendCat || '').toUpperCase();
  switch (cat) {
    case 'WASTE':
      return 'Waste & Garbage';
    case 'ROADS':
      return 'Roads & Potholes';
    case 'STREETLIGHTS':
      return 'Streetlights';
    case 'OTHER':
    default:
      return 'Other';
  }
}

export function mapFrontendCategoryToBackend(frontendCat?: string | null): string | undefined {
  if (!frontendCat) return undefined;
  switch (frontendCat) {
    case 'Waste & Garbage':
      return 'WASTE';
    case 'Roads & Potholes':
      return 'ROADS';
    case 'Streetlights':
      return 'STREETLIGHTS';
    case 'Other':
      return 'OTHER';
    default:
      // Backend only supports WASTE, ROADS, STREETLIGHTS, OTHER.
      // Do not send unsupported values.
      return undefined;
  }
}

export function mapBackendStatusToFrontend(backendStatus?: string | null): ComplaintStatus {
  const st = (backendStatus || '').toUpperCase();
  switch (st) {
    case 'REPORTED':
      return 'New';
    case 'ASSIGNED':
      return 'Assigned';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'RESOLVED':
      return 'Resolved';
    case 'CLOSED':
      return 'Closed';
    default:
      return 'New';
  }
}

export function mapFrontendStatusToBackend(frontendStatus?: string | null): string | undefined {
  if (!frontendStatus) return undefined;
  const s = frontendStatus.toLowerCase();
  if (s === 'new' || s === 'reported' || s === 'open') return 'REPORTED';
  if (s === 'assigned') return 'ASSIGNED';
  if (s === 'in progress' || s === 'in-progress') return 'IN_PROGRESS';
  if (s === 'resolved') return 'RESOLVED';
  if (s === 'closed') return 'CLOSED';
  // Unsupported statuses like 'Acknowledged', 'Rejected', 'Duplicate'
  return undefined;
}

// ──────────────────────────────────────────────────────────
// Centralized Data Normalization
// ──────────────────────────────────────────────────────────

/**
 * Normalizes a raw Spring Boot BackendComplaintDto into the frontend's Complaint model.
 * Preserves actual numeric backend IDs, handles coordinates safely, creates before/after evidence items,
 * and maintains parent-child duplicate relationships.
 */
export function normalizeBackendComplaint(dto: BackendComplaintDto): Complaint {
  const category = mapBackendCategoryToFrontend(dto.category);
  const status = mapBackendStatusToFrontend(dto.status);

  // Geographic coordinates mapping
  const hasLat = typeof dto.latitude === 'number' && !isNaN(dto.latitude);
  const hasLng = typeof dto.longitude === 'number' && !isNaN(dto.longitude);

  let address = (dto as any).address;
  if (!address || typeof address !== 'string') {
    if (hasLat && hasLng) {
      address = `Coordinates (${dto.latitude!.toFixed(4)}, ${dto.longitude!.toFixed(4)})`;
    } else {
      address = 'Location not specified';
    }
  }

  // Parent & duplicate relationships
  const duplicateOf =
    dto.parentComplaintId != null && dto.parentComplaintId !== ''
      ? String(dto.parentComplaintId)
      : undefined;

  const mergedComplaints: string[] = Array.isArray(dto.duplicates)
    ? dto.duplicates.map((d) => (typeof d === 'object' && d !== null ? String(d.id) : String(d)))
    : [];

  // Build evidence records from before/after images
  const evidence: Evidence[] = [];
  if (dto.beforeImageUrl) {
    evidence.push({
      id: `ev-before-${dto.id}`,
      type: 'image',
      url: dto.beforeImageUrl,
      phase: 'before',
      uploadedBy: dto.reporterName || 'Citizen Reporter',
      uploadedAt: dto.createdAt || new Date().toISOString(),
      filename: 'intake_report.jpg',
    });
  }
  if (dto.afterImageUrl) {
    evidence.push({
      id: `ev-after-${dto.id}`,
      type: 'image',
      url: dto.afterImageUrl,
      phase: 'after',
      uploadedBy: 'Field Operations Crew',
      uploadedAt: dto.updatedAt || new Date().toISOString(),
      filename: 'resolution_evidence.jpg',
    });
  }

  // Synthetic timeline based on server timestamps
  const timeline: TimelineEntry[] = [
    {
      id: `tl-intake-${dto.id}`,
      status: 'New',
      changedBy: dto.reporterName || 'Citizen',
      changedAt: dto.createdAt || new Date().toISOString(),
      note: 'Civic complaint submitted and registered in system',
    },
  ];

  if (dto.status && dto.status !== 'REPORTED') {
    timeline.push({
      id: `tl-status-${dto.id}`,
      status,
      changedBy: dto.departmentName || 'Municipal Administration',
      changedAt: dto.updatedAt || new Date().toISOString(),
      note: `Status updated to ${status}${dto.departmentName ? ` (${dto.departmentName})` : ''}`,
    });
  }

  const reportedBy = dto.reporterName
    ? `${dto.reporterName}${dto.reporterEmail ? ` (${dto.reporterEmail})` : ''}`
    : 'Citizen';

  // Backend does not provide an authoritative SLA deadline.
  // We provide a fallback date for display purposes without claiming an authoritative overdue status.
  const createdAtTime = dto.createdAt ? new Date(dto.createdAt).getTime() : Date.now();
  const fallbackDueDate = new Date(createdAtTime + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: String(dto.id),
    title: dto.title || 'Civic Issue',
    description: dto.description || '',
    category,
    status,
    priority: (dto as any).priority || 'Medium',
    location: {
      address,
      lat: hasLat ? dto.latitude : null,
      lng: hasLng ? dto.longitude : null,
    },
    reportedBy,
    reportedAt: dto.createdAt || new Date().toISOString(),
    assignedDepartment: (dto.departmentName as Department) || undefined,
    assignedOfficer: (dto as any).assignedOfficer || undefined,
    dueDate: (dto as any).dueDate || fallbackDueDate,
    duplicateOf,
    mergedComplaints,
    evidence,
    timeline,
    rawBackendDto: dto,
    isBackendRecord: true,
  };
}

// ──────────────────────────────────────────────────────────
// Auth Endpoints
// ──────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<User> {
  if (isMockMode) {
    await delay(400);
    const expectedPwd = MOCK_CREDENTIALS[email];
    if (!expectedPwd || expectedPwd !== password) {
      throw new Error('Invalid credentials');
    }
    const user = MOCK_USERS.find((u) => u.email === email);
    if (!user) throw new Error('User not found');
    return user;
  }

  // Live Spring Boot login: POST /api/auth/login
  const res = await backendFetch<BackendLoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  const role: UserRole = res.role === 'ADMIN' ? 'Super Admin' : 'Field Agent';
  const nameParts = res.email.split('@')[0].split(/[._-]/);
  const formattedName = nameParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const initials = formattedName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const user: User = {
    id: res.email,
    name: formattedName || res.email,
    email: res.email,
    role,
    avatarInitials: initials || 'AD',
    token: res.token,
    backendRole: res.role,
  };

  return user;
}

export async function logout(): Promise<void> {
  if (isMockMode) {
    await delay(150);
  }
}

// ──────────────────────────────────────────────────────────
// Complaints – Read Endpoints
// ──────────────────────────────────────────────────────────

export interface ComplaintFilters {
  search?: string;
  category?: ComplaintCategory;
  status?: ComplaintStatus;
  statuses?: ComplaintStatus[];
  department?: Department | 'Unassigned';
  priority?: ComplaintPriority;
  dateFrom?: string;
  dateTo?: string;
  overdueOnly?: boolean;
  resolvedThisWeekOnly?: boolean;
  scopedDepartment?: Department;
  page?: number;
  size?: number;
  sort?: string;
}

export async function getComplaints(filters: ComplaintFilters = {}): Promise<Complaint[]> {
  if (isMockMode) {
    await delay(300);
    let result = [...mockComplaints];

    if (filters.scopedDepartment) {
      result = result.filter((c) => c.assignedDepartment === filters.scopedDepartment);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.location?.address && c.location.address.toLowerCase().includes(q))
      );
    }
    if (filters.category) result = result.filter((c) => c.category === filters.category);
    if (filters.status) result = result.filter((c) => c.status === filters.status);
    if (filters.statuses && filters.statuses.length > 0) {
      result = result.filter((c) => filters.statuses!.includes(c.status));
    }
    if (filters.department) {
      if (filters.department === 'Unassigned') {
        result = result.filter((c) => !c.assignedDepartment);
      } else {
        result = result.filter((c) => c.assignedDepartment === filters.department);
      }
    }
    if (filters.priority) result = result.filter((c) => c.priority === filters.priority);

    if (filters.overdueOnly) {
      const now = new Date();
      result = result.filter(
        (c) =>
          c.status !== 'Resolved' &&
          c.status !== 'Closed' &&
          c.status !== 'Rejected' &&
          c.status !== 'Duplicate' &&
          isAfter(now, parseISO(c.dueDate))
      );
    }

    return result;
  }

  // Live Spring Boot query: GET /api/complaints
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  else params.set('page', '0');

  if (filters.size !== undefined) params.set('size', String(filters.size));
  else params.set('size', '200'); // Fetch ample parent complaints for admin triage

  if (filters.sort) params.set('sort', filters.sort);
  else params.set('sort', 'createdAt,desc');

  const backendCategory = mapFrontendCategoryToBackend(filters.category);
  if (backendCategory) params.set('category', backendCategory);

  const backendStatus = mapFrontendStatusToBackend(filters.status);
  if (backendStatus) params.set('status', backendStatus);

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const rawResponse = await backendFetch<BackendPage<BackendComplaintDto> | BackendComplaintDto[]>(
    `/api/complaints${queryString}`
  );

  // Normalize Spring Data Page vs raw array
  let dtoList: BackendComplaintDto[] = [];
  if (Array.isArray(rawResponse)) {
    dtoList = rawResponse;
  } else if (rawResponse && Array.isArray(rawResponse.content)) {
    dtoList = rawResponse.content;
  }

  let complaints = dtoList.map(normalizeBackendComplaint);

  // Client-side text search & department filter if needed
  if (filters.search) {
    const q = filters.search.toLowerCase();
    complaints = complaints.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.location?.address && c.location.address.toLowerCase().includes(q))
    );
  }

  if (filters.department) {
    if (filters.department === 'Unassigned') {
      complaints = complaints.filter((c) => !c.assignedDepartment);
    } else {
      complaints = complaints.filter((c) => c.assignedDepartment === filters.department);
    }
  }

  if (filters.priority) {
    complaints = complaints.filter((c) => c.priority === filters.priority);
  }

  return complaints;
}

export async function getComplaintById(id: string): Promise<Complaint | null> {
  if (isMockMode) {
    await delay(200);
    return mockComplaints.find((c) => c.id === id) ?? null;
  }

  // Live Spring Boot: GET /api/complaints/{id}
  const dto = await backendFetch<BackendComplaintDto>(`/api/complaints/${encodeURIComponent(id)}`);
  if (!dto) return null;
  return normalizeBackendComplaint(dto);
}

// ──────────────────────────────────────────────────────────
// S3 Direct Presigned Upload Pipeline
// ──────────────────────────────────────────────────────────

/**
 * Step 1: Request presigned S3 upload URL from Spring Boot.
 * POST /api/uploads/presigned-url
 */
export async function getPresignedUrl(
  folder: 'before' | 'after',
  contentType: string,
  filename: string
): Promise<PresignedUrlResponse> {
  if (isMockMode) {
    await delay(300);
    return {
      uploadUrl: 'mock://civicsense-images.s3.ap-south-1.amazonaws.com/mock-upload',
      fileUrl: `https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80`,
      objectKey: `${folder}/${filename}`,
      expiresInSeconds: 900,
    };
  }

  return backendFetch<PresignedUrlResponse>('/api/uploads/presigned-url', {
    method: 'POST',
    body: JSON.stringify({ folder, contentType, filename }),
  });
}

/**
 * Step 2: Upload raw file stream directly to AWS S3 via HTTP PUT.
 * IMPORTANT: No backend JWT is attached to the presigned S3 request.
 */
export async function uploadFileToS3(uploadUrl: string, file: File): Promise<void> {
  if (isMockMode) {
    await delay(400);
    return;
  }

  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });
  } catch (err: any) {
    throw new Error(`Failed to upload image directly to storage service: ${err.message || 'Network error'}`);
  }

  if (!res.ok) {
    throw new Error(`Storage upload failed with HTTP ${res.status}: ${res.statusText}`);
  }
}

// ──────────────────────────────────────────────────────────
// Complaints – Write Endpoints (Status & Evidence)
// ──────────────────────────────────────────────────────────

/**
 * Updates complaint status.
 * Enforces backend state transitions:
 * REPORTED -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED
 * Transition to RESOLVED strictly requires an afterImageUrl.
 */
export async function updateComplaintStatus(
  id: string,
  newStatus: ComplaintStatus,
  changedBy: string,
  note?: string,
  afterImageUrl?: string
): Promise<Complaint> {
  if (isMockMode) {
    await delay(350);
    const idx = mockComplaints.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Complaint ${id} not found`);

    const entry: TimelineEntry = {
      id: `tl-${Date.now()}`,
      status: newStatus,
      changedBy,
      changedAt: new Date().toISOString(),
      note,
    };

    const updatedEvidence = [...mockComplaints[idx].evidence];
    if (afterImageUrl) {
      updatedEvidence.push({
        id: `ev-after-${Date.now()}`,
        type: 'image',
        url: afterImageUrl,
        phase: 'after',
        uploadedBy: changedBy,
        uploadedAt: new Date().toISOString(),
        filename: 'resolution_evidence.jpg',
      });
    }

    mockComplaints[idx] = {
      ...mockComplaints[idx],
      status: newStatus,
      evidence: updatedEvidence,
      timeline: [...mockComplaints[idx].timeline, entry],
    };

    return mockComplaints[idx];
  }

  // Live Spring Boot: PUT /api/complaints/{id}/status
  const backendStatus = mapFrontendStatusToBackend(newStatus);
  if (!backendStatus) {
    throw new Error(
      `Status "${newStatus}" is not supported by the backend workflow (Supported: REPORTED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED).`
    );
  }

  if (backendStatus === 'RESOLVED' && !afterImageUrl) {
    throw new Error(
      'The backend strictly requires an after-resolution image before marking a complaint as RESOLVED.'
    );
  }

  const payload: { status: string; afterImageUrl?: string } = {
    status: backendStatus,
  };
  if (afterImageUrl) {
    payload.afterImageUrl = afterImageUrl;
  }

  const updatedDto = await backendFetch<BackendComplaintDto>(
    `/api/complaints/${encodeURIComponent(id)}/status`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );

  return normalizeBackendComplaint(updatedDto);
}

/**
 * Department assignment handler.
 * In live mode: the documented backend has NO manual reassignment endpoint.
 * (Departments are automatically determined upon intake).
 * In mock mode: simulates local assignment.
 */
export async function assignComplaint(
  id: string,
  department: Department,
  officer: string,
  changedBy: string
): Promise<Complaint> {
  if (isMockMode) {
    await delay(400);
    const idx = mockComplaints.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Complaint ${id} not found`);

    const prevStatus = mockComplaints[idx].status;
    const newStatus: ComplaintStatus =
      prevStatus === 'New' || prevStatus === 'Acknowledged' ? 'Assigned' : prevStatus;

    const entry: TimelineEntry = {
      id: `tl-${Date.now()}`,
      status: newStatus,
      changedBy,
      changedAt: new Date().toISOString(),
      note: `Assigned to ${department} – ${officer}`,
    };

    mockComplaints[idx] = {
      ...mockComplaints[idx],
      assignedDepartment: department,
      assignedOfficer: officer,
      status: newStatus,
      timeline: [...mockComplaints[idx].timeline, entry],
    };

    return mockComplaints[idx];
  }

  // Live Mode: Backend does NOT provide a manual reassignment endpoint
  throw new Error(
    'Manual department reassignment is not supported by the current backend API contract. Departments are automatically routed by the backend Haversine engine on report intake.'
  );
}

/**
 * Duplicate merge handler.
 * In live mode: the documented backend does NOT provide a manual merge endpoint.
 * (Backend automatically identifies child duplicates within 50m upon intake).
 * In mock mode: simulates local merging.
 */
export async function mergeComplaint(
  duplicateId: string,
  primaryId: string,
  changedBy: string
): Promise<void> {
  if (isMockMode) {
    await delay(400);
    const dupIdx = mockComplaints.findIndex((c) => c.id === duplicateId);
    const primIdx = mockComplaints.findIndex((c) => c.id === primaryId);
    if (dupIdx === -1 || primIdx === -1) throw new Error('Complaint not found');

    const entry: TimelineEntry = {
      id: `tl-${Date.now()}`,
      status: 'Duplicate',
      changedBy,
      changedAt: new Date().toISOString(),
      note: `Merged into ${primaryId} as duplicate.`,
    };

    mockComplaints[dupIdx] = {
      ...mockComplaints[dupIdx],
      status: 'Duplicate',
      duplicateOf: primaryId,
      timeline: [...mockComplaints[dupIdx].timeline, entry],
    };

    mockComplaints[primIdx] = {
      ...mockComplaints[primIdx],
      mergedComplaints: [...(mockComplaints[primIdx].mergedComplaints ?? []), duplicateId],
    };
    return;
  }

  // Live Mode: Backend does NOT provide a manual merge endpoint
  throw new Error(
    'Manual duplicate merging is not supported by the backend API. Intake deduplication is executed automatically by the backend within a 50-meter threshold.'
  );
}

export async function addEvidence(
  id: string,
  evidence: Omit<Evidence, 'id' | 'uploadedAt'>
): Promise<Complaint> {
  if (isMockMode) {
    await delay(350);
    const idx = mockComplaints.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Complaint ${id} not found`);

    const newEv: Evidence = {
      ...evidence,
      id: `ev-${Date.now()}`,
      uploadedAt: new Date().toISOString(),
    };

    mockComplaints[idx] = {
      ...mockComplaints[idx],
      evidence: [...mockComplaints[idx].evidence, newEv],
    };

    return mockComplaints[idx];
  }

  // In live mode, images are uploaded directly via presigned S3 URL and linked on status transition
  throw new Error(
    'In live mode, resolution evidence must be uploaded via the presigned S3 pipeline when updating status to RESOLVED.'
  );
}

export async function bulkUpdateStatus(
  ids: string[],
  status: ComplaintStatus,
  changedBy: string
): Promise<void> {
  for (const id of ids) {
    await updateComplaintStatus(id, status, changedBy);
  }
}

export async function bulkAssign(
  ids: string[],
  department: Department,
  officer: string,
  changedBy: string
): Promise<void> {
  for (const id of ids) {
    await assignComplaint(id, department, officer, changedBy);
  }
}

// ──────────────────────────────────────────────────────────
// Dynamic Dashboard Analytics
// ──────────────────────────────────────────────────────────

/**
 * Calculates authoritative metrics for the admin dashboard.
 * In live mode: fetches current complaints and distinguishes parent issues
 * from total citizen reports by counting linked duplicates.
 */
export async function getAnalytics() {
  const allComplaints = await getComplaints({ size: 300 });
  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);

  // Distinguish parent complaints from total citizen reports (including duplicates)
  const totalParentIssues = allComplaints.length;
  const totalCitizenReports = allComplaints.reduce(
    (sum, c) => sum + 1 + (c.mergedComplaints ? c.mergedComplaints.length : 0),
    0
  );

  const openComplaints = allComplaints.filter(
    (c) => c.status === 'New' || c.status === 'Acknowledged'
  );
  const inProgressComplaints = allComplaints.filter(
    (c) => c.status === 'In Progress' || c.status === 'Assigned'
  );
  const resolvedComplaints = allComplaints.filter(
    (c) => c.status === 'Resolved' || c.status === 'Closed'
  );

  // Overdue calculation
  // In live mode, backend doesn't supply SLA due dates. If unavailable or mock, calculate safely.
  const overdueComplaints = isMockMode
    ? allComplaints.filter(
        (c) =>
          c.status !== 'Resolved' &&
          c.status !== 'Closed' &&
          c.status !== 'Rejected' &&
          c.status !== 'Duplicate' &&
          isAfter(now, parseISO(c.dueDate))
      )
    : [];

  const resolvedThisWeek = resolvedComplaints.filter((c) => {
    const lastEntry = c.timeline[c.timeline.length - 1];
    return lastEntry && isAfter(parseISO(lastEntry.changedAt), oneWeekAgo);
  });

  // Average resolution days
  const avgResolutionMs =
    resolvedComplaints.length > 0
      ? resolvedComplaints.reduce((sum, c) => {
          const start = parseISO(c.reportedAt).getTime();
          const lastEntry = c.timeline[c.timeline.length - 1];
          const end = lastEntry ? parseISO(lastEntry.changedAt).getTime() : now.getTime();
          return sum + (end - start);
        }, 0) / resolvedComplaints.length
      : 0;
  const avgResolutionDays = avgResolutionMs / (1000 * 60 * 60 * 24);

  // Category breakdown
  const categoryMap: Record<string, number> = {};
  for (const c of allComplaints) {
    categoryMap[c.category] = (categoryMap[c.category] ?? 0) + 1;
  }

  // Status breakdown
  const statusMap: Record<string, number> = {};
  for (const c of allComplaints) {
    statusMap[c.status] = (statusMap[c.status] ?? 0) + 1;
  }

  // Department breakdown
  const departmentMap: Record<string, number> = {
    Sanitation: 0,
    'Roads & Infrastructure': 0,
    'Electrical / Streetlights': 0,
    'Water & Drainage': 0,
    Parks: 0,
    Unassigned: 0,
  };
  for (const c of allComplaints) {
    const dept = c.assignedDepartment || 'Unassigned';
    departmentMap[dept] = (departmentMap[dept] ?? 0) + 1;
  }

  // 30-day intake trend
  const trendMap: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    trendMap[key] = 0;
  }
  for (const c of allComplaints) {
    const key = c.reportedAt.slice(0, 10);
    if (key in trendMap) trendMap[key]++;
  }

  return {
    kpi: {
      total: totalCitizenReports,
      parentIssues: totalParentIssues,
      open: openComplaints.length,
      inProgress: inProgressComplaints.length,
      resolved: resolvedComplaints.length,
      overdue: overdueComplaints.length,
      resolvedThisWeek: resolvedThisWeek.length,
      resolvedThisWeekPct:
        totalCitizenReports > 0
          ? Math.round((resolvedThisWeek.length / totalCitizenReports) * 100)
          : 0,
      avgResolutionDays: Math.round(avgResolutionDays * 10) / 10,
    },
    categoryBreakdown: Object.entries(categoryMap).map(([category, count]) => ({
      category: category as ComplaintCategory,
      count,
    })),
    statusBreakdown: Object.entries(statusMap).map(([status, count]) => ({
      status: status as ComplaintStatus,
      count,
    })),
    departmentBreakdown: Object.entries(departmentMap).map(([department, count]) => ({
      department: department as Department,
      count,
    })),
    trend: Object.entries(trendMap).map(([date, count]) => ({ date, count })),
    needsAttention: [
      ...overdueComplaints,
      ...allComplaints.filter(
        (c) => c.priority === 'Critical' && c.status !== 'Resolved' && c.status !== 'Closed'
      ),
      ...openComplaints.slice(0, 5),
    ]
      .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
      .slice(0, 8),
  };
}

// ──────────────────────────────────────────────────────────
// Users Endpoints
// ──────────────────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  if (isMockMode) {
    await delay(150);
    return MOCK_USERS;
  }
  const current = getStoredUser();
  return current ? [current] : [];
}

export async function getUsersByDepartment(dept: Department): Promise<User[]> {
  if (isMockMode) {
    await delay(150);
    return MOCK_USERS.filter((u) => u.department === dept && u.role !== 'Super Admin');
  }
  return [];
}
