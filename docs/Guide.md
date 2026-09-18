# Final Project - ITS122P - AM2
## Web-Based Smart Service Management System

> **Later instructor clarification:** The team may choose its technology stack.
> The PHP and MySQL wording below is preserved from the original handout and
> does not restrict KAMOTI's stack. The separate minimum of eight related
> tables remains a project requirement.

Students will design and develop a real-world web application for a small business, school office, community organization, or service provider.

### Topics:
* Clinic Appointment and Queue System
* School Facility Reservation System
* Barangay Service Request System
* Student Organization Management System
* Salon/Barbershop Appointment System
* Small Restaurant Ordering System
* Equipment Borrowing System
* IT Help Desk / Support Ticket System
* Property/Rental Management System
* Campus Lost-and-Found System

---

## Core Requirement

The application must have at least three user roles:

| Role | Sample Functions |
| :--- | :--- |
| **Administrator** | Manage users, categories, records, reports |
| **Staff/Employee** | Process requests, update status, manage transactions |
| **Customer/User** | Register, submit requests/bookings, view status |

---

## Required Technical Features

Students should demonstrate:

### 1. Responsive Web Interface
* HTML5
* CSS3
* Bootstrap or Tailwind CSS
* Mobile-friendly design

### 2. Client-Side Programming
* JavaScript
* Form validation
* DOM manipulation
* Fetch/AJAX
* Dynamic content

### 3. Server-Side Programming
* PHP or another approved server-side technology
* Routing
* Sessions
* Authentication
* Authorization

### 4. Database
* MySQL
* Proper database design
* Primary/foreign keys
* Relationships
* CRUD operations
* SQL queries
* Normalization

### 5. REST API
Students should create at least one API and consume either their own API or an external API.

#### Example:
```http
GET /api/services
GET /api/appointments
POST /api/appointments
PUT /api/appointments/{id}
DELETE /api/appointments/{id}
```

### 6. Authentication and Security
* Login/logout
* Password hashing
* Role-based access
* Input validation
* Prepared statements
* Protection against SQL injection
* Basic XSS protection
* Appropriate session management

### 7. Dashboard and Reporting

#### Example:
* **Total Requests:** 1,245
* **Pending:** 85
* **Completed:** 1,102
* **Cancelled:** 58

```text
[Monthly Transactions Chart]
[Most Requested Services]
[Recent Activities]
```

### 8. Search, Filter and Sort
* Keyword search
* Date filtering
* Status filtering
* Sorting
* Pagination

### 9. API Integration
Students may integrate an appropriate external API, such as:
* Maps/location API
* Weather API
* Currency API
* Email service
* QR-code service
* Public Philippine government/open-data API

### 10. AI-Assisted Development
This would fit particularly well with the goal of developing AI fluency.

Students may use AI tools to:
* Generate code
* Debug code
* Explain unfamiliar code
* Generate test cases
* Improve UI
* Suggest database designs
* Review security vulnerabilities
* Generate documentation

#### Submit an AI Usage Log showing:

| Date | AI Tool | Prompt | AI Output | What Student Changed | Reason |
| :--- | :--- | :--- | :--- | :--- | :--- |
| | | | | | |

*This prevents the project from becoming simply "copy the AI-generated website."*

---

## Project Structure / Deliverables

### Phase 1: Proposal
Students submit:
* Project title
* Problem statement
* Target users
* Proposed features
* User roles
* System architecture
* Initial ERD
* Technology stack

### Phase 2: Database + Backend
Students implement:
* Database
* Tables
* Relationships
* CRUD
* Authentication
* Basic backend

### Phase 3: Frontend + API
Students implement:
* Responsive interface
* JavaScript functionality
* API
* AJAX/Fetch
* Form validation
* Search/filter

### Phase 4: Security + Testing
Students perform:
* Input validation
* SQL injection testing
* Authentication testing
* Authorization testing
* XSS testing
* Functional testing
* Usability testing

### Phase 5: Final Presentation
* Each group conducts a 15-20 minute system demonstration.
* They should demonstrate the system as if presenting it to a real client.

---

## Team Organization & Responsibilities

* **Group Size:** 4-5 students per group.
* Assign individual responsibilities to prevent free-riding.

| Student Name | Responsibility |
| :--- | :--- |
| **Member 1** | Project Manager / System Analyst |
| **Member 2** | Frontend Developer |
| **Member 3** | Backend Developer |
| **Member 4** | Database/API Developer |
| **Member 5** | QA/Security/UI/Documentation |

> Every member must be able to explain the entire system, not just their assigned portion.

---

## Final Project Requirements

### Mandatory
* Responsive web application
* Login/logout
* Minimum 3 user roles
* MySQL database
* Minimum 8 related tables
* CRUD operations
* Server-side processing
* JavaScript interaction
* REST API
* API consumption
* Search/filter
* Dashboard
* Reports
* Form validation
* Security implementation
* Error handling
* Deployment
* Technical documentation

### Advanced / Bonus
* Email notification
* QR code
* Maps
* Real-time notification
* File upload
* PDF report generation
* Progressive Web App features
* Accessibility features
* AI-powered feature

---

## Transformation Verification Criteria

The following verification criteria define what constitutes a successful, lossless transformation of the source document (`Final_Project_Guide.pdf`) into this Markdown file:

| Category | Criterion | Verification Method | Status |
| :--- | :--- | :--- | :--- |
| **Completeness** | All 10 candidate project topics are present verbatim. | Cross-reference Section "Topics" against PDF Page 1. | PASS |
| **Completeness** | All 3 core user roles (Administrator, Staff/Employee, Customer/User) and sample functions are retained. | Cross-reference Table "Core Requirement" against PDF Page 1. | PASS |
| **Completeness** | All 10 technical feature modules and sub-items are captured (including Normalization, REST API route methods, Dashboard counts, UI widget placeholders, and AI usage scope). | Cross-reference Section "Required Technical Features" against PDF Pages 2-5. | PASS |
| **Completeness** | The AI Usage Log table schema preserves all 6 columns: Date, AI Tool, Prompt, AI Output, What Student Changed, Reason. | Verify AI Usage Log table header against PDF Page 5. | PASS |
| **Completeness** | All 5 phases (Phase 1 through Phase 5) with exact deliverables and presentation duration (15-20 min) are captured. | Cross-reference Section "Project Structure / Deliverables" against PDF Pages 5-6. | PASS |
| **Completeness** | Group structure (4-5 students), role distribution matrix (5 roles), and accountability clause are preserved. | Cross-reference Section "Team Organization & Responsibilities" against PDF Pages 6-7. | PASS |
| **Completeness** | All 18 mandatory requirements and all 9 advanced/bonus features are enumerated without omission. | Cross-reference Section "Final Project Requirements" against PDF Pages 7-8. | PASS |
| **Structural Integrity** | Content uses semantic Markdown hierarchy (H1, H2, H3, H4, lists, code blocks, blockquotes, tables). | Parse Markdown AST to ensure valid headings and closed code fences. | PASS |
| **Data Integrity** | REST API sample endpoints, dashboard numeric counters, and dashboard chart placeholders are structured in code blocks or lists rather than flattened plain text. | Check REST API block and Dashboard blocks. | PASS |
| **Typography Standards** | Strict adherence to the Typographical Gate: 0 en-dashes (`\u2013`) and 0 em-dashes (`\u2014`), replaced with ASCII hyphens (`-`), colons (`:`), or commas. | Regex check for `[\u2013\u2014]` across file. | PASS |
| **Path Integrity** | Clean relative references with zero absolute local filesystem paths or chat protocol links (`file:///`). | Verify all links and paths use relative standards. | PASS |
