# CivicSense API Documentation

The **CivicSense** backend provides a RESTful API for reporting, routing, deduplicating, and tracking civic complaints across simulated municipal departments.

---

## 1. General Information

- **Base URL (Local):** `http://localhost:8080`
- **Default Port:** `8080` (configured via `SERVER_PORT` in `.env`)
- **Authentication:** Bearer JWT in HTTP Header (`Authorization: Bearer <token>`)
- **Supported Enums:**
  - **Roles:** `CITIZEN`, `WORKER`, `ADMIN`
  - **Categories:** `WASTE`, `ROADS`, `STREETLIGHTS`, `OTHER`
  - **Statuses:** `REPORTED`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`

---

## 2. Endpoints Summary Table

| Method | Endpoint | Access / Role | Content Type | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | `application/json` | Register a new user |
| `POST` | `/api/auth/login` | Public | `application/json` | Authenticate and obtain JWT |
| `POST` | `/api/uploads/presigned-url` | Authenticated | `application/json` | **Request S3 upload permission & presigned PUT URL** |
| `POST` | `/api/complaints` | `CITIZEN`, `ADMIN` | `application/json` or `multipart/form-data` | Report an issue (stores S3 URL, runs deduplication) |
| `GET` | `/api/complaints` | Authenticated | N/A | Paginated, filtered list of complaints |
| `GET` | `/api/complaints/{id}` | Authenticated | N/A | Get complaint details & child duplicates |
| `PUT` | `/api/complaints/{id}/status` | `WORKER`, `ADMIN` | `application/json` or `multipart/form-data` | Update status + store S3 after-image URL |
| `GET` | `/uploads/{folder}/{filename}` | Public | Any | View uploaded image (when local storage is active) |

---

## 3. Direct-to-S3 Presigned Upload Pipeline

Spring Boot offloads heavy image byte streaming directly to AWS S3. The Spring Boot backend only grants permission via a time-limited presigned URL, and then saves the final S3 URL in the database.

### Workflow Sequence
```
[Client / Mobile / Web]               [Spring Boot Backend]                  [AWS S3]
         |                                     |                                 |
  1. POST /api/uploads/presigned-url --------->|                                 |
     {"folder":"before",                       |                                 |
      "contentType":"image/jpeg"}              |--- Generates signed PUT URL --->|
         |                                     |    (valid for 15 minutes)       |
         |<--- Returns {uploadUrl, fileUrl} ---|                                 |
         |                                                                       |
  2. PUT [uploadUrl] (Raw image binary stream) --------------------------------->|
         |<----------------------- HTTP 200 OK ----------------------------------|
         |
  3. POST /api/complaints (Clean JSON payload with fileUrl)
     {"title":"Pothole", "beforeImageUrl":"https://s3.../before/uuid.jpg", ...}
         |------------------------------------>|
         |                                     |--- Stores S3 URL in PostgreSQL
         |<--------- HTTP 201 Created ---------|
```

---

## 4. Upload Permission Endpoints

### 4.1 Request Presigned S3 Upload URL
Requests permission and a temporary signed URL to upload an image directly to Amazon S3.

- **URL:** `/api/uploads/presigned-url`
- **Method:** `POST`
- **Auth Required:** Yes (`CITIZEN`, `WORKER`, or `ADMIN`)
- **Headers:**
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`

#### Request Body
| Field | Type | Constraints | Description |
|---|---|---|---|
| `folder` | `string` | Required (`before` or `after`) | Namespace folder in S3 |
| `contentType` | `string` | Required (e.g. `image/jpeg`, `image/png`, `image/webp`) | MIME type of the file |
| `filename` | `string` | Optional (e.g. `pothole.jpg`) | Used to preserve original extension |

```json
{
  "folder": "before",
  "contentType": "image/jpeg",
  "filename": "broken_light.jpg"
}
```

#### Response: `200 OK`
```json
{
  "uploadUrl": "https://civicsense-images.s3.ap-south-1.amazonaws.com/before/7eb85b12-4217-4862-a3fc-8c963f66bba9.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=...",
  "fileUrl": "https://civicsense-images.s3.ap-south-1.amazonaws.com/before/7eb85b12-4217-4862-a3fc-8c963f66bba9.jpg",
  "objectKey": "before/7eb85b12-4217-4862-a3fc-8c963f66bba9.jpg",
  "expiresInSeconds": 900
}
```

#### Uploading the File to S3 (cURL Example)
```bash
curl -X PUT "UPLOAD_URL_FROM_ABOVE" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@/path/to/broken_light.jpg"
```

---

## 5. Authentication Endpoints

### 5.1 Register User
Register a new citizen, worker, or administrator account.

- **URL:** `/api/auth/register`
- **Method:** `POST`
- **Auth Required:** No
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "name": "Jane Citizen",
  "email": "jane.citizen@example.com",
  "password": "Password123!",
  "role": "CITIZEN"
}
```

#### Response: `201 Created`
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJqYW5lLmNpdGl6ZW5AZXhhbXBsZS5jb20iLCJyb2xlIjoiQ0lUSVpFTiIsImlhdCI6MTY5ODExMjAwMCwiZXhwIjoxNjk4MTk4NDAwfQ.example_signature",
  "email": "jane.citizen@example.com",
  "role": "CITIZEN"
}
```

---

### 5.2 Login User
Authenticate an existing account and obtain a JWT bearer token.

- **URL:** `/api/auth/login`
- **Method:** `POST`
- **Auth Required:** No
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "email": "jane.citizen@example.com",
  "password": "Password123!"
}
```

#### Response: `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "email": "jane.citizen@example.com",
  "role": "CITIZEN"
}
```

---

## 6. Complaint Management Endpoints

### 6.1 Create Complaint (Report an Issue)
Files a new civic issue report. The system:
1. Runs the **Haversine Deduplication Engine** (searches open complaints in the same category within 50m).
2. If duplicate: links new complaint as a child of the nearest parent (`parentComplaintId` set).
3. If unique: assigns to municipal department (`WASTE` → Sanitation, `ROADS` → Public Works, etc.) and transitions status to `ASSIGNED`.
4. Saves the `beforeImageUrl` directly into PostgreSQL.

- **URL:** `/api/complaints`
- **Method:** `POST`
- **Auth Required:** Yes (`CITIZEN` or `ADMIN`)
- **Headers:**
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json` (Recommended Direct S3 flow) *or* `multipart/form-data`

#### Primary Option: JSON Payload (Direct S3 Presigned URL Flow)
```json
{
  "title": "Pothole on 5th Main",
  "description": "Deep pothole causing vehicle damage",
  "category": "ROADS",
  "latitude": 12.971598,
  "longitude": 77.594562,
  "beforeImageUrl": "https://civicsense-images.s3.ap-south-1.amazonaws.com/before/7eb85b12-4217-4862-a3fc-8c963f66bba9.jpg"
}
```

#### cURL Example (JSON Flow)
```bash
curl -X POST http://localhost:8080/api/complaints \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Pothole on 5th Main",
    "description": "Deep pothole causing vehicle damage",
    "category": "ROADS",
    "latitude": 12.971598,
    "longitude": 77.594562,
    "beforeImageUrl": "https://civicsense-images.s3.ap-south-1.amazonaws.com/before/7eb85b12-4217-4862-a3fc-8c963f66bba9.jpg"
  }'
```

#### Secondary Option: Multipart Form-Data (Fallback)
```bash
curl -X POST http://localhost:8080/api/complaints \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F 'complaint={"title":"Pothole on 5th Main","description":"Deep pothole causing bike skid","category":"ROADS","latitude":12.971598,"longitude":77.594562};type=application/json' \
  -F 'beforeImage=@/path/to/pothole.jpg'
```

#### Response: `201 Created`
```json
{
  "id": 1,
  "title": "Pothole on 5th Main",
  "description": "Deep pothole causing vehicle damage",
  "category": "ROADS",
  "status": "ASSIGNED",
  "latitude": 12.971598,
  "longitude": 77.594562,
  "beforeImageUrl": "https://civicsense-images.s3.ap-south-1.amazonaws.com/before/7eb85b12-4217-4862-a3fc-8c963f66bba9.jpg",
  "afterImageUrl": null,
  "departmentName": "Public Works",
  "reporterName": "Jane Citizen",
  "reporterEmail": "jane.citizen@example.com",
  "parentComplaintId": null,
  "duplicates": [],
  "createdAt": "2026-10-24T14:30:00Z",
  "updatedAt": "2026-10-24T14:30:00Z"
}
```

---

### 6.2 List Complaints (Paginated & Filtered)
Retrieves a paginated list of parent complaints.

- **URL:** `/api/complaints`
- **Method:** `GET`
- **Auth Required:** Yes (Any authenticated role)
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:** `status`, `category`, `deptId`, `page`, `size`, `sort`

#### cURL Example
```bash
curl -X GET "http://localhost:8080/api/complaints?status=ASSIGNED&category=ROADS&page=0&size=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 6.3 Get Complaint by ID
Fetches full details of a specific complaint, including information on reporter, department, before/after images, and **all child duplicate complaints linked to it**.

- **URL:** `/api/complaints/{id}`
- **Method:** `GET`
- **Auth Required:** Yes (Any authenticated role)
- **Headers:** `Authorization: Bearer <token>`

#### cURL Example
```bash
curl -X GET http://localhost:8080/api/complaints/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 6.4 Update Complaint Status
Transitions a complaint to its next lifecycle state.

#### State Machine Workflow
```
REPORTED ──► ASSIGNED ──► IN_PROGRESS ──► RESOLVED ──► CLOSED
                                              ▲
                                    afterImage REQUIRED
```

> [!IMPORTANT]
> Transitioning to `RESOLVED` **strictly requires** an `afterImageUrl` in the JSON request (or an uploaded file in the fallback multipart request).

- **URL:** `/api/complaints/{id}/status`
- **Method:** `PUT`
- **Auth Required:** Yes (`WORKER` or `ADMIN`)
- **Headers:**
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json` *or* `multipart/form-data`

#### Primary Option: JSON Payload (Direct S3 Presigned URL Flow)
```bash
curl -X PUT http://localhost:8080/api/complaints/1/status \
  -H "Authorization: Bearer WORKER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "RESOLVED",
    "afterImageUrl": "https://civicsense-images.s3.ap-south-1.amazonaws.com/after/9fa85f64-4217-4562-b3fc-2c963f66afa6.jpg"
  }'
```

#### Secondary Option: Multipart Form-Data (Fallback)
```bash
curl -X PUT http://localhost:8080/api/complaints/1/status \
  -H "Authorization: Bearer WORKER_JWT_TOKEN" \
  -F 'statusUpdate={"status":"RESOLVED"};type=application/json' \
  -F 'afterImage=@/path/to/fixed_road.jpg'
```

#### Response: `200 OK`
```json
{
  "id": 1,
  "title": "Pothole on 5th Main",
  "description": "Deep pothole causing vehicle damage",
  "category": "ROADS",
  "status": "RESOLVED",
  "latitude": 12.971598,
  "longitude": 77.594562,
  "beforeImageUrl": "https://civicsense-images.s3.ap-south-1.amazonaws.com/before/7eb85b12-4217-4862-a3fc-8c963f66bba9.jpg",
  "afterImageUrl": "https://civicsense-images.s3.ap-south-1.amazonaws.com/after/9fa85f64-4217-4562-b3fc-2c963f66afa6.jpg",
  "departmentName": "Public Works",
  "reporterName": "Jane Citizen",
  "reporterEmail": "jane.citizen@example.com",
  "parentComplaintId": null,
  "duplicates": [],
  "createdAt": "2026-10-24T14:30:00Z",
  "updatedAt": "2026-10-24T15:00:00Z"
}
```

---

## 7. Static File Access (Local Mode)

When running with local storage (`USE_LOCAL_STORAGE=true`), uploaded files can be directly retrieved in the browser or front-end client:

- **Before Images:** `GET http://localhost:8080/uploads/before/{uuid}.jpg`
- **After Images:** `GET http://localhost:8080/uploads/after/{uuid}.jpg`
- **Auth Required:** No (Public static resource route configured in `WebConfig.java`)
