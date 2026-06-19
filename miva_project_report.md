# MIVA Open University
## School of Post Graduate Studies
### Master of Information Technology (MIT)
### MIT 8333 - Advanced Web Application Development (Virtual Lab)
---
# TECHNICAL PROJECT REPORT: UNIVERSITY MAINTENANCE REQUEST PORTAL

**Course Title:** Advanced Web Application Development  
**Session:** 2026/2027 Academic Session  
**Assessment:** Continuous Assessment (40 Marks)  
**Author:** Chukwudebelu Chinedu Maurice  

---

## 1. Introduction and Problem Statement
Currently, MIVA Open University receives maintenance complaints and service requests manually through phone calls, paper forms, WhatsApp messages, and office visits. This manual process causes several operational inefficiencies:
* **Delays**: Communication lag between reporting, reviewing, and assigning.
* **Missing Records**: Paper forms and chat history get lost.
* **Poor Tracking**: No clear way to view request status (e.g., Pending, In Progress, Completed).
* **Lack of Accountability**: Maintenance officers cannot be efficiently tracked for tasks assigned.

To resolve these problems, we have developed a **full-stack digital University Maintenance Request Portal** allowing students and staff to log service requests, enabling administrators to assign requests to maintenance officers, and allowing officers to update status in real-time.

---

## 2. System Objectives
The core objectives of the web application are to:
1. Provide a modern, interactive, and responsive UI portal for students, staff, officers, and administrators.
2. Automate user registration and authentication using secure password hashing and session tokens.
3. Design a relational database schema supporting foreign keys, cascading deletions, and audit trail tables.
4. Establish role-based dashboard views:
   * **Students/Staff**: Submit requests (Electricity, Plumbing, Furniture, Internet, Classroom, Hostel) and track status.
   * **Maintenance Officers**: View assigned requests and log progress.
   * **Administrators**: Control task assignments, view users, audit logs, and export reports.
5. Build RESTful API endpoints with structured pagination, keyword searching, and status filtering.

---

## 3. Requirement Analysis

### Functional Requirements
* **Authentication**: Users can sign up, log in, and log out.
* **Request Management**: Students can create request forms. Officers can edit status. Admins can assign tasks.
* **Audit Trail**: Every request transition (creation, assignment, status change) must be logged for transparency.
* **Report Exporting**: Admin can export all request details as a standard CSV file.

### Non-Functional Requirements
* **Security**: Password storage must be secured via bcrypt. Session authenticity must use JSON Web Tokens (JWT).
* **Portability**: The database engine must be self-contained (SQLite3) to enable fast setup without external services.
* **Reactivity**: Forms and tables must update live without requiring page refreshes.

---

## 4. Frontend Technologies Used
* **HTML5**: For semantic layout structuring of form panels, stats rows, and modal dialogs.
* **Vanilla CSS3**: Optimized utilizing CSS variables for theme selection. Styled with a premium, responsive dark-glassmorphic aesthetic.
* **Vanilla JavaScript (ES6+)**: Handles client-side routing, token preservation, dynamic DOM rendering, and API communication (`fetch`).

---

## 5. Backend Technologies Used
* **Node.js**: The Javascript execution runtime environment.
* **Express.js**: Lightweight framework for structuring RESTful API middleware, routes, and JSON request parsers.
* **JSON Web Tokens (JWT)**: Used to encode user identities in secure cookies or auth headers for stateful API authorization.
* **Bcrypt.js**: Cryptographic library used for generating password hashes during registration and verifying hashes during login.
* **Turso Database (libSQL Client)**: Serverless SQLite database SDK used for cloud persistent database access.
* **dotenv**: Load environment configuration files for local development database credentials.

---

## 6. The Database Used and Types of Relationships
The application integrates **SQLite3** locally and **Turso (libSQL)** in production, providing a lightweight, SQL-compliant relational database engine.

### Database Tables and Columns
1. **roles**: `id` (PK), `name` (Unique)
2. **users**: `id` (PK, Auto-increment), `name`, `email` (Unique), `password_hash`, `role_id` (FK → `roles.id`)
3. **categories**: `id` (PK), `name` (Unique)
4. **service_requests**: `id` (PK, Auto-increment), `title`, `description`, `category_id` (FK → `categories.id`), `status` (Pending/In Progress/Completed), `submitter_id` (FK → `users.id`)
5. **assignments**: `id` (PK, Auto-increment), `request_id` (FK → `service_requests.id`, Unique), `officer_id` (FK → `users.id`)
6. **status_logs**: `id` (PK, Auto-increment), `request_id` (FK → `service_requests.id`), `old_status`, `new_status`, `updated_by_id` (FK → `users.id`), `remarks`

### Entity-Relationship Diagram & Foreign Key Constraints
* **One-to-Many User Roles**: A role (Admin, Officer, Student) belongs to multiple users. `users.role_id` references `roles.id`.
* **One-to-Many Submissions**: A student submits multiple requests. `service_requests.submitter_id` references `users.id`.
* **One-to-One Assignments**: A service request can have at most one assigned officer. `assignments.request_id` references `service_requests.id` with a `UNIQUE` constraint.
* **One-to-Many Audit Logs**: A service request can trigger multiple status updates. `status_logs.request_id` references `service_requests.id` with cascading deletions enabled (`ON DELETE CASCADE`).

---

## 7. API Documentation (REST Endpoints)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user | None |
| `POST` | `/api/auth/login` | Log in, returns JWT token & user info | None |
| `GET` | `/api/users` | Retrieve all system users | Admin |
| `GET` | `/api/users/officers` | Fetch all maintenance officers | Admin |
| `POST` | `/api/requests` | Create a new maintenance request | Student/Staff |
| `GET` | `/api/requests` | Fetch requests (filtered by role scope) | Student, Officer, Admin |
| `GET` | `/api/requests/:id` | Fetch request detail and historical timeline | Submitter, Assigned Officer, Admin |
| `PUT` | `/api/requests/:id/status` | Update task status (Pending, In Progress, Completed)| Assigned Officer, Admin |
| `POST` | `/api/requests/:id/assign` | Assign task to maintenance officer | Admin |
| `GET` | `/api/logs` | Fetch system audit trail log list | Admin |
| `GET` | `/api/reports/csv` | Download complete database CSV spreadsheet | Admin |

---

## 8. Testing Evidence
Automated integration tests were implemented using **Jest** and **Supertest** to test the API endpoints under `tests/api.test.js`.

### Test Executions and Output
```text
PASS tests/api.test.js
  MIVA Maintenance System API Integration Tests
    √ POST /api/auth/register - Should register a new student user successfully (97 ms)
    √ POST /api/requests - Should create a new maintenance request (23 ms)
    √ GET /api/requests - Should fail without auth token (20 ms)
    √ GET /api/requests - Should return requests created by the student (15 ms)
    √ POST /api/requests/:id/assign - Admin should assign request to officer (23 ms)
    √ POST /api/requests/:id/assign - Student cannot assign request (13 ms)
    √ GET /api/requests/:id - Should fetch request details with history logs (24 ms)
    √ PUT /api/requests/:id/status - Admin should update status to In Progress (23 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        1.884 s
Ran all test suites.
```

---

## 9. Deployment and Production Architecture
The application is optimized for cloud deployment utilizing a serverless architecture on **Vercel** coupled with **Turso** for persistent, cloud-hosted SQLite storage.

### Production Stack & Architecture
* **Frontend/Backend Hosting**: Deployed to Vercel as serverless Node.js handlers.
* **Database**: Hosted on Turso (libSQL) cloud instances, connecting securely via WebSocket/HTTP connections.
* **Database Driver Strategy**: The application automatically routes queries:
  * When `TURSO_DATABASE_URL` is set: Queries are sent to the Turso cloud database using `@libsql/client`.
  * When absent: The app runs in fallback mode, using local `sqlite3` (ideal for isolated testing and offline development).
* **Lazy Seeding**: Because Vercel functions load server modules on demand, the application includes a middleware that intercepts the first API call to check, build, and seed the Turso database schemas automatically.

### How to Run Locally
1. Ensure Node.js is installed.
2. Run `npm install` to install dependencies (including `dotenv` and `@libsql/client`).
3. (Optional) Create a `.env` file in the root directory to configure Turso:
   ```env
   TURSO_DATABASE_URL=libsql://your-db-url.turso.io
   TURSO_AUTH_TOKEN=your-auth-token
   ```
4. Start the application:
   ```bash
   npm start
   ```
   *(If `.env` is omitted, the app automatically falls back to the local `miva_maintenance.db` file).*
5. Open [http://localhost:3000](http://localhost:3000) in your browser.
6. Seeded test credentials:
   * **Student**: `student@miva.edu.ng` / `student123`
   * **Admin**: `admin@miva.edu.ng` / `admin123`
   * **Officer**: `officer@miva.edu.ng` / `officer123`

### Live Production Deployment
* **GitHub Repository**: Linked to Vercel for continuous integration: [ccmaurice/miva-maintenance-system](https://github.com/ccmaurice/miva-maintenance-system)
* **Vercel Deployment**: Configured via `vercel.json` to map all backend and static folder requests to the node entry point.

---

## 10. Challenges Encountered and Solutions
* **Concurrency and Thread Safety with SQLite**: SQLite locks database files on writes.
  * *Solution*: Enforced sequential execution on unit tests by running Jest with the `--runInBand` flag and serialized asynchronous db operations using Promise blocks.
* **Session Expiry**: User credentials getting lost on refresh.
  * *Solution*: Cached JWT tokens securely inside HTML5 LocalStorage, automatically re-authenticating the user's role on loading.
* **Serverless Read-Only Filesystems & Persistence (Vercel)**: Standard serverless instances are stateless and block writes to local SQLite database files.
  * *Solution*: Migrated to Turso Serverless SQLite for production. Refactored the database connection layer to dynamically run on `@libsql/client` when credentials are set, while retaining local `sqlite3` for tests. Implemented a lazy initialization middleware in Express to seed database tables automatically on the first serverless request.

---

## 11. Conclusion
The University Maintenance Request Portal successfully replaces the error-prone manual complaint processes with a streamlined full-stack solution. The application ensures security through hashed credentials, transparency via audit status logs, and ease of administrative oversight through CSV reports and dynamic assignment tools.
