# KAMOTI: Key Alert and Monitoring for Online Tracking of Infrastructures
### Project Proposal Draft

**Submitted by:**
* Jimenez, Justine Leee
* Ariola, Jon Luigi
* Bauza, Xyrelle John
* Caliliw, Marl Zeldrix
* Conejos, Rainier Martin

**Course:** Web Systems and Technologies 2  
**Instructor:** Ma'am N. Maylyn Bautista  
**Date of Submission:** August 2026  
**Document status:** Working proposal; architecture and data model follow the current team plan.  

---

## Table of Contents
* [I. Problem Statement](#i-problem-statement)
* [II. Target Users](#ii-target-users)
* [III. Proposed Features](#iii-proposed-features)
  * [Citizen-Facing Features](#citizen-facing-features)
  * [Staff-Facing Features](#staff-facing-features)
  * [Administrator-Facing Features](#administrator-facing-features)
  * [Shared Features](#shared-features)
* [IV. User Roles](#iv-user-roles)
* [V. System Architecture](#v-system-architecture)
  * [System Architecture Diagram](#system-architecture-diagram)
  * [Key Architectural Notes](#key-architectural-notes)
* [VI. Data Model](#vi-data-model)
  * [Entity-Relationship Diagram](#entity-relationship-diagram)
* [VII. Technology Stack](#vii-technology-stack)
* [References](#references)

---

## I. Problem Statement

The transition from manual reporting to a centralized digital system is a critical step in modernizing local traffic governance and policies. When local government units rely on disorganized channels like phone calls and walk-ins, the inefficiencies stack up, leading to unused resources and unsatisfied citizens. Beyond the disorganized systems, relying on them comes with a whole other set of deeper, complex systemic issues. Reports often come in from different channels, often disorganized, which makes real-time analysis difficult, especially if that process is also manual; this, in turn, wastes the LGUs' time instead of assisting with such cases in the real-world, and manpower is instead focused on the verification of such cases.

The implementation of a role-based Public Infrastructure Reporting Web Application does more than just digitize forms; it transforms how work is routed and executed. By integrating geo-tagging and visual evidence, citizens can use their mobile devices to drop a precise GPS pin and upload timestamped photos, eliminating location ambiguity and allowing dispatchers to assess damage severity before sending a crew. Implementing this kind of technology invokes civic consciousness; it is often referred to as a "311 system" or crowdsourced civic issue reporting, and it yields benefits that extend far beyond simply fixing roads. By providing a public-facing dashboard where citizens can track the status of their report from submission to resolution, the LGU demonstrates transparency and accountability, which is a proven way to restore public trust and boost civic engagement.

Afonso (2017) notes that centralized web apps drastically lower the transaction costs of information gathering while highlighting the importance of closing the feedback loop to sustain citizen engagement. Similarly, Walwadkar et al. (2022) emphasize in their research that manual complaint systems fail under high volumes, outlining the necessity of implementing GPS sensors and visual proof to route issues effectively.

---

## II. Target Users

| User Group | Description |
| :--- | :--- |
| **Citizens/Pedestrians (General Users)** | Residents who want to report damaged infrastructure and track resolution progress. |
| **Staff/Employees** | Personnel responsible for reviewing, processing, and resolving reported issues (e.g., inspectors, maintenance coordinators). |
| **Administrators** | System managers responsible for overseeing users, categories, records, and overall reporting analytics. |

---

## III. Proposed Features

### Citizen-Facing Features
* Account registration and login
* Submit infrastructure reports (category, description, photo, map location)
* Track status of submitted reports (Pending -> Under Review -> In Progress -> Resolved)
* View public transparency board of all community reports
* Receive notifications on status updates

### Staff-Facing Features
* View assigned or available reports/requests
* Update the status of reports as work progresses
* Add remarks, resolution notes, or completion photos
* Manage transactions related to processing a report (e.g., inspection logs, work orders)

### Administrator-Facing Features
* Manage user accounts (citizens and staff)
* Manage infrastructure categories (roads, streetlights, drainage, signs, etc.)
* Manage and oversee all submitted records/reports
* Assign staff to reports
* Generate analytics and summary reports (volume by category, resolution time, status distribution)
* View system-wide activity logs

### Shared Features
* Map-based geotagging of reports
* Photo upload/attachment support
* Notification system for status changes
* Public transparency board (view-only, no login required)

---

## IV. User Roles

| Role | Access Level | Core Responsibilities |
| :--- | :--- | :--- |
| **Administrator** | Full system access | Manage users, manage categories, manage records/reports, view analytics, assign staff |
| **Staff/Employee** | Restricted, operational access | Process assigned requests, update report status, manage related transactions/logs |
| **General Users (Citizen/Pedestrians)** | Public/registered access | Register an account, submit requests/bookings (reports), view status of own submissions |

**Role-Based Access Control (RBAC)** will be implemented so that each role only sees the modules and data relevant to their function.

---

## V. System Architecture

KAMOTI is planned as one responsive web application with three layers. Citizens,
staff, and administrators use role-appropriate screens in the same React app.
The public transparency board can be viewed without signing in.

| Layer | Responsibility | Planned technology |
| :--- | :--- | :--- |
| Presentation | Forms, maps, dashboards, and status views | React, Vite, TypeScript, and Tailwind CSS |
| Application | REST routes, input checks, authorization, report workflow, notifications, and analytics | Express on Node.js, written in TypeScript |
| Identity and data | Accounts, relational records, and report photos | Supabase Auth, PostgreSQL, and Storage |

### System Architecture Diagram

~~~mermaid
flowchart LR
    B["Browser"]
    subgraph V["One Vercel project"]
        W["React + Vite web app"]
        A["Express API on Node.js"]
    end
    B --> W
    W -->|"/api/..."| A
    A --> SA["Supabase Auth"]
    A --> PG[("Supabase PostgreSQL")]
    A --> SS["Supabase Storage"]
~~~

### Key Architectural Notes

- Supabase Auth issues access tokens. The API verifies them, looks up the
  account role in profiles, and enforces permissions for protected operations.
- Citizens submit reports through the API. The API checks report inputs and
  photos before saving records in PostgreSQL and files in Supabase Storage.
  The planned upload limit is about 3 MB per photo for the Vercel deployment.
- The public board reads only reviewed report information and excludes citizen
  personal details.
- Report status changes are recorded in report history and create in-app
  notifications for the submitting citizen.
- A map provider will be chosen when the map interface is implemented. Email
  notifications remain optional.

---

## VI. Data Model

This diagram follows the current Supabase schema at a conceptual level. The SQL
migrations in the repository own exact columns and constraints.

### Entity-Relationship Diagram

~~~mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : extends
    PROFILES ||--o{ REPORTS : submits
    PROFILES ||--o{ REPORTS : assigned_to
    PROFILES ||--o{ REPORT_PHOTOS : uploads
    PROFILES ||--o{ REPORT_UPDATES : writes
    PROFILES ||--o{ REPORT_INSPECTIONS : inspects
    PROFILES ||--o{ NOTIFICATIONS : receives
    PROFILES ||--o{ ACTIVITY_LOGS : acts
    CATEGORIES ||--o{ REPORTS : classifies
    REPORTS ||--o{ REPORT_PHOTOS : has
    REPORTS ||--o{ REPORT_UPDATES : has
    REPORTS ||--o{ REPORT_INSPECTIONS : has
    REPORTS ||--o{ NOTIFICATIONS : triggers

    AUTH_USERS {
        uuid id PK
    }
    PROFILES {
        uuid id PK
        string role
    }
    CATEGORIES {
        bigint id PK
        string name
    }
    REPORTS {
        uuid id PK
        uuid citizen_id FK
        bigint category_id FK
        uuid assigned_staff_id FK
        string status
    }
    REPORT_PHOTOS {
        uuid id PK
        uuid report_id FK
        string storage_path
    }
    REPORT_UPDATES {
        uuid id PK
        uuid report_id FK
        uuid updated_by FK
    }
    REPORT_INSPECTIONS {
        bigint id PK
        uuid report_id FK
        uuid inspector_id FK
        string severity
    }
    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        uuid report_id FK
    }
    ACTIVITY_LOGS {
        bigint id PK
        uuid actor_id FK
    }
~~~

| Application table | Purpose |
| :--- | :--- |
| profiles | Role and contact details linked to Supabase Auth accounts |
| categories | Infrastructure issue types |
| reports | Submissions, locations, assignments, and current status |
| report_photos | Photo metadata and Supabase Storage paths |
| report_updates | Report history, status changes, assignments, and remarks |
| report_inspections | Staff assessments, findings, and severity for a report |
| notifications | In-app messages for users |
| activity_logs | System-wide administrative activity |

Supabase owns auth.users, shown above to explain its relationship with
profiles. The application schema now contains eight related tables. Inspection
records support the staff inspection log described in the proposed features.

---

## VII. Technology Stack

This is the agreed implementation target. Repository code and setup instructions
show which parts have been completed.

| Part | Chosen technology |
| :--- | :--- |
| Frontend | React, Vite, and TypeScript; Tailwind CSS is planned |
| API | Express and TypeScript on the Node.js runtime |
| Package manager | Bun |
| Database | Supabase PostgreSQL |
| Authentication and authorization | Supabase Auth issues tokens; the Express API verifies tokens and enforces roles |
| Photo handling | Multer parses uploads; Supabase Storage holds files |
| Maps | Leaflet with OpenStreetMap or Google Maps, to be decided during frontend work |
| Notifications | In-app notifications; email is optional |
| Hosting | One Vercel project for the built web app and Node.js API functions |
| Version control | Git and GitHub |

The browser calls the same /api paths locally and after deployment. Vite
forwards those requests to Express during local development.

---

## References

1. Afonso, W. (2017, April 24). *Crowdsourcing for local governments: Research Review - Death & taxes*. [UNC School of Government](https://deathandtaxes.sog.unc.edu/2017/04/24/crowdsourcing-for-local-governments-research-review/#:~:text=They%20conclude%20with%20three%20themes%20they%20believe,help%20and%20feel%20like%20they%20can%20help).
2. Anand, A., Acharya, A., & Ja, A. N. (2026). *A research paper on Crowdsourced Civic Issue Reporting and Resolution System*. Zenodo (CERN European Organization for Nuclear Research). [https://doi.org/10.5281/zenodo.19677894](https://doi.org/10.5281/zenodo.19677894).
