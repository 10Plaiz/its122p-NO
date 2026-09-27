# Phase 3 and Phase 4 instructions

> **Archived handouts.** Both phases' instructions are preserved below exactly as
> issued, because the test report and the usability protocol cite their sections
> (for example "Section G"). Read them with three notes:
>
> - **Stack:** a later instructor clarification lets the team choose its stack.
>   Wording that assumes plain HTML, CSS and SQL does not restrict KAMOTI's
>   React, Express and Supabase stack. See the [course guide](Guide.md).
> - **Phase 3 is submitted.** Its frozen API submission is
>   [API documentation](API_Documentation.md).
> - **Phase 4 is tracked** in the [Phase 4 test report](Phase4_Test_Report.md) and
>   the [usability testing protocol](Usability_Testing.md). They record what has
>   been done; this page only records what was asked.

- [Phase 3: Frontend + API](#phase-3-frontend--api)
- [Phase 4: Security + Testing](#phase-4-security--testing)

---

## Phase 3: Frontend + API

### 1. Technical Requirements

| No. | Requirement | Description |
| :--- | :--- | :--- |
| **1** | **Responsive Interface** | A working website that adapts properly to desktop, tablet, and mobile screen sizes. |
| **2** | **JavaScript Functionality** | JavaScript files demonstrating interactive features such as buttons, dynamic content, calculations, modals, navigation, etc. |
| **3** | **API Integration** | A working API connection. Students should demonstrate how their website requests, receives, and uses data from an API. |
| **4** | **AJAX / Fetch** | Working `fetch()` or AJAX implementation for retrieving and submitting data without reloading the entire page. |
| **5** | **Form Validation** | Forms with appropriate validation for required fields, valid formats, input restrictions, and error messages. |
| **6** | **Search / Filter** | A functional search and/or filtering feature that allows users to find or display specific information dynamically. |

### 2. Deliverables (What Students Should Submit)

#### 1. Complete Project Folder
The submitted repository or directory must contain:
* HTML files
* CSS files
* JavaScript files
* Images and static assets
* API-related files
* Other necessary project files

#### 2. Working Website
* The project should run properly.
* All pages and links must be functional.
* All required Phase 3 features must be demonstrated.

#### 3. API Documentation / Notes
A concise document containing:
* **API Used:** Name and service provider of the API.
* **API Purpose:** Function of the API in the project.
* **API Endpoint(s):** Specific endpoints queried.
* **Data Retrieved:** Data fields and response structure retrieved from the API.
* **Integration Details:** How the API is integrated and consumed within the website.

#### 4. Screenshots
Include screenshots showing major features, specifically:
* Desktop and mobile responsive layouts
* API-generated content and data renders
* Form validation states and error messages
* Search and filter results

#### 5. Peer Evaluation
* Member ratings and contributions (coordinated by team leader or assistant leader).

### 3. Suggested Submission Checklist

Use this checklist before final submission:

- [ ] Responsive interface works on different screen sizes (desktop, tablet, mobile)
- [ ] JavaScript features are functional and interactive
- [ ] API is successfully connected and operational
- [ ] AJAX / Fetch is implemented for dynamic updates
- [ ] Form validation works correctly with error messages
- [ ] Search and filter works correctly
- [ ] All pages and navigation links work without broken links
- [ ] No broken images or missing asset files
- [ ] Project folder is complete and organized
- [ ] API documentation is included
- [ ] Screenshots of core features are included
- [ ] Member ratings and contributions are compiled
- [ ] Project is verified and ready for presentation/checking

---

## Phase 4: Security + Testing

### 1. Testing Requirements

| No. | Requirement | Description |
| :--- | :--- | :--- |
| **1** | **Input Validation** | Evidence that forms and user inputs are properly validated. Include screenshots of invalid inputs and corresponding error messages. |
| **2** | **SQL Injection Testing** | Test results demonstrating that input fields are protected against common SQL injection attempts. Include test inputs, expected results, actual results, and screenshot evidence. |
| **3** | **Authentication Testing** | Test login/logout flows, incorrect credentials, password complexity requirements, session handling, and attempts to access protected routes. |
| **4** | **Authorization Testing** | Evidence that users can only access functions and pages appropriate to their role. Test attempts to access restricted pages or functions. |
| **5** | **XSS Testing** | Test input fields against basic Cross-Site Scripting (XSS) payloads to verify that scripts are not executed or stored unsafely. |
| **6** | **Functional Testing** | Test all major features of the system and document whether each feature passed or failed. |
| **7** | **Usability Testing** | Have users/testers evaluate the system and record feedback regarding ease of use, navigation, readability, and overall user experience. |

### 2. Deliverables (What Students Should Submit)

#### 1. Security & Testing Report
A formal report covering the following sections:

##### A. Input Validation Test
| Test Case | Input | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| Empty required field | Blank | Error message displayed | Error displayed | `PASS` |
| Invalid email | `abc` | Invalid email message | Message displayed | `PASS` |

##### B. SQL Injection Test
* Document the specific SQL injection test cases performed and the application's responses.
* Detail how the application verifies that malicious SQL statements are not executed (e.g., prepared statements, parameterized queries, ORM/query builder escaping).

##### C. Authentication Test
Document test cases covering:
* Valid user login
* Invalid username / password combinations
* Empty login form submission
* User logout flow
* Attempt to access protected pages without an active session

##### D. Authorization Test
Document access control across different user roles (e.g., Admin vs Regular User).

*Example Table:*
| User Role | Page / Feature | Expected Access | Actual Access | Status |
| :--- | :--- | :--- | :--- | :--- |
| Admin | Manage Users | Allowed | Allowed | `PASS` |
| Regular User | Manage Users | Denied | Denied | `PASS` |

##### E. Cross-Site Scripting (XSS) Test
* Document the inputs and forms tested with basic XSS payloads.
* Verify and explain how the application treats user inputs strictly as data rather than executable code (e.g., HTML entity encoding, sanitization).

##### F. Functional Testing
Create a test case table covering all core project features:

| Feature | Test Procedure | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| Login | Enter valid credentials | User is logged in | User logged in | `PASS` |
| Search | Enter keyword | Matching results appear | Results appear | `PASS` |
| Add Record | Submit valid form | Record is saved | Record saved | `PASS` |

##### G. Usability Testing
Have external testers or peers interact with the application and document feedback on:
* Ease of navigation
* Text legibility and readability
* Interface design and consistency
* Button and link placement
* Error message clarity
* Mobile responsiveness
* Overall ease of use

#### 2. Test Evidence & Screenshots
Provide structured screenshots or recorded evidence demonstrating:
* Successful and failed input validation states
* Authentication workflows
* Authorization and access restriction screens (e.g., 403 Forbidden or redirects)
* Security testing results (SQL injection and XSS attempts)
* Functional test execution
* Usability testing sessions
* Any bugs discovered and subsequent corrections

#### 3. Bug / Issue Log
Document all bugs, defects, and layout issues encountered during testing:

| Bug / Issue | Description | Severity | Action Taken | Status |
| :--- | :--- | :--- | :--- | :--- |
| Login error | Valid user could not log in | High | Fixed authentication logic | Resolved |
| Mobile layout | Button was cut off on mobile | Medium | Updated CSS | Resolved |

#### 4. Final Working Project
Submit the updated source code repository and project directory containing all fixes implemented during testing. Verify that:
* All major features work as intended.
* Security issues identified during testing are mitigated.
* All form inputs are validated.
* Unauthorized users cannot access restricted functions or endpoints.
* The application has no unresolved critical or blocking bugs.

#### 5. Testing Summary
Include an executive summary metric table at the end of the report:

| Metric | Count |
| :--- | :--- |
| **Total Test Cases** | ___ |
| **Passed** | ___ |
| **Failed** | ___ |
| **Fixed** | ___ |
| **Remaining Issues** | ___ |

#### 6. Peer Evaluation
* Member ratings and contributions (coordinated by team leader or assistant leader).

### 3. Suggested Phase 4 Submission Checklist

Use this checklist to verify that all Phase 4 requirements are fulfilled before submitting:

- [ ] Input validation tested and documented
- [ ] SQL injection testing performed and documented
- [ ] Authentication workflows tested (valid, invalid, logout, protected routes)
- [ ] Role-based authorization tested and documented
- [ ] XSS testing performed and documented
- [ ] Functional test cases completed for all core features
- [ ] Usability testing conducted and feedback recorded
- [ ] Test cases documented in standard tabular format
- [ ] Screenshots and test evidence organized and attached
- [ ] Bug and issue log updated with severity and resolution status
- [ ] Fixes implemented for discovered defects
- [ ] Updated project source code prepared and submitted
- [ ] Final testing summary metrics completed
- [ ] Member ratings and contribution sheet compiled
