# CivicSense – Civic Complaint Tracking & Admin Portal

**CivicSense** is an enterprise-grade administrative portal for municipal civic complaint management and triage. While citizens report civic issues (sanitation, potholes, broken streetlights, water supply, sewage/drainage, parks) via citizen channels, administrators and department officers use **CivicSense** to triage, deduplicate, route, track, and resolve citizen complaints with cryptographic and photographic audit proof.

---

## 🏛️ Key Features

1. **Role-Based Authentication & Scoping**
   - Simulated roles: **Super Admin**, **Department Officer**, and **Field Agent**.
   - Demo 1-click credentials on the login screen.
   - Department officers automatically scope their triage queues to their department (e.g. Sanitation, Roads, Water & Drainage).

2. **Executive KPI Dashboard & Real-Time Metrics**
   - Live KPI cards: Total Complaints, Open Issues, In Progress, Resolved, Overdue (SLA breached), % Resolved This Week, Avg Resolution Time (in days).
   - Recharts visual analytics: 30-day reporting volume trend area chart, Status donut distribution, Category breakdown, and Department workload bars.
   - **"Needs Attention"** urgent priority queue highlighting critical severity & SLA-breached cases.

3. **Complaints Queue & Triage Management**
   - Filterable data table with full-text search across IDs, descriptions, and street addresses.
   - Multiselect checkboxes for **Bulk Actions**: Bulk status updates and Bulk department/officer assignments.
   - Multi-field filtering (Category, Status, Department, Priority) and sorting (Newest, Oldest, Priority, Earliest SLA due).

4. **Rule-Based NLP Auto-Classification**
   - Automatically analyses complaint titles and descriptions using category keyword lexicons (`src/lib/classifier.ts`).
   - Calculates a confidence score and auto-suggests the target civic department (`autoRouteDepartment`).
   - Administrators can review the reasoning or override the category in 1 click.

5. **Hybrid Deduplication & Duplicate Detection Engine**
   - Prevents citizen duplicate complaints from clogging municipal operations (`src/lib/similarity.ts`).
   - Combines **Jaccard token similarity** (title + description), **Haversine geographic proximity** (distance in meters), and category matching.
   - Provides an interactive **Duplicate Candidates Panel** with match percentages and breakdown reasons.
   - **Merge into Primary**: Allows merging duplicate tickets into a canonical primary record with bidirectional audit logging.

6. **Interactive Complaint Detail & Audit Log**
   - Enforced status lifecycle: `New` → `Acknowledged` → `Assigned` → `In Progress` → `Resolved` → `Closed` (+ `Rejected` / `Duplicate`).
   - Timeline audit log tracking who changed what status, timestamp, and inspection notes.
   - **Evidence & Resolution Verification**: Supports attaching before/after repair photos and inspector verification proof before marking issues as resolved.
   - Geographic GIS pin with coordinates and street address.

7. **Regulatory Reports & CSV Export**
   - Filtered dataset table ready for council review and regulatory export.
   - **Export CSV** button downloading all active complaints with geo-coordinates, SLA dates, status, and evidence counts.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

### 3. Build for Production
```bash
npm run build
npm run preview
```

---

## 🔑 Demo Credentials

| Role | Name | Email | Password | Department |
|---|---|---|---|---|
| **Super Admin** | Priya Sharma | `priya.sharma@civicsense.gov` | `admin123` | All Departments |
| **Department Officer** | Rahul Mehta | `rahul.mehta@civicsense.gov` | `officer123` | Sanitation |
| **Department Officer** | Anjali Nair | `anjali.nair@civicsense.gov` | `officer123` | Roads & Infrastructure |
| **Field Agent** | Suresh Kumar | `suresh.kumar@civicsense.gov` | `agent123` | Sanitation |

*(You can also click any of the "Quick Login" sample buttons directly on the login screen to auto-fill credentials).*

---

## 🔌 How to Swap in a Real REST Backend

All API operations are isolated in `src/lib/api.ts`. Currently, they simulate asynchronous REST endpoints with realistic delays and in-memory persistence seeded with 40 realistic civic complaints.

To connect a live backend (e.g. Express, Fastify, Django, Spring Boot, or Supabase), simply update `src/lib/api.ts`:

### Example: Replacing `getComplaints()`
```typescript
// Replace in src/lib/api.ts:
export async function getComplaints(filters: ComplaintFilters = {}): Promise<Complaint[]> {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);
  if (filters.department) params.set('department', filters.department);
  if (filters.search) params.set('q', filters.search);

  const response = await fetch(`/api/v1/complaints?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch complaints');
  return response.json();
}
```

### Example: Replacing `updateComplaintStatus()`
```typescript
export async function updateComplaintStatus(
  id: string,
  newStatus: ComplaintStatus,
  changedBy: string,
  note?: string
): Promise<Complaint> {
  const response = await fetch(`/api/v1/complaints/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus, changedBy, note }),
  });
  if (!response.ok) throw new Error('Failed to update status');
  return response.json();
}
```

---

## 📂 Project Structure

```
src/
├── components/
│   ├── layout/
│   │   └── AppLayout.tsx          # Collapsible responsive sidebar layout & header
│   └── ui/
│       ├── Badge.tsx              # Status, priority, and category badges
│       └── index.tsx              # Button, Card, Input, Textarea, Select, Spinner
├── contexts/
│   └── AuthContext.tsx            # Session state and authentication provider
├── data/
│   ├── complaints.ts              # 40 seeded realistic civic complaints
│   └── users.ts                   # 10 mock departmental users & credentials
├── lib/
│   ├── api.ts                     # Mock REST API service layer
│   ├── classifier.ts              # Rule-based NLP classifier & auto-routing
│   ├── similarity.ts              # Jaccard + Haversine duplicate detection engine
│   └── utils.ts                   # Tailwind merge, color maps, and date formatters
├── pages/
│   ├── ComplaintDetailPage.tsx    # Details, workflow transitions, evidence, and duplicates
│   ├── ComplaintsListPage.tsx     # Filterable queue, sorting, and bulk operations
│   ├── DashboardPage.tsx          # Real-time KPIs, charts, and urgent triage queue
│   ├── LoginPage.tsx              # Glassmorphism login with 1-click role demo
│   └── ReportsPage.tsx            # Analytics breakdown and CSV export
├── types/
│   └── index.ts                   # TypeScript interfaces and valid status transitions
├── App.tsx                        # React Query and React Router configuration
├── main.tsx                       # React DOM entry point
└── style.css                      # Tailwind CSS v4 styling & GovBlue theme
```
