# KAMOTI Feature Map Index

This directory maps every user-facing feature in KAMOTI to its programmatic driving recipe and verification standards.

| Feature Map | Target Route | Primary Persona | Verification Objective |
| :--- | :--- | :--- | :--- |
| [Public Transparency Board](public-board.md) | `/board` | Public Visitor | Verify report card browsing, filter persistence, and mobile map/list responsiveness. |
| [Citizen Reporting and Tracking](citizen-reporting.md) | `/report/new`, `/my-reports`, `/reports/:id` | Citizen | Verify 3-step reporting wizard, geocoding guidance, photo attachment, pre-flight review, mobile report cards, cancellation modal, and photo lightbox. |
| [Staff Queue and Triage](staff-queue.md) | `/staff/queue`, `/staff/reports/:id` | Staff Member | Verify oldest-first sorting, mobile task cards, direct contact links, report inspection, operational remarks, photo proof, and status transitions. |
| [Admin Management](admin-management.md) | `/admin/*` | Administrator | Verify dashboard metrics, consolidated navigation tabs, staff assignment, role controls, and category management. |
| [Authentication and Session Management](authentication.md) | `/signin`, `/register` | Visitor / Registered User | Verify credential authentication, registration form validity, field error announcements, role-based redirects, and session logout. |
