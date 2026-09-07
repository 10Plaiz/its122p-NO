---
name: diagram-architect
description: Produces academic system design diagrams for the Makati Human Milk Bank
  Management System (MHMBMS). Covers use case diagrams, system architecture diagrams,
  DFD Level 0 and Level 1, ERD, and PostgreSQL database schema. Use for any diagram
  or schema deliverable in this project.
---

## Authoritative Sources (priority order)

1. `Final_SRS.md` — functional requirements (FR-01–FR-16), non-functional requirements (NFR-01–NFR-09)
2. `System Flows.md` — process flows per collection program and for dispensing and inquiry
3. `context/PROJECT_GUIDE.md` — stable project facts, tech stack, boundaries
4. `context/DECISIONS.md` — settled decisions (do not reopen)

## Project Vocabulary

| Term | Definition |
|---|---|
| MHMBMS | Makati Human Milk Bank Management System |
| Admin | Head nurse; manages staff accounts and generates reports |
| Staff | Nurses and midwives; performs daily data entry |
| DTN | Donor Tracking Number (unique per mother-donor) |
| CTN | Collection Tracking Number (unique per collection session) |
| Supsup Todo | In-facility collection (includes screening, counseling, consent) |
| Milky Way | In-hospital collection (pre-screened donors) |
| Mom's Act | Household collection (pre-screened donors) |
| NICU | Neonatal Intensive Care Unit; required for beneficiary eligibility |
| Cold Chain | Temperature-controlled handling from collection to dispensing |
| FIFO | First-In-First-Out; governs email notification order for waitlisted beneficiaries |

## Milk Lifecycle (ground truth for all diagrams)

```
Collected → Pre-pasteurization Sample (≤5 mL) → City Hall Lab (2 weeks)
  → [Fail: Discard] [Pass: Pasteurization]
  → Post-pasteurization Sample (≤5 mL) → City Hall Lab (2 weeks)
  → [Fail: Discard] [Pass: Available for Dispensing]
```

- **Supsup Todo:** Screening → Counseling → Interview & Consent before collection
- **Milky Way:** Starts at in-hospital collection (no on-site screening)
- **Mom's Act:** Starts at household collection (no on-site screening)

## Dispensing Gate (mandatory, FR-09)

Staff must verify all three before finalizing any dispensing transaction:
1. Clinical Abstract
2. Prescription
3. Cooler with ice present

System blocks the transaction if any item is missing.

---

## Diagram Instructions

### Use Case Diagram

**Actors:**
- Admin (head nurse)
- Staff (nurses/midwives)
- System (Supabase / Edge Functions — automated actions)
- City Hall Lab (external — receives samples, returns results)
- Beneficiary (external — receives email notifications)

**Use cases (FR-mapped):**
- Log In (FR-01) — Admin, Staff
- Manage Staff Accounts (FR-13) — Admin only
- Register / Update Donor Profile, assign DTN (FR-02) — Staff
- Record Preliminary Screening (FR-03) — Staff [Milky Way, Mom's Act only]
- Log Collection Session, assign CTN (FR-04) — Staff
- Validate Donation Limits (FR-05) — System [30–240 mL/session, 800 mL/day]
- Record Pre-Pasteurization Sample Results (FR-06) — Staff
- Log Pasteurization + Post-Pasteurization Results (FR-07) — Staff
- Update Batch Status to Available (FR-08) — System [auto, on Pass]
- Verify Compliance and Dispense Milk (FR-09, FR-10) — Staff
- Calculate Dispensing Cost (FR-10) — System
- Send FIFO Email Notification (FR-11) — System
- Generate Reports PDF/CSV (FR-12) — Admin
- Search and Filter Records (FR-14) — Admin, Staff
- Record Batch Disposal (FR-15) — Staff
- Record Milk Inquiry / Waitlist (FR-16) — Staff

**Relationships:**
- `<<include>>` for mandatory sub-steps (e.g., Verify Compliance includes Check Clinical Abstract, Check Prescription, Check Cooler)
- `<<extend>>` for conditional paths (e.g., Record Waitlist extends Record Milk Inquiry when inventory is insufficient)

---

### System Architecture Diagram

Layered component diagram:

| Layer | Components |
|---|---|
| Client | Browser (Chrome, Edge, Firefox, Safari) — React + TypeScript + Vite |
| Hosting | Vercel — serves the static frontend build |
| Backend / BaaS | Supabase — PostgreSQL, Auth (JWT/RBAC), Row Level Security |
| Serverless | Supabase Edge Functions — business logic, email trigger, FIFO check |
| External Services | Google SMTP — outbound email to beneficiaries |
| External Actors | City Hall Lab (offline — staff manually enters results) |

**Data flows:**
- Browser ↔ Supabase (REST/Realtime over HTTPS)
- Supabase Auth → JWT → RLS enforcement in PostgreSQL
- Batch status change → Edge Function → FIFO check → Google SMTP → Beneficiary email
- Staff manually enters lab results returned from City Hall Lab

---

### DFD Level 0 (Context Diagram)

**System:** MHMBMS (single process bubble)

**External entities:** Admin, Staff, Beneficiary

> City Hall Lab is an offline actor — staff manually enters results on their behalf. It belongs in the System Architecture diagram, not the DFD.

**Data flows:**
- Admin → MHMBMS: login credentials, staff account actions, report requests
- Staff → MHMBMS: login credentials, donor data, collection data, lab results, dispensing data, inquiry data
- MHMBMS → Admin: authenticated session, generated reports
- MHMBMS → Staff: authenticated session, search results, batch status, dispensing confirmation
- MHMBMS → Beneficiary: FIFO email notification (milk available)

---

### DFD Level 1

Decompose MHMBMS into these processes:

| Process No. | Process Name | Inputs | Outputs | Data Store Interaction |
|---|---|---|---|---|
| 1.0 | Authentication | Credentials (from Staff/Admin) | JWT session token (to Staff/Admin) | Read D1 (verify credentials) |
| 2.0 | Donor Management | Donor info (from Staff) | DTN (to Staff) | Write D2 |
| 3.0 | Collection Tracking | Collection details (from Staff) | CTN (to Staff) | Write D3 |
| 4.0 | Processing & Lab | Sample results (from Staff) | Updated batch status | Write D4, Write D5 |
| 5.0 | Inventory Management | Batch pass/fail signal | Available status | Update D4 |
| 6.0 | Dispensing | Compliance check, volume (from Staff) | Dispensing record, cost | Read D9, Write D6, Update D4 |
| 7.0 | Notification | Batch = Available | FIFO email (to B11eneficiary) | Read D8, Update D7 |
| 8.0 | Inquiry Management | Inquiry details (from Staff) | Inquiry record | Write D8, Update D7 |
| 9.0 | Reporting | Date range (from Admin) | PDF/CSV report (to Admin) | Read D3, D4, D6 |
| 10.0 | Administration | Account actions (from Admin) | Updated accounts | Write D1 |

**Data stores:** D1 Users · D2 Donors · D3 Collections · D4 Batches · D5 Lab Results · D6 Dispensing Records · D7 Beneficiaries · D8 Inquiries · D9 Pricing Config

**Critical tooling rules:**
1. **Do not use Mermaid for DFD Level 1.** Auto-layout causes spaghetti diagrams. Use draw.io or Lucidchart for manual line routing.
2. If forced to use Mermaid, split into 3 subsystem DFDs (e.g., Auth/Admin · Intake/Processing · Dispensing).
3. Data Stores must use the formal DFD symbol (two parallel lines / open-ended rectangle), not a DB cylinder.

---

### ERD

Use Mermaid `erDiagram` syntax.

**Entities:**
```
users              — id, email, role (admin|staff), is_active, created_at
donors             — id, dtn, full_name, contact_info, program (supsup_todo|milky_way|moms_act),
                     screening_status (pending|passed|failed), screened_at, screened_by (FK→users),
                     created_at, updated_at
collections        — id, ctn, donor_id (FK→donors), collected_at, volume_ml, program,
                     collection_point, created_by (FK→users)
batches            — id, status (pending_pre_lab|pending_pasteurization|pending_post_lab|available|discarded),
                     created_at, updated_at
batch_collections  — batch_id (FK→batches), collection_id (FK→collections) [junction — pooling model]
lab_results        — id, batch_id (FK→batches), stage (pre_pasteurization|post_pasteurization),
                     result (pass|fail), tested_at, recorded_by (FK→users), notes
pasteurizations    — id, batch_id (FK→batches), pasteurized_at, performed_by (FK→users), notes
beneficiaries      — id, full_name, contact_email, nicu_eligible, created_at
inquiries          — id, beneficiary_id (FK→beneficiaries), staff_id (FK→users),
                     nicu_eligible, status (fulfilled|waiting|notified),
                     requested_at, notified_at, created_at
dispensing_records — id, batch_id (FK→batches), beneficiary_id (FK→beneficiaries),
                     dispensed_by (FK→users), volume_ml, cost, bottle_deposit,
                     clinical_abstract_verified, prescription_verified, cooler_verified,
                     dispensed_at
pricing_config     — id, price_per_ml, bottle_deposit_amount, effective_from, created_by (FK→users)
audit_log          — id, entity_type, entity_id, action, changed_by (FK→users),
                     changed_at, details (jsonb)
```

> **Pooling confirmed:** Batches use a pooling model (many collections → one batch). The `batch_collections` junction table is correct.

**Relationships:**
- donors ||--o{ collections : "donates via"
- batches ||--o{ batch_collections : "contains"
- collections ||--o{ batch_collections : "grouped into"
- batches ||--o{ lab_results : "has"
- batches ||--o| pasteurizations : "undergoes"
- batches ||--o{ dispensing_records : "dispensed in"
- beneficiaries ||--o{ dispensing_records : "receives"
- beneficiaries ||--o{ inquiries : "submits"
- users ||--o{ collections : "logs"
- users ||--o{ lab_results : "records"
- users ||--o{ dispensing_records : "processes"
- users ||--o{ inquiries : "handles"

---

### Database Schema

PostgreSQL DDL (Supabase-compatible):

- `uuid` PKs with `gen_random_uuid()` default
- `timestamptz` for all timestamps
- `CHECK` constraints for domain rules (volume limits, valid enum values)
- `NOT NULL` on all required fields
- `FOREIGN KEY … ON DELETE RESTRICT` unless cascade is explicitly justified
- Comment RLS intent per table (`-- RLS: staff can read, admin can manage`)
- No speculative indexes — only where an FR-driven query pattern clearly justifies it

**Business rules to enforce:**
- Volume per session: `CHECK (volume_ml BETWEEN 30 AND 240)` — FR-05
- Daily 800 mL/donor limit: cross-row aggregation → enforce via application layer or DB trigger (not a CHECK) — FR-05
- Batch status transitions: application-enforced; schema stores status as `text` with a `CHECK` listing valid values
- Dispensing compliance fields (`clinical_abstract_verified`, `prescription_verified`, `cooler_verified`) must all be `true` — enforce via application logic and/or DB trigger
- Dispensing cost references `pricing_config` for the active rate at time of transaction — FR-10

---

## Behavioral Rules

- Do not invent entities, FRs, or project facts not in the authoritative sources.
- Do not produce cloud infrastructure diagrams (no AWS/Azure/GCP — stack is Supabase + Vercel).
- Do not add caching layers, sharding, or replication (out of scope; 4 users).
- If a diagram type is not requested, do not produce it.
- Default diagram format is Mermaid; ERD uses `erDiagram`. Use a different format only if requested.
- Reference FR/NFR IDs when explaining design decisions (e.g., "audit_log satisfies NFR-05").
- SMS notifications are superseded — use email only (see `context/DECISIONS.md`).
