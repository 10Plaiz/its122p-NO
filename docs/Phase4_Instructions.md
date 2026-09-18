# Phase 4: Required Student Submission

## 1. Testing Requirements

| No. | Requirement | Description |
| :--- | :--- | :--- |
| **1** | **Input Validation** | Evidence that forms and user inputs are properly validated. Include screenshots of invalid inputs and corresponding error messages. |
| **2** | **SQL Injection Testing** | Test results demonstrating that input fields are protected against common SQL injection attempts. Include test inputs, expected results, actual results, and screenshot evidence. |
| **3** | **Authentication Testing** | Test login/logout flows, incorrect credentials, password complexity requirements, session handling, and attempts to access protected routes. |
| **4** | **Authorization Testing** | Evidence that users can only access functions and pages appropriate to their role. Test attempts to access restricted pages or functions. |
| **5** | **XSS Testing** | Test input fields against basic Cross-Site Scripting (XSS) payloads to verify that scripts are not executed or stored unsafely. |
| **6** | **Functional Testing** | Test all major features of the system and document whether each feature passed or failed. |
| **7** | **Usability Testing** | Have users/testers evaluate the system and record feedback regarding ease of use, navigation, readability, and overall user experience. |

---

## 2. Deliverables (What Students Should Submit)

### 1. Security & Testing Report
A formal report covering the following sections:

#### A. Input Validation Test
| Test Case | Input | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| Empty required field | Blank | Error message displayed | Error displayed | `PASS` |
| Invalid email | `abc` | Invalid email message | Message displayed | `PASS` |

#### B. SQL Injection Test
* Document the specific SQL injection test cases performed and the application's responses.
* Detail how the application verifies that malicious SQL statements are not executed (e.g., prepared statements, parameterized queries, ORM/query builder escaping).

#### C. Authentication Test
Document test cases covering:
* Valid user login
* Invalid username / password combinations
* Empty login form submission
* User logout flow
* Attempt to access protected pages without an active session

#### D. Authorization Test
Document access control across different user roles (e.g., Admin vs Regular User).

*Example Table:*
| User Role | Page / Feature | Expected Access | Actual Access | Status |
| :--- | :--- | :--- | :--- | :--- |
| Admin | Manage Users | Allowed | Allowed | `PASS` |
| Regular User | Manage Users | Denied | Denied | `PASS` |

#### E. Cross-Site Scripting (XSS) Test
* Document the inputs and forms tested with basic XSS payloads.
* Verify and explain how the application treats user inputs strictly as data rather than executable code (e.g., HTML entity encoding, sanitization).

#### F. Functional Testing
Create a test case table covering all core project features:

| Feature | Test Procedure | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| Login | Enter valid credentials | User is logged in | User logged in | `PASS` |
| Search | Enter keyword | Matching results appear | Results appear | `PASS` |
| Add Record | Submit valid form | Record is saved | Record saved | `PASS` |

#### G. Usability Testing
Have external testers or peers interact with the application and document feedback on:
* Ease of navigation
* Text legibility and readability
* Interface design and consistency
* Button and link placement
* Error message clarity
* Mobile responsiveness
* Overall ease of use

---

### 2. Test Evidence & Screenshots
Provide structured screenshots or recorded evidence demonstrating:
* Successful and failed input validation states
* Authentication workflows
* Authorization and access restriction screens (e.g., 403 Forbidden or redirects)
* Security testing results (SQL injection and XSS attempts)
* Functional test execution
* Usability testing sessions
* Any bugs discovered and subsequent corrections

---

### 3. Bug / Issue Log
Document all bugs, defects, and layout issues encountered during testing:

| Bug / Issue | Description | Severity | Action Taken | Status |
| :--- | :--- | :--- | :--- | :--- |
| Login error | Valid user could not log in | High | Fixed authentication logic | Resolved |
| Mobile layout | Button was cut off on mobile | Medium | Updated CSS | Resolved |

---

### 4. Final Working Project
Submit the updated source code repository and project directory containing all fixes implemented during testing. Verify that:
* All major features work as intended.
* Security issues identified during testing are mitigated.
* All form inputs are validated.
* Unauthorized users cannot access restricted functions or endpoints.
* The application has no unresolved critical or blocking bugs.

---

### 5. Testing Summary
Include an executive summary metric table at the end of the report:

| Metric | Count |
| :--- | :--- |
| **Total Test Cases** | ___ |
| **Passed** | ___ |
| **Failed** | ___ |
| **Fixed** | ___ |
| **Remaining Issues** | ___ |

---

### 6. Peer Evaluation
* Member ratings and contributions (coordinated by team leader or assistant leader).

---

## 3. Suggested Phase 4 Submission Checklist

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