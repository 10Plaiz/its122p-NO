# Developer Journey Maps and System Architecture

## 1. Context and Purpose

### 1.1 System Context
KAMOTI is a web software platform. The platform lets citizens report broken public infrastructure. Examples include damaged roads, broken streetlights, and blocked drainage. The platform lets municipal staff track and repair these problems.

The software stack contains three main parts:
- Frontend: React with TypeScript, Vite, and Tailwind CSS in [`src/web/`](../src/web/).
- Backend: Express API with TypeScript and Node.js in [`src/server/`](../src/server/).
- Database and Auth: Supabase PostgreSQL, Authentication, and Object Storage.

### 1.2 Purpose of this Document
This document defines the complete technical user journeys for all account types.

Developers must use this document to:
- Understand how each user role moves through the system.
- Trace frontend screens to backend API routes and database state changes.
- Explain and demonstrate the system architecture during project reviews.
- Identify system boundaries and verify state changes.

### 1.3 User Roles
The system defines four user roles:
1. Public Visitor: An unauthenticated person who browses published reports.
2. Citizen: A registered resident who submits and tracks personal reports.
3. Staff Member: A municipal field worker who repairs assigned problems.
4. Administrator: A city official who manages reports, accounts, and categories.

---

## 2. Report Lifecycle State Machine

A report moves through five discrete states. The service module [`src/server/services/reports.service.ts`](../src/server/services/reports.service.ts) controls all state transitions.

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Cancelled : Citizen cancels report
    Pending --> UnderReview : Staff reviews report
    UnderReview --> InProgress : Staff begins repair
    InProgress --> Resolved : Staff resolves report
    Resolved --> [*]
    Cancelled --> [*]

    note right of Pending
        Citizen can edit report details.
        Citizen can change location pin.
        Public board does not show report.
    end note

    note right of UnderReview
        Public board shows report.
        System removes citizen personal data.
    end note

    note right of InProgress
        Repair work is active.
        Staff adds remarks.
    end note

    note right of Resolved
        Staff uploads photo proof.
        Citizen receives notification.
    end note
```

### 2.1 State Rules and Permissions

| Report Status | Public Board Visibility | Role That Sets Status | Permitted User Actions |
| :--- | :--- | :--- | :--- |
| `pending` | Hidden | Citizen (on form submit) | The citizen can edit title, description, category, and location pin. The citizen can cancel the report. |
| `under_review` | Visible (PII scrubbed) | Staff (via status advance) or Admin (via staff assignment) | Staff or Admin can record remarks. Admin can reassign staff. |
| `in_progress` | Visible (PII scrubbed) | Assigned Staff or Admin | Staff can record remarks. Staff can upload repair photos. |
| `resolved` | Visible (PII scrubbed) | Assigned Staff or Admin | Terminal state. System requires repair photo before this step. |
| `cancelled` | Hidden | Citizen owner only | Terminal state. System retains database row for audit integrity. |

---

## 3. Persona Journey Maps

### 3.1 Public Visitor Journey

The Public Visitor discovers community problems without an account. The visitor can browse and filter reviewed reports.

```mermaid
flowchart TD
    Start(["Visitor opens site"]) --> EntryPage["Entry page: /"]
    EntryPage -->|"Select Browse board"| BoardView["Public board: /board"]
    EntryPage -->|"Select Report issue"| CheckAuth{"Is user signed in?"}
    
    CheckAuth -->|"No"| SignIn["Sign in page: /signin"]
    SignIn -->|"Select Register"| Register["Register page: /register"]
    Register -->|"Submit valid form"| SignIn
    
    BoardView --> SearchFilter["Filter by category, status, or keyword"]
    BoardView --> MapInteraction["Move map or click pin"]
    MapInteraction --> CardPreview["Read report description and photo"]
    
    BoardView -->|"Select Back to start"| EntryPage
```

#### Step Walkthrough
1. Entry Landing:
   - The visitor lands on [`EntryPage`](../src/web/pages/Entry.tsx) at route `/`.
   - The page requests `/api/public/stats` and shows the total report count.
   - The page shows three descriptive steps of the reporting procedure.
2. Community Transparency Board:
   - The visitor navigates to [`BoardPage`](../src/web/pages/Board.tsx) at route `/board`.
   - The page requests `GET /api/public/reports`.
   - The server scrubs all citizen personal identification from the response.
   - The page stores filter parameters in the browser URL query string.
   - The visitor can pan the map or select report pins to preview details.

---

### 3.2 Citizen Journey

The Citizen registers, submits infrastructure reports through a three-step wizard, and monitors personal report progress.

```mermaid
flowchart TD
    CitizenStart(["Citizen signs in"]) --> Home["My reports page: /my-reports"]
    
    Home -->|"Select Report issue"| Step1["Step 1: Select location on map"]
    Step1 -->|"Select location"| ReverseGeo["System fills address text"]
    ReverseGeo --> Step2["Step 2: Enter category, title, description"]
    Step2 --> Step3["Step 3: Upload photo and check summary"]
    Step3 -->|"Submit report"| DetailView["Report detail page: /reports/:id"]
    
    Home -->|"Search or filter"| ReportTable["Reports table"]
    ReportTable -->|"Pending report"| CancelAction["Cancel report action"]
    ReportTable -->|"Select row"| DetailView
    
    DetailView -->|"If status is Pending"| EditMode["Edit report page"]
    EditMode -->|"Save changes"| DetailView
    DetailView --> ReadTimeline["Read history updates and photo proof"]
    
    Home -->|"Select Notifications"| NotifView["Notifications page: /notifications"]
    NotifView -->|"Select Open report"| DetailView
```

#### Step Walkthrough
1. Authentication:
   - The user opens [`RegisterPage`](../src/web/pages/Register.tsx) at `/register`.
   - The user enters name, email, password, and optional contact number.
   - Public registration always assigns the `citizen` role.
   - The user signs in on [`SignInPage`](../src/web/pages/SignIn.tsx) at `/signin`.
2. Report Submission Wizard:
   - The citizen opens [`NewReportPage`](../src/web/pages/NewReport.tsx) at `/report/new`.
   - Step 1 (Where is it?): The user drops a pin on [`MapPicker.tsx`](../src/web/components/MapPicker.tsx). Nominatim reverse-geocodes the coordinates into an address.
   - Step 2 (What is wrong?): The user enters a title (3 to 150 characters), category, and description (10 to 1000 characters).
   - Step 3 (Show us): The user attaches an optional photo (max 3 MB, JPG/PNG/WebP). The user reviews the summary and clicks submit.
3. Personal Workspace and Report Tracking:
   - The citizen opens [`MyReportsPage`](../src/web/pages/MyReports.tsx) at `/my-reports`.
   - If the report status is `pending`, the citizen can cancel the report.
   - The citizen opens [`ReportDetailPage`](../src/web/pages/ReportDetail.tsx) at `/reports/:id`.
   - While the report status is `pending`, the citizen can edit details inline.
   - The citizen monitors status updates on the chronological timeline.

---

### 3.3 Staff Member Journey

The Staff Member inspects assigned reports, communicates with citizens, records operational notes, uploads repair proof, and advances report status.

```mermaid
flowchart TD
    StaffStart(["Staff signs in"]) --> Queue["Staff queue page: /staff/queue"]
    
    Queue -->|"View list"| QueueTable["Queue table ordered oldest first"]
    QueueTable -->|"Select next action"| StaffDetail["Staff report page: /staff/reports/:id"]
    
    StaffDetail --> InspectInfo["Read description and citizen contact"]
    StaffDetail --> AddNote["Save remark on report"]
    StaffDetail --> UploadPhoto["Upload photo proof of repair"]
    StaffDetail --> NextStep["Advance status to next legal state"]
    
    StaffDetail -->|"Select return link"| Queue
```

#### Step Walkthrough
1. Queue Triage:
   - The staff member signs in and lands on [`StaffQueuePage`](../src/web/pages/StaffQueue.tsx) at `/staff/queue`.
   - The API scopes `GET /api/reports` to reports assigned to this staff member.
   - The table sorts items oldest first.
   - Each row displays an action button for the single next legal status step.
2. Report Execution:
   - The staff member opens [`StaffReportPage`](../src/web/pages/StaffReport.tsx) at `/staff/reports/:id`.
   - The staff member reads citizen contact information for field communication.
   - The staff member can add an operational remark via `POST /api/reports/:id/remarks`.
   - The staff member can upload a repair proof photo via `POST /api/reports/:id/photos`.
   - The staff member advances report status via `PATCH /api/reports/:id/status`.

---

### 3.4 Administrator Journey

The Administrator monitors system metrics, triages incoming reports, assigns staff members, provisions accounts, and inspects activity logs.

```mermaid
flowchart TD
    AdminStart(["Administrator signs in"]) --> Dashboard["Admin dashboard: /admin"]
    
    Dashboard --> Metrics["Review total reports and resolution metrics"]
    
    Dashboard --> NavReports["Reports page: /admin/reports"]
    NavReports --> OpenAssignDialog["Open assignment dialog"]
    OpenAssignDialog --> SubmitAssign["Assign staff member to report"]
    
    Dashboard --> NavUsers["Users page: /admin/users"]
    NavUsers --> CreateUser["Create new staff or admin user"]
    NavUsers --> ModifyUser["Change user role or deactivate user"]
    
    Dashboard --> NavCategories["Categories page: /admin/categories"]
    NavCategories --> AddCategory["Add new report category"]
    NavCategories --> RetireRestore["Retire category or restore category"]
    
    Dashboard --> NavLogs["Audit logs page: /admin/logs"]
    NavLogs --> InspectLogs["Read system activity logs"]
```

#### Step Walkthrough
1. Dashboard Analytics:
   - The administrator lands on [`AdminDashboardPage`](../src/web/pages/AdminDashboard.tsx) at `/admin`.
   - The screen shows total reports, resolved count, and average resolution time in days.
   - Proportional bar charts show distribution across statuses and categories.
2. Report Assignment:
   - The administrator opens [`AdminReportsPage`](../src/web/pages/AdminReports.tsx) at `/admin/reports`.
   - The administrator opens the assignment dialog on a report.
   - The administrator selects an active staff member and submits `PATCH /api/reports/:id/assign`.
   - The server assigns the staff member and moves `pending` reports to `under_review`.
3. User and Category Maintenance:
   - The administrator opens [`AdminUsersPage`](../src/web/pages/AdminUsers.tsx) at `/admin/users` to create staff or admin accounts.
   - The administrator can deactivate users without deleting historical reports.
   - The administrator opens [`AdminCategoriesPage`](../src/web/pages/AdminCategories.tsx) to add or retire categories.
4. Audit Log Review:
   - The administrator opens [`AdminLogsPage`](../src/web/pages/AdminLogs.tsx) at `/admin/logs`.
   - The screen shows system-wide events with actor name, role, timestamp, and JSON metadata.

---

## 4. Verification and Grounding Matrix

This matrix links each journey step to the verified source files in the repository.

| User Flow | Frontend UI File | Backend API Route | Service or DB Operation | Verification Rule |
| :--- | :--- | :--- | :--- | :--- |
| Public Board Browsing | [`Board.tsx`](../src/web/pages/Board.tsx) | `GET /api/public/reports` | [`src/server/routes/public.routes.ts`](../src/server/routes/public.routes.ts) | Returns only reviewed reports. Does not include citizen personal data. |
| Citizen Submission | [`NewReportPage`](../src/web/pages/NewReport.tsx) | `POST /api/reports` | [`src/server/routes/reports.routes.ts:L105`](../src/server/routes/reports.routes.ts#L105) | Validates title, description, category, and coordinates. Saves optional initial photo. |
| Citizen Report Edit | [`ReportDetailPage`](../src/web/pages/ReportDetail.tsx) | `PATCH /api/reports/:id` | [`src/server/routes/reports.routes.ts:L155`](../src/server/routes/reports.routes.ts#L155) | Server accepts edit only if status is `pending` and caller is report owner. |
| Citizen Cancellation | [`MyReportsPage`](../src/web/pages/MyReports.tsx) | `POST /api/reports/:id/cancel` | [`src/server/routes/reports.routes.ts:L164`](../src/server/routes/reports.routes.ts#L164) | Updates status to `cancelled`. Does not delete database record. |
| Staff Queue Retrieval | [`StaffQueuePage`](../src/web/pages/StaffQueue.tsx) | `GET /api/reports` | [`src/server/routes/reports.routes.ts:L89`](../src/server/routes/reports.routes.ts#L89) | Scopes records to caller staff ID. Orders records oldest first. |
| Status Transition | [`StaffReportPage`](../src/web/pages/StaffReport.tsx) | `PATCH /api/reports/:id/status` | [`src/server/services/reports.service.ts:L20`](../src/server/services/reports.service.ts#L20) | Enforces single legal forward step from `NEXT_STATUS` dictionary. |
| Repair Photo Upload | [`StaffReportPage`](../src/web/pages/StaffReport.tsx) | `POST /api/reports/:id/photos` | [`src/server/routes/reports.routes.ts:L207`](../src/server/routes/reports.routes.ts#L207) | Classifies photo kind as `resolution` when uploaded by staff or admin. |
| Staff Assignment | [`AdminReportsPage`](../src/web/pages/AdminReports.tsx) | `PATCH /api/reports/:id/assign` | [`src/server/routes/reports.routes.ts:L189`](../src/server/routes/reports.routes.ts#L189) | Restricts assignment to active staff profiles. Moves `pending` status to `under_review`. |
| User Provisioning | [`AdminUsersPage`](../src/web/pages/AdminUsers.tsx) | `POST /api/admin/users` | [`src/server/routes/admin.routes.ts`](../src/server/routes/admin.routes.ts) | Admin creates user with staff or admin role and sets initial password. |
| Category Retirement | [`AdminCategoriesPage`](../src/web/pages/AdminCategories.tsx) | `DELETE /api/categories/:id` | [`src/server/routes/categories.routes.ts`](../src/server/routes/categories.routes.ts) | Sets `is_active = false`. Keeps category linked on existing reports. |
