# Phase 4 security and testing report

This is the single report for Phase 4 testing. Sections A through G, the
evidence index, the bug log, the summary metrics, and the peer evaluation are
all recorded here rather than in separate files, so one document can be
submitted and reviewed as a whole.

The [Phase 4 instructions](Phase_Instructions.md#phase-4-security--testing) own what must be tested and
submitted. The [local-development guide](LOCAL_DEV.md#run-and-verify) owns the
test commands and the environment each suite needs. This report owns the test
cases, their results, and the evidence that supports them.

**Status: automated fast, functional, and security integration tests recorded.** Automated
test suites cover Sections A through F (Input Validation, SQL Injection,
Authentication, Authorization, Cross-Site Scripting, and Functional Testing).
Functional tests in Section F exercise production schemas, service helpers, and
domain logic directly rather than local copies. Section G currently contains
the usability protocol and blank result tables only; the three sessions and
their evidence remain outstanding.

## Test case identifiers

Every test case has an identifier of the form `PREFIX-NN`, where the prefix is
the section the case belongs to and `NN` is a two-digit number that is never
reused, even if the case is later dropped.

| Section | Coverage | Prefix |
| :--- | :--- | :--- |
| A | Input validation | `VAL` |
| B | SQL and query injection | `SQLI` |
| C | Authentication | `AUTH` |
| D | Authorization | `AUTHZ` |
| E | Cross-site scripting | `XSS` |
| F | Functional | `FUNC` |
| G | Usability | `USE` |

Bugs use `BUG-NN` in the same way.

One identifier is the only name a case has. It is used by the row in this
report, the evidence filename, any defect that comes out of the case, and the
automated test that covers it, so all four can be matched without guessing.

- **Automated cases.** A case covered by the fast suite or security integration
  suite starts its describe or test name with the identifier. Mark the row
  `Automated` in its Method column.
- **Manual cases.** Anything performed by hand in the browser or against the
  API. Mark the row `Manual` and give it evidence.
- **Evidence filenames.** `PREFIX-NN-short-slug.ext`, for example
  `VAL-04-blank-title-error.png`. One case may have several files: number them
  `VAL-04a`, `VAL-04b`.
- **Usability sessions.** Section G names sessions `USE-S1` to `USE-S3` and the
  tasks in the shared script `USE-01` upward, so a rating, an observation, an
  evidence file, and a defect all point at the same session and task. Evidence
  is named `USE-Sn-USE-NN-short-slug.ext`. The
  [usability testing protocol](Usability_Testing.md) owns both.

### Identifiers already in use

These are allocated by `tests/fast/` and `tests/integration/security.ts`. Do not reuse them.

| Identifier | Case | Where |
| :--- | :--- | :--- |
| `VAL-01` | Contact number rule accepts and rejects documented formats | `tests/fast/validation.test.ts` |
| `VAL-02` | Contact number rule is identical in frontend and API | `tests/fast/validation.test.ts` |
| `VAL-03` | Rejected input returns 400 and names every invalid field | `tests/fast/validation.test.ts` |
| `VAL-04` | Password creation rule enforces 8 to 72 character policy | `tests/fast/validation.test.ts` |
| `VAL-05` | Password rule is identical in frontend and API | `tests/fast/validation.test.ts` |
| `VAL-06` | Report submission schema enforces title, description, bounds | `tests/fast/validation.test.ts` |
| `VAL-07` | User registration schema enforces name, email, password | `tests/fast/validation.test.ts` |
| `VAL-08` | Report edit schema rejects empty modification payload | `tests/fast/validation.test.ts` |
| `VAL-09` | Category schema enforces name length and description limits | `tests/fast/validation.test.ts` |
| `VAL-10` | Live API report creation rejects missing fields with 400 | `tests/integration/security.ts` |
| `SQLI-01` | Search term cannot add or alter PostgREST filter clauses | `tests/fast/query-safety.test.ts` |
| `SQLI-02` | Punctuation-only search terms return null to avoid wildcards | `tests/fast/query-safety.test.ts` |
| `SQLI-03` | Sort parameter allowlist rejects arbitrary column injection | `tests/fast/query-safety.test.ts` |
| `SQLI-04` | Date filter parameters enforce strict ISO date format | `tests/fast/query-safety.test.ts` |
| `SQLI-05` | Pagination parameters enforce integer limits and reject payloads | `tests/fast/query-safety.test.ts` |
| `SQLI-06` | Live search filter payload causes no syntax error or bypass | `tests/integration/security.ts` |
| `SQLI-07` | Live status query parameter injection rejected by enum schema | `tests/integration/security.ts` |
| `SQLI-08` | Live sort query parameter injection rejected by enum schema | `tests/integration/security.ts` |
| `SQLI-09` | Malicious report ID parameter returns 404 without SQL error | `tests/integration/security.ts` |
| `SQLI-10` | Category ID parameter injection rejected by integer coercion | `tests/integration/security.ts` |
| `AUTH-01` | Missing authorization header returns 401 Unauthorized | `tests/fast/auth.test.ts` |
| `AUTH-02` | Expired or invalid token returns 401 with session message | `tests/fast/auth.test.ts` |
| `AUTH-03` | Deactivated user account returns 403 Forbidden | `tests/fast/auth.test.ts` |
| `AUTH-04` | Valid citizen login returns access token and profile | `tests/integration/security.ts` |
| `AUTH-05` | Valid staff login returns access token and profile | `tests/integration/security.ts` |
| `AUTH-06` | Valid administrator login returns access token and profile | `tests/integration/security.ts` |
| `AUTH-07` | Incorrect password returns 401 Unauthorized | `tests/integration/security.ts` |
| `AUTH-08` | Unknown account email returns 401 Unauthorized | `tests/integration/security.ts` |
| `AUTH-09` | Empty login form submission returns 400 Bad Request | `tests/integration/security.ts` |
| `AUTH-10` | Protected route access without session returns 401 | `tests/integration/security.ts` |
| `AUTH-11` | User logout clears session without side effects | `tests/integration/security.ts` |
| `AUTHZ-01` | Role authorization middleware rejects cross-role access | `tests/fast/auth.test.ts` |
| `AUTHZ-02` | Report view authorization restricts Citizen to own report | `tests/fast/permissions.test.ts` |
| `AUTHZ-03` | Report update authorization restricts Staff to assigned report | `tests/fast/permissions.test.ts` |
| `AUTHZ-04` | Citizen pending-only edit rejects editing non-pending reports | `tests/fast/permissions.test.ts` |
| `AUTHZ-05` | Role-correct return navigation routes each role to its view | `tests/fast/permissions.test.ts` |
| `AUTHZ-06` | Live API citizen reads own report detail | `tests/integration/security.ts` |
| `AUTHZ-07` | Live API citizen denied reading another citizen report | `tests/integration/security.ts` |
| `AUTHZ-08` | Live API assigned staff reads assigned report detail | `tests/integration/security.ts` |
| `AUTHZ-09` | Live API unassigned staff denied reading unassigned report | `tests/integration/security.ts` |
| `AUTHZ-10` | Live API administrator reads any report detail | `tests/integration/security.ts` |
| `AUTHZ-11` | Live API citizen denied access to admin user management | `tests/integration/security.ts` |
| `AUTHZ-12` | Live API staff denied access to admin user management | `tests/integration/security.ts` |
| `AUTHZ-13` | Live API citizen edits own pending report | `tests/integration/security.ts` |
| `AUTHZ-14` | Live API citizen denied editing non-pending report | `tests/integration/security.ts` |
| `AUTHZ-15` | Live API non-owning citizen denied editing pending report | `tests/integration/security.ts` |
| `XSS-01` | Report creation stores script and img tags strictly as data | `tests/integration/security.ts` |
| `XSS-02` | Staff remark stores script tags strictly as plain text | `tests/integration/security.ts` |
| `XSS-03` | Admin category update preserves HTML markup as literal text | `tests/integration/security.ts` |
| `XSS-04` | Search query with script payload returns JSON without execution | `tests/integration/security.ts` |
| `FUNC-01` | Report creation and coordinate bounds validation | `tests/fast/functional.test.ts` |
| `FUNC-02` | Linear report status progression across lifecycle states | `tests/fast/functional.test.ts` |
| `FUNC-03` | Status transition enforcement rejects skips and terminal transitions | `tests/fast/functional.test.ts` |
| `FUNC-04` | Citizen pending report editing permission and restriction rules | `tests/fast/functional.test.ts` |
| `FUNC-05` | Citizen report cancellation sets cancelled and removes public display | `tests/fast/functional.test.ts` |
| `FUNC-06` | Staff assignment and update permissions for designated assignees | `tests/fast/functional.test.ts` |
| `FUNC-07` | Staff remark creation records progress note without status change | `tests/fast/functional.test.ts` |
| `FUNC-08` | Public board visibility and PostgREST query filter rules | `tests/fast/functional.test.ts` |
| `FUNC-09` | Administrator analytics aggregation for status and resolution days | `tests/fast/functional.test.ts` |
| `FUNC-10` | Category management lifecycle and active selection filtering | `tests/fast/functional.test.ts` |
| `FUNC-11` | Notification recipient routing and self-notification suppression | `tests/fast/functional.test.ts` |
| `FUNC-12` | Responsive navigation role return targets and home paths | `tests/fast/functional.test.ts` |

## Evidence rules

- Automated Playwright screenshots are committed to `tests/evidence/` and are
  reproduced by `bun run test:browser`. Manual and usability evidence
  (screenshots, recordings, questionnaires) is **not committed**; it is kept in
  the team's shared evidence folder and referenced from the
  [evidence index](#evidence-index) by name and link.
- Every file is named after the case it proves, following the filename rule
  above.
- Evidence uses synthetic accounts and reports only. The safety boundaries in
  the [local-development guide](LOCAL_DEV.md#safety-boundaries) apply to
  evidence as much as to code: no real personal information, no keys, no
  database passwords, and no access tokens visible in a screenshot or
  recording.

## A. Input validation test

| ID | Field or form | Input | Expected result | Actual result | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `VAL-01` | Contact number format | 11 digits starting 09, spaces, separators, invalid prefixes | Accepts 11 digits starting 09; rejects wrong prefix, 10 or 12 digits, letters | Accepted and rejected matching documented patterns | Automated | `tests/fast/validation.test.ts` | `PASS` |
| `VAL-02` | Contact number parity | Shared test table across client and server | Client component and API route validation produce identical acceptance | Identical validation decisions and error message | Automated | `tests/fast/validation.test.ts` | `PASS` |
| `VAL-03` | Schema error details | Malformed payload with empty title and invalid phone | HTTP 400 Bad Request with field-by-field error details array | Returns 400 Bad Request with field details | Automated | `tests/fast/validation.test.ts` | `PASS` |
| `VAL-04` | Password policy length | Passwords outside 8-72 range, 7 chars, 73 chars, empty | Rejects < 8 and > 72 with specific messages; accepts 8 to 72 chars | Enforces exact 8-72 character boundary | Automated | `tests/fast/validation.test.ts` | `PASS` |
| `VAL-05` | Password policy parity | Boundary passwords across client and server | Client validation and API schemas agree on boundary values | Client and server validation produce identical outcomes | Automated | `tests/fast/validation.test.ts` | `PASS` |
| `VAL-06` | Report submission schema | Empty title, short description (< 10 chars), lat/lng out of range | HTTP 400 with field messages; valid report payload passes | Rejects invalid coordinates, title lengths, and short descriptions | Automated | `tests/fast/validation.test.ts` | `PASS` |
| `VAL-07` | User registration schema | Short name (< 2 chars), malformed email addresses, weak passwords | Rejects malformed email, short name, and invalid password | Returns descriptive field messages | Automated | `tests/fast/validation.test.ts` | `PASS` |
| `VAL-08` | Report edit schema | Empty object payload `{}` | Rejects empty modification payload with useful guidance | Returns 400 "Send at least one field to change." | Automated | `tests/fast/validation.test.ts` | `PASS` |
| `VAL-09` | Category schema | Category name < 2 chars, description > 300 chars | Rejects short name and excessive description length | Rejects invalid name and description bounds | Automated | `tests/fast/validation.test.ts` | `PASS` |
| `VAL-10` | Live API report validation | Live HTTP POST `/api/reports` with empty title and description | HTTP 400 Bad Request with field-level error messages | Returns 400 Bad Request with validation details array | Automated | `tests/integration/security.ts` | `PASS` |

## B. SQL injection test

Record how the application keeps a malicious value from being executed as query
text, then the cases that show it.

| ID | Entry point | Payload | Expected result | Actual result | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `SQLI-01` | Search query filter | Filter injection payloads and operators (`or()`, `eq`, quotes) | PostgREST grammar stripped; values kept inside ilike clauses | Injections neutralized; filter grammar preserved | Automated | `tests/fast/query-safety.test.ts` | `PASS` |
| `SQLI-02` | Search filter boundary | Wildcards only (`%`, `***`), quotes, whitespace | Search filter omitted (returns null) rather than querying broad wildcard | Null returned safely; prevents full-table match | Automated | `tests/fast/query-safety.test.ts` | `PASS` |
| `SQLI-03` | Sort parameter allowlist | Malicious column injections (`submitted_at; DROP TABLE`, `id, password`) | Rejected by Zod enum schema; approved options map to known columns | Non-allowlist sorts rejected; valid sorts map cleanly | Automated | `tests/fast/query-safety.test.ts` | `PASS` |
| `SQLI-04` | Date filter parameters | Injection strings in `from` and `to` (`' OR '1'='1`, `UNION SELECT`) | Rejected by ISO date validator (`z.iso.date()`) | Non-ISO strings rejected before database query | Automated | `tests/fast/query-safety.test.ts` | `PASS` |
| `SQLI-05` | Pagination parameters | Negative values, non-integer page numbers, SQL fragments | Rejected or coerced safely; `per_page` capped at route limit | Injections rejected; limits clamped to safe bounds | Automated | `tests/fast/query-safety.test.ts` | `PASS` |
| `SQLI-06` | Live search filter execution | Live `GET /api/public/reports?q=' OR '1'='1` and statement terminators | HTTP 200 with sanitized results; no syntax error or data bypass | Returns 200 with matching reports array; no leakage | Automated | `tests/integration/security.ts` | `PASS` |
| `SQLI-07` | Live status query parameter | Live `GET /api/public/reports?status=' OR 1=1 --` | HTTP 400 Bad Request from Zod enum validation | Rejected with 400 Bad Request | Automated | `tests/integration/security.ts` | `PASS` |
| `SQLI-08` | Live sort query parameter | Live `GET /api/public/reports?sort=submitted_at;SELECT pg_sleep(5)` | HTTP 400 Bad Request from Zod enum validation | Rejected with 400 Bad Request | Automated | `tests/integration/security.ts` | `PASS` |
| `SQLI-09` | Report ID path parameter | Live `GET /api/reports/1' OR '1'='1` | HTTP 404 Not Found without SQL syntax error or 500 error | Returns 404 "That report does not exist." | Automated | `tests/integration/security.ts` | `PASS` |
| `SQLI-10` | Category ID query parameter | Live `GET /api/public/reports?category_id=1;DROP TABLE categories` | HTTP 400 Bad Request from integer coercion failure | Rejected with 400 Bad Request | Automated | `tests/integration/security.ts` | `PASS` |

**How injection is prevented.**
1. **Parameterized Query Builder (PostgREST):** The application interfaces with PostgreSQL exclusively through the Supabase PostgREST client library (`@supabase/supabase-js`). The query builder converts all filter calls (`.eq()`, `.gte()`, `.lte()`, `.or()`, `.order()`) into parameterized queries executed through PostgreSQL prepared statements. User inputs are transmitted as discrete parameters rather than concatenated SQL strings, making SQL command injection impossible.
2. **Strict Zod Schema Boundaries:** All route inputs (query strings, path parameters, and request bodies) are validated against strict Zod schemas before being passed to any database method. Filter parameters such as `status` and `sort` use explicit enum allowlists (`STATUSES`, `PUBLIC_STATUSES`, `SORTS`). Numeric parameters (`page`, `per_page`, `category_id`) use integer coercions that reject SQL payloads. Date filters (`from`, `to`) enforce RFC 3339 / ISO date grammar, preventing SQL injection in temporal clauses.
3. **Grammar Sanitization for PostgREST Filters:** For full-text search where `.or()` is used, user inputs pass through `searchFilter()` in `src/server/lib/query.ts`. This strips PostgREST filter operators and delimiters (`[,.()*%\\:"']`), collapses whitespace, and places the clean term inside parameterized `title.ilike.%term%,description.ilike.%term%` clauses. Inputs containing only punctuation or whitespace resolve to `null`, skipping the filter entirely to avoid matching all rows.
4. **Hardcoded Authorization Scopes:** Citizen and Staff data boundaries (for example `citizen_id = user.id` and `assigned_staff_id = user.id`) are enforced by the server using authenticated session properties (`req.user`), never from user-supplied query parameters.

## C. Authentication test

Cover valid sign-in, wrong password, unknown account, empty submission, sign
out, and reaching a protected page without a session.

| ID | Scenario | Steps | Expected result | Actual result | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUTH-01` | Missing token handling | Send request without Authorization header to protected endpoint | HTTP 401 Unauthorized with "Sign in to continue." message | Returns 401 Unauthorized with sign-in prompt | Automated | `tests/fast/auth.test.ts` | `PASS` |
| `AUTH-02` | Expired or invalid token | Call protected route with expired or invalid bearer token | HTTP 401 Unauthorized with session expired message | Returns 401 with session expired prompt | Automated | `tests/fast/auth.test.ts` | `PASS` |
| `AUTH-03` | Deactivated account | Authenticate with active token for user marked `is_active: false` | HTTP 403 Forbidden with prompt to contact administrator | Returns 403 Forbidden with administrator prompt | Automated | `tests/fast/auth.test.ts` | `PASS` |
| `AUTH-04` | Valid Citizen login | POST `/api/auth/login` with valid Citizen credentials | HTTP 200 with JWT access token, refresh token, and profile | Returns 200, valid token, and Citizen profile | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTH-05` | Valid Staff login | POST `/api/auth/login` with valid Staff credentials | HTTP 200 with JWT access token, refresh token, and profile | Returns 200, valid token, and Staff profile | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTH-06` | Valid Admin login | POST `/api/auth/login` with valid Administrator credentials | HTTP 200 with JWT access token, refresh token, and profile | Returns 200, valid token, and Administrator profile | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTH-07` | Incorrect password | POST `/api/auth/login` with valid email but wrong password | HTTP 401 Unauthorized "That email and password do not match." | Returns 401 Unauthorized with safe mismatch message | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTH-08` | Unknown account | POST `/api/auth/login` with non-existent email address | HTTP 401 Unauthorized "That email and password do not match." | Returns 401 Unauthorized without account enumeration leak | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTH-09` | Empty submission | POST `/api/auth/login` with empty email and password | HTTP 400 Bad Request with field validation errors | Returns 400 Bad Request with field details | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTH-10` | Protected route without session | GET `/api/reports` without Authorization header | HTTP 401 Unauthorized "Sign in to continue." | Returns 401 Unauthorized; data withheld | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTH-11` | Logout flow | POST `/api/auth/logout` with active Authorization token | HTTP 204 No Content; session invalidated locally | Returns 204 No Content; session cleared | Automated | `tests/integration/security.ts` | `PASS` |

## D. Authorization test

Cover each role against the pages and endpoints it should and should not reach.

| ID | Role | Page or endpoint | Expected access | Actual access | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUTHZ-01` | Citizen | Admin endpoint `/api/admin/users` | HTTP 403 Forbidden with allowed roles message | Denied with 403; user session stays active | Automated | `tests/fast/auth.test.ts` | `PASS` |
| `AUTHZ-02` | Citizen | Own report detail vs other citizen report detail | Allowed on own report; HTTP 403 Forbidden on another citizen report | Allowed on own report; denied with 403 on other report | Automated | `tests/fast/permissions.test.ts` | `PASS` |
| `AUTHZ-03` | Staff | Assigned report detail vs unassigned report detail | Allowed on assigned report; HTTP 403 Forbidden on unassigned report | Allowed on assigned report; denied with 403 on unassigned report | Automated | `tests/fast/permissions.test.ts` | `PASS` |
| `AUTHZ-04` | Citizen | Report edit on pending vs non-pending status | Allowed while pending; HTTP 403 Forbidden once under review or resolved | Allowed on pending; denied with 403 on non-pending | Automated | `tests/fast/permissions.test.ts` | `PASS` |
| `AUTHZ-05` | All roles | Return navigation target resolver | Citizen routes to `/my-reports`, Staff to `/staff/queue`, Admin to `/admin/reports` | Returns role-correct destination for each user | Automated | `tests/fast/permissions.test.ts` | `PASS` |
| `AUTHZ-06` | Citizen | Live GET `/api/reports/:id` (own report) | HTTP 200 with full report details | Returns 200 with report object | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTHZ-07` | Citizen | Live GET `/api/reports/:id` (other citizen report) | HTTP 403 Forbidden "You can only view your own reports." | Returns 403 Forbidden; report data withheld | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTHZ-08` | Staff | Live GET `/api/reports/:id` (assigned report) | HTTP 200 with full report details | Returns 200 with report object | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTHZ-09` | Staff | Live GET `/api/reports/:id` (unassigned report) | HTTP 403 Forbidden "You can only view reports assigned to you." | Returns 403 Forbidden; report data withheld | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTHZ-10` | Administrator | Live GET `/api/reports/:id` (any report) | HTTP 200 with full report details regardless of assignment | Returns 200 with report object | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTHZ-11` | Citizen | Live GET `/api/admin/users` | HTTP 403 Forbidden "This action is limited to: admin." | Returns 403 Forbidden; user data withheld | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTHZ-12` | Staff | Live GET `/api/admin/users` | HTTP 403 Forbidden "This action is limited to: admin." | Returns 403 Forbidden; user data withheld | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTHZ-13` | Citizen | Live PATCH `/api/reports/:id` (own pending report) | HTTP 200 with updated report details | Returns 200 with updated report object | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTHZ-14` | Citizen | Live PATCH `/api/reports/:id` (own non-pending report) | HTTP 403 Forbidden "This report is already being handled..." | Returns 403 Forbidden; edits rejected | Automated | `tests/integration/security.ts` | `PASS` |
| `AUTHZ-15` | Citizen | Live PATCH `/api/reports/:id` (other citizen report) | HTTP 403 Forbidden "You can only change your own reports." | Returns 403 Forbidden; edits rejected | Automated | `tests/integration/security.ts` | `PASS` |

## E. Cross-site scripting (XSS) test

| ID | Field | Payload | Expected result | Actual result | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `XSS-01` | Report title & description | `<script>alert('xss-title')</script>` and `<img src=x onerror=alert(1)>` | Stored and returned strictly as literal text data; never executed | Stored and retrieved verbatim as string data | Automated | `tests/integration/security.ts` | `PASS` |
| `XSS-02` | Staff remark details | `<script>alert('staff-remark')</script> Inspected on site.` | Stored verbatim in history updates; returned as plain text | Stored and returned as literal string in JSON | Automated | `tests/integration/security.ts` | `PASS` |
| `XSS-03` | Administrator category input | `Hazardous infrastructure <script>alert(1)</script>` | Saved verbatim as text; returned as literal string in JSON | Preserved as literal data; no markup evaluation | Automated | `tests/integration/security.ts` | `PASS` |
| `XSS-04` | Public search query parameter | `GET /api/public/reports?q=<script>alert('search')</script>` | Sanitized in query builder; returned with `Content-Type: application/json` | Returned as JSON response; no script execution context | Automated | `tests/integration/security.ts` | `PASS` |

**How input is kept as data.**
1. **JSON-Only API Responses:** The Express API does not render HTML or use template engines. All responses are returned with `Content-Type: application/json; charset=utf-8`. Input strings containing `<script>`, `<img>`, or other markup are stored in Postgres text columns and returned as literal JSON strings. The browser's JSON parser treats them strictly as data, precluding HTML interpretation.
2. **React JSX Automatic Encoding:** The web frontend is built using React 19. When rendering dynamic values in JSX `{expression}`, React automatically creates text nodes (`document.createTextNode`) rather than HTML elements. Special characters including `<`, `>`, `&`, `"`, and `'` are automatically encoded as text strings, preventing arbitrary DOM injection.
3. **Absence of Unsafe HTML Invocations:** The entire frontend codebase avoids `dangerouslySetInnerHTML`, `innerHTML`, `document.write()`, and `eval()`. Browser testing confirms that user-entered tags in report titles, descriptions, remarks, and category names remain visible as plain text characters without executing scripts.

## F. Functional test

Cover every core feature named in the [proposal](Final_Project.md).

| ID | Feature | Test procedure | Expected result | Actual result | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `FUNC-01` | Report creation & validation | Submit report using production `createSchema` with valid data, out-of-bounds GPS, invalid title lengths, description bounds, and nullable address | Valid submission accepted; invalid coordinates, title, and description rejected; null and omitted address accepted | Valid data parsed cleanly; invalid values rejected by production schema; nullable address accepted correctly | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-02` | Linear status progression | Advance report sequentially through `pending` -> `under_review` -> `in_progress` -> `resolved` using production `NEXT_STATUS` | Status advances strictly one stage at a time | Lifecycle follows exact progression defined in production `NEXT_STATUS` map | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-03` | Status transition enforcement | Attempt skipping workflow stages or transitioning out of terminal `resolved`/`cancelled` | Stage-skipping rejected; terminal states cannot be transitioned | Disallowed transitions rejected; terminal states stay dead ends | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-04` | Citizen pending report editing | Attempt report editing as owner while pending vs non-pending vs non-owner | Allowed only by owner while status is pending; rejected otherwise | Allowed while pending; throws 403 when non-pending or non-owner | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-05` | Citizen report cancellation | Citizen owner cancels pending report; verify public board visibility and row preservation | Status changes to cancelled; removed from public board; row retained | Status set to cancelled; is_public false; row preserved | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-06` | Staff assignment & authorization | Admin assigns staff to report; verify update permissions for assigned vs unassigned staff | Admin can update any; assigned staff updates assigned; unassigned rejected | Admin & assigned staff allowed; unassigned staff rejected with 403 | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-07` | Staff remark creation | Validate remark input using production `remarkSchema`; verify empty, whitespace, and over-limit submissions rejected | Remark recorded in update history without altering report status | Production `remarkSchema` accepts valid remarks; rejects empty, whitespace-only, and over-500-char submissions | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-08` | Public board visibility & queries | Check reviewed status requirement, search sanitization, sort directions, and date boundary | Only reviewed statuses shown; search safely escaped; sort and date filters valid | Pending/cancelled omitted; PostgREST grammar safely escaped | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-09` | Admin analytics computation | Compute status distribution, category breakdown, and average resolution duration via `calculateAnalytics` | Accurate counts and average duration calculated from submitted/resolved timestamps | Production `calculateAnalytics` aggregations match expected sums; average resolution days correct; empty list returns null | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-10` | Category lifecycle & selection | Validate production `categorySchema` bounds and active vs inactive category filtering | Valid bounds enforced; inactive categories omitted from user selection list | Bounds enforced (2-60 chars name, <= 300 desc) using production schema; inactive categories filtered | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-11` | Notification recipient routing | Route notifications on status update and assignment; suppress actor self-notification via `filterNotificationRecipients` | Citizens and staff notified as appropriate; acting user receives no self-notification | Production `filterNotificationRecipients` targets proper recipients; actor filtered out; undefined userId entries excluded | Automated | `tests/fast/functional.test.ts` | `PASS` |
| `FUNC-12` | Role-based navigation routes and responsive rendering | Check role-based route return destinations and role home paths using production `getReportReturnTarget`; verify nav renders correctly across 375 px (mobile), 768 px (tablet), and 1280 px (desktop) viewports via Playwright | Role-appropriate workspaces and return paths resolved; nav renders at all tested breakpoints | Correct paths returned for each role; Playwright confirms layout renders at mobile, tablet, and desktop viewports | Automated (fast suite + browser) | `tests/fast/functional.test.ts`, `tests/browser/responsive.browser.ts`, `tests/evidence/FUNC-12-*.png` | `PASS` |

## G. Usability test

Three sessions with external peers on the deployed test site, using fixture
accounts and a fixed task script so the feedback is comparable. The
[usability testing protocol](Usability_Testing.md) owns the script, the
questionnaire, the tester codes, and the evidence rules. This section owns the
results.

**Status: sessions not yet run.** The rows below are filled in as each session
completes.

### Sessions

| Session | Tester | Device and browser | Journeys covered | Date | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `USE-S1` | `T1` | Mobile phone browser | Public board, Citizen |  |  |
| `USE-S2` | `T2` | Desktop browser | Public board, Staff |  |  |
| `USE-S3` | `T3` | Desktop browser | Public board, Administrator |  |  |

### Task completion

Result is `Completed`, `Completed with difficulty`, or `Not completed`.

| Session | ID | Task | Result | Observation | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `USE-S1` | `USE-01` | Find pothole reports on the public board |  |  |  |
| `USE-S1` | `USE-02` | Filter to In progress reports and share the link |  |  |  |
| `USE-S1` | `USE-03` | Find an existing report and read its current status |  |  |  |
| `USE-S1` | `USE-04` | Submit a new report from a phone |  |  |  |
| `USE-S1` | `USE-05` | Edit the pending report, then return to the report list |  |  |  |
| `USE-S2` | `USE-01` | Find pothole reports on the public board |  |  |  |
| `USE-S2` | `USE-02` | Filter to In progress reports and share the link |  |  |  |
| `USE-S2` | `USE-06` | Open an assigned report, add a remark, advance its status |  |  |  |
| `USE-S2` | `USE-07` | Check the queue and return to the worked report |  |  |  |
| `USE-S3` | `USE-01` | Find pothole reports on the public board |  |  |  |
| `USE-S3` | `USE-02` | Filter to In progress reports and share the link |  |  |  |
| `USE-S3` | `USE-08` | Assign the unassigned fixture drainage report |  |  |  |
| `USE-S3` | `USE-09` | Create the run-specific category and find its activity log |  |  |  |

### Ratings

Each item is rated 1 to 5, where `1 = very poor` and `5 = very good`. A comment
is optional. Ratings are reported per tester and never averaged into a single
score, so a low rating stays visible.

| # | Item | `T1` mobile | `T2` desktop | `T3` desktop | Comments |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Navigation |  |  |  |  |
| 2 | Readability |  |  |  |  |
| 3 | Interface consistency |  |  |  |  |
| 4 | Button and link placement |  |  |  |  |
| 5 | Error clarity |  |  |  |  |
| 6 | Mobile responsiveness |  |  |  |  |
| 7 | Overall ease of use |  |  |  |  |
|  | One thing to change first |  |  |  |  |

Item 6 is rated for the screen each session actually ran on. The device column
is part of the rating, so a desktop answer is not read as a phone answer.

### Findings

Findings raised by more than one tester:

| Finding | Sessions | Severity | Disposition |
| :--- | :--- | :--- | :--- |
|  |  |  |  |

Findings raised by one tester, and any answer that disagreed with the others:

| Finding | Session | Severity | Disposition |
| :--- | :--- | :--- | :--- |
|  |  |  |  |

A finding that stops a tester completing a core journey, or that blocks a
required Phase 4 deliverable, gets its own linked GitHub defect issue, and its
bug log row links that issue. Every other finding stays visible as a bug log
row with its severity and needs no issue. Nothing is dropped for being raised
only once.

## Evidence index

One row per evidence file. Automated Playwright screenshots are committed to `tests/evidence/` and are reproduced by running `bun run test:browser`. Manual screenshots (if any) are stored outside the repository.

**Where the screenshots were captured.** `playwright.config.ts` reads the target
from `PLAYWRIGHT_BASE_URL`, and its default changed in `f579ee0`:

| Screenshot set | Captured against | Reproduce with |
| :--- | :--- | :--- |
| `AUTH-05`, `AUTH-07`, `AUTH-08`, `AUTH-10`, `AUTH-11`, `FUNC-12-mobile-nav` (committed 21 September in `c6b3700`) | Deployed site `https://kamoti-chi.vercel.app` | `PLAYWRIGHT_BASE_URL=https://kamoti-chi.vercel.app bun run test:browser` |
| Every other file in `tests/evidence/` (committed 27 September) | Local server `http://localhost:5173` from `bun run dev`, using the same test Supabase project | `bun run dev`, then `bun run test:browser` |

**Expected duplicates.** Three pairs are byte-identical because both tests end on
the same screen. This is not missing evidence:

| Files | Shared screen |
| :--- | :--- |
| `AUTH-10-protected-redirect.png`, `AUTH-11-logout.png` | The signed-out `/signin` page |
| `FUNC-09-admin-analytics.png`, `ADMIN-header-desktop.png` | The admin dashboard at `/admin` |
| `FUNC-08-public-board.png`, `FUNC-12-desktop-board.png` | The public board at desktop width |

| Evidence name | Case ID | Type | Location |
| :--- | :--- | :--- | :--- |
| `VAL-01-to-09-fast-suite.log` | `VAL-01` to `VAL-09` | Test Execution Log | Automated test output from `bun run test` |
| `VAL-10-api-validation.log` | `VAL-10` | Test Execution Log | Automated test output from `bun run test:security` |
| `SQLI-01-to-05-query-safety.log` | `SQLI-01` to `SQLI-05` | Test Execution Log | Automated test output from `tests/fast/query-safety.test.ts` |
| `SQLI-06-to-10-live-injection.log` | `SQLI-06` to `SQLI-10` | Test Execution Log | Automated test output from `tests/integration/security.ts` |
| `AUTH-01-to-03-fast-auth.log` | `AUTH-01` to `AUTH-03` | Test Execution Log | Automated test output from `tests/fast/auth.test.ts` |
| `AUTH-04-to-11-live-auth.log` | `AUTH-04` to `AUTH-11` | Test Execution Log | Automated test output from `tests/integration/security.ts` |
| `AUTHZ-01-to-05-fast-authz.log` | `AUTHZ-01` to `AUTHZ-05` | Test Execution Log | Automated test output from `tests/fast/permissions.test.ts` |
| `AUTHZ-06-to-15-live-authz.log` | `AUTHZ-06` to `AUTHZ-15` | Test Execution Log | Automated test output from `tests/integration/security.ts` |
| `XSS-01-to-04-live-xss.log` | `XSS-01` to `XSS-04` | Test Execution Log | Automated test output from `tests/integration/security.ts` |
| `FUNC-01-to-12-functional-suite.log` | `FUNC-01` to `FUNC-12` | Test Execution Log | Automated test output from `tests/fast/functional.test.ts` |
| `AUTH-04-citizen-login.png` | `AUTH-04` | Browser Screenshot | `tests/evidence/` (committed; run `bun run test:browser` to regenerate) |
| `AUTH-05-staff-login.png` | `AUTH-05` | Browser Screenshot | `tests/evidence/` |
| `AUTH-06-admin-login.png` | `AUTH-06` | Browser Screenshot | `tests/evidence/` |
| `AUTH-07-invalid-password.png` | `AUTH-07` | Browser Screenshot | `tests/evidence/` |
| `AUTH-08-unknown-email.png` | `AUTH-08` | Browser Screenshot | `tests/evidence/` |
| `AUTH-09-empty-form.png` | `AUTH-09` | Browser Screenshot | `tests/evidence/` |
| `AUTH-10-protected-redirect.png` | `AUTH-10` | Browser Screenshot | `tests/evidence/` |
| `AUTH-11-logout.png` | `AUTH-11` | Browser Screenshot | `tests/evidence/` |
| `FUNC-01a-report-create.png` | `FUNC-01` | Browser Screenshot | `tests/evidence/` |
| `FUNC-01b-coordinate-error.png` | `FUNC-01` | Browser Screenshot | `tests/evidence/` |
| `FUNC-02-status-progression.png` | `FUNC-02` | Browser Screenshot | `tests/evidence/` |
| `FUNC-04-edit-pending.png` | `FUNC-04` | Browser Screenshot | `tests/evidence/` |
| `FUNC-05-cancelled-report.png` | `FUNC-05` | Browser Screenshot | `tests/evidence/` |
| `FUNC-07-staff-remark.png` | `FUNC-07` | Browser Screenshot | `tests/evidence/` |
| `FUNC-08-public-board.png` | `FUNC-08` | Browser Screenshot | `tests/evidence/` |
| `FUNC-09-admin-analytics.png` | `FUNC-09` | Browser Screenshot | `tests/evidence/` |
| `FUNC-10-category-management.png` | `FUNC-10` | Browser Screenshot | `tests/evidence/` |
| `FUNC-12-mobile-nav.png` | `FUNC-12` | Browser Screenshot | `tests/evidence/` |
| `FUNC-12-tablet-board.png` | `FUNC-12` | Browser Screenshot | `tests/evidence/` |
| `FUNC-12-desktop-board.png` | `FUNC-12` | Browser Screenshot | `tests/evidence/` |

## Bug and issue log

| ID | Bug or issue | Found by case | Description | Severity | Action taken | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `BUG-01` | Category name bound mismatch in functional test | `FUNC-10` | `functional.test.ts` declared a local schema capping category names at 50 chars, but production `categorySchema` in `categories.routes.ts` allows 60 chars. Test was silently rejecting valid 51-60 char names. | Low | Refactored `functional.test.ts` to import and test against the canonical production `categorySchema` directly; updated `FUNC-10` actual result in this report | Fixed |
|  | None (security) | N/A | Security testing revealed no blocking vulnerabilities in the completed baseline | Low | Security test suites added to prevent regressions | Fixed |

Severity is `Critical`, `High`, `Medium`, or `Low`. Status is `Open`,
`Fixed`, or `Won't fix` with a reason. A bug that is fixed in code links the
pull request that fixed it.

## Testing summary

| Metric | Count |
| :--- | :--- |
| Total test cases | 65 |
| Passed | 62 |
| Failed | 0 |
| Not run | 3 |
| Fixed | 1 |
| Remaining issues | 3 |

The 65 cases are the 62 documented cases in Sections A to F plus the three
usability sessions `USE-S1` to `USE-S3`. All 62 documented cases pass. The three
sessions have not been run (see [Section G](#g-usability-test)), so they are
counted as not run and as the remaining issues, not as passed.

## Peer evaluation and contributions

Compiled by the team leader or assistant leader.

| Member | Role | Contributions | Rating |
| :--- | :--- | :--- | :--- |
|  |  |  |  |
