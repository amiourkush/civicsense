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

### 3. Configure Google Maps (Optional for Live Tiles)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and add your Google Maps API key:
```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

#### 🛡️ Google Cloud API Key Configuration & Restrictions:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services** > **Library** and enable the **Maps JavaScript API**.
3. Under **Credentials**, create an API Key.
4. **Best Practice Restrictions (Recommended)**:
   - **Application Restrictions**: Set to **Websites (HTTP referrers)**. For local development, add `http://localhost:*` and `http://127.0.0.1:*`. For production, add your authorized production domain (e.g. `https://your-domain.gov/*`).
   - **API Restrictions**: Under "Restrict key", select **Maps JavaScript API** exclusively. This prevents unauthorized use of other Google Cloud services if the frontend key is intercepted.
5. *Note: If no API key is configured, CivicSense will gracefully render an informative fallback banner and an interactive geographic cluster inspector without crashing or failing the build.*

### 4. Build for Production
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

## 🔌 Spring Boot Backend Integration

The frontend connects directly to the **CivicSense Spring Boot REST API** documented in `API_ENDPOINTS.md`.

### Environment Configuration (`.env`)

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Default Value | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080` | Base URL of the Spring Boot REST backend |
| `VITE_USE_MOCK_API` | `false` | Set to `false` for live backend; `true` for offline mock dataset |
| `VITE_GOOGLE_MAPS_API_KEY` | *(optional)* | Google Maps JavaScript API key for live satellite/street map tiles |

### 🚀 Dual-Mode Operation

- **Live Backend Mode (`VITE_USE_MOCK_API=false`, Default)**:
  - Connects to Spring Boot backend endpoints.
  - Authenticates via `POST /api/auth/login` and receives Bearer JWT.
  - Queries paginated complaints via `GET /api/complaints`.
  - Normalizes numeric backend IDs, geographic coordinates, and parent/duplicate relationships.
  - Direct S3 Presigned Upload: Resolution requires uploading verification proof via `POST /api/uploads/presigned-url` and binary stream PUT before marking tickets as `RESOLVED`.
  - Disables unsupported client operations (manual department reassignment & manual duplicate merging) with clear explanations, respecting the backend's automated intake engine.
  - Displays inline retry banners when backend is offline or network fails (does not silently swap to fake data).

- **Mock Simulator Mode (`VITE_USE_MOCK_API=true`)**:
  - Uses the bundled dataset (`src/data/complaints.ts` and `src/data/users.ts`) for offline presentations and development when no Spring Boot instance is running.

### 🔑 Authentication Credentials

- **Live Spring Boot Backend**:
  - Administrator: `admin@example.com` / `password`
  - Field Worker: `worker@example.com` / `password`
- **Mock Simulator Mode**:
  - Super Admin: `priya.sharma@civicsense.gov` / `admin123`
  - Dept Officer (Sanitation): `rahul.mehta@civicsense.gov` / `officer123`
  - Field Agent: `suresh.kumar@civicsense.gov` / `agent123`

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
