# Usability testing protocol

This document owns how a KAMOTI usability session is run: who is recruited, the
task script, the questionnaire, the tester codes, and the privacy rules for
evidence. Session results, ratings, observations, and findings are recorded in
Section G of the [Phase 4 test report](Phase4_Test_Report.md), which owns them.

Section G of the [Phase 4 instructions](Phase4_Instructions.md) owns the
requirement. The [test environment](TEST_ENVIRONMENT.md) owns the test URL and
the fixture sign-in details a facilitator hands to a tester.

This is a short peer evaluation, not a research study. Three sessions of roughly
twenty minutes each are enough. Keep recruitment, consent, and evidence
proportionate to that.

## Sessions and coverage

Three sessions, each run by one facilitator with one external peer. Between
them they exercise the public board, the Citizen journey on mobile, the Staff
journey on desktop, and the Administrator journey on desktop.

| Session | Tester code | Device | Journeys covered | Tasks |
| :--- | :--- | :--- | :--- | :--- |
| `USE-S1` | `T1` | Mobile phone browser | Public board, Citizen | `USE-01`, `USE-02`, `USE-03`, `USE-04`, `USE-05` |
| `USE-S2` | `T2` | Desktop browser | Public board, Staff | `USE-01`, `USE-02`, `USE-06`, `USE-07` |
| `USE-S3` | `T3` | Desktop browser | Public board, Administrator | `USE-01`, `USE-02`, `USE-08`, `USE-09` |

A tester is identified only by the code `T1`, `T2`, or `T3`. The code is the
only identifier that appears in the report, in evidence filenames, or in any
defect issue. Nothing anywhere maps a code back to a person.

## Before the session

1. Confirm the test site is healthy: `bun run test:smoke`.
2. Reset fixture data if an earlier session moved a report out of `pending`:
   `bun run fixture -- --target YOUR_PROJECT_REF`.
3. Check that the public board has something to look at. It shows only reports
   at `under_review`, `in_progress`, or `resolved` — a `pending` report is not
   on it, and `pending` is not one of its filter options. The fixture leaves one
   report on the board, which is thin for `USE-01` and `USE-02`. Sign in as the
   fixture administrator beforehand and move a second fixture report to
   `under_review` so the board has more than one row. `bun run fixture` restores
   the states afterwards.
4. Before `USE-S3`, check who is in the test project's account list. The
   Administrator tasks put the tester on screens that show every account, and
   the evidence rules below forbid capturing any account that is not a fixture
   account. Either remove the non-fixture accounts from the test project first,
   or run `USE-08` and `USE-09` without capturing the user list. The same
   applies to the staff picker when assigning a report.
5. Open the test URL from [TEST_ENVIRONMENT.md](TEST_ENVIRONMENT.md#non-secret-handoff-record)
   on the tester's device and sign the tester in with the fixture account for
   their session. The tester never uses their own account, email, or phone
   number.
6. Read the consent note below and get a verbal yes before recording anything.

### Consent note to read aloud

> This is a class project. I will ask you to do a few tasks on a test website
> and then rate seven things from 1 to 5. The site holds made-up data only, and
> you will be signed in with a test account, so nothing here is yours. I will
> record the screen and my notes, not you, and you will be referred to only as
> a code. You can skip a task or stop at any time. Please think out loud,
> including when something annoys you — that is the useful part.

## Task script

Read each task as written. Do not explain the interface, and do not help until
the tester asks or gives up. Record the result as `Completed`,
`Completed with difficulty`, or `Not completed`, and note where the tester
hesitated.

If a task turns out to be impossible rather than merely hard — the screen does
not exist, the data is not there, the control does nothing — stop that task,
record `Not completed` with one line saying what was missing, and move to the
next one. Do not coach the tester through it, and do not drop the task from the
record. A task that is impossible is either a defect in the application or a
mistake in this script; both need to be visible afterwards, and neither is the
tester's fault. Tell them so, briefly, and carry on.

| ID | Journey | Task read to the tester |
| :--- | :--- | :--- |
| `USE-01` | Public board | Without signing in, find the reports the community has filed about potholes. |
| `USE-02` | Public board | Narrow the board to reports that are already being worked on, then send me the link to exactly what you are looking at. |
| `USE-03` | Citizen | You filed a report a while ago. Find it and tell me what is happening with it now. |
| `USE-04` | Citizen | Report a new problem: a broken streetlight near where you are. Start the title with `[USABILITY]`. |
| `USE-05` | Citizen | You gave the wrong street. Change the details of the report you just filed, then get back to your list of reports. |
| `USE-06` | Staff | A report has been assigned to you. Open it, record that you inspected the site, and move it forward. |
| `USE-07` | Staff | Find out whether anything else is waiting for you, and get back to the report you just worked on. |
| `USE-08` | Administrator | A report has nobody working on it. Give it to a staff member. |
| `USE-09` | Administrator | Add a new report category for flooding, then show me that the system recorded you doing it. |

### Data the tasks create

`USE-04` creates a report. Its title starts with `[USABILITY]` so the team can
find and delete these afterwards. `USE-06` and `USE-08` move fixture reports
out of `pending`; rerunning `bun run fixture` restores them. Nothing else in
the script writes data.

## Questionnaire

After the tasks, ask for a rating from 1 to 5 on each of the seven items below,
plus an optional comment. A comment is never required, but ask once for any
rating of 3 or lower.

`1 = very poor, 2 = poor, 3 = acceptable, 4 = good, 5 = very good.`

| # | Item | Question as asked |
| :--- | :--- | :--- |
| 1 | Navigation | How easy was it to find your way around and get where you wanted to go? |
| 2 | Readability | How easy was the text to read and understand? |
| 3 | Interface consistency | Did screens look and behave consistently with each other? |
| 4 | Button and link placement | Were buttons and links where you expected them to be? |
| 5 | Error clarity | When something went wrong or was rejected, how clearly did the site tell you what to do? |
| 6 | Mobile responsiveness | How well did the layout fit and work on this screen size? |
| 7 | Overall ease of use | Overall, how easy was the site to use? |

Every session answers all seven items. Item 6 is answered for the screen the
session actually ran on, and the session row records that device, so a desktop
rating is never read as a phone rating.

Close with one open question: *What one thing would you change first?*

## Evidence rules

Usability evidence follows the same rules as the rest of the report: it is kept
in the team's shared evidence folder, referenced from the report's evidence
index by name, and never committed to this repository.

Filenames use the session and task, for example `USE-S1-USE-04-report-form.png`
or `USE-S2-session.mp4`.

Evidence must not contain:

- A tester's name, email address, phone number, face, or voice where their name
  is spoken.
- Any account other than the fixture accounts, or any real report.
- Any password, key, token, or database detail. Capture the screen after
  sign-in, not the sign-in form with the password field filled.

Notes are written straight into Section G in the tester's code. A separate
sheet linking codes to people is not kept, because nothing in this evaluation
needs one.

## Session capture sheet

Copy this block once per session, fill it in during or straight after the
session, and keep only the task lines for that session. It holds everything
Section G of the report needs and nothing else.

```text
Session:        USE-S_   (S1 mobile/Citizen, S2 desktop/Staff, S3 desktop/Admin)
Tester code:    T_
Device/browser:
Date:

TASKS   result = Completed | Completed with difficulty | Not completed
USE-01  Find pothole reports on the public board
        result:
        note:
USE-02  Filter to reports being worked on, share the link
        result:
        note:
USE-03  Find an existing report and read its status        (S1 only)
        result:
        note:
USE-04  Submit a new report, title starting [USABILITY]    (S1 only)
        result:
        note:
USE-05  Edit that pending report, return to the list       (S1 only)
        result:
        note:
USE-06  Open assigned report, add remark, advance status   (S2 only)
        result:
        note:
USE-07  Check the queue, return to the worked report       (S2 only)
        result:
        note:
USE-08  Assign an unassigned report to a staff member      (S3 only)
        result:
        note:
USE-09  Create a category, find it in the activity log     (S3 only)
        result:
        note:

RATINGS  1 = very poor ... 5 = very good. Comment optional; ask once if 3 or lower.
1 Navigation                  _   comment:
2 Readability                 _   comment:
3 Interface consistency       _   comment:
4 Button and link placement   _   comment:
5 Error clarity               _   comment:
6 Mobile responsiveness       _   comment:
7 Overall ease of use         _   comment:

One thing you would change first:

Evidence files captured (names only, kept out of Git):
```

Send the three filled blocks back and they transcribe directly into Section G.

## After the sessions

1. Fill in one session row and one ratings row per session in Section G.
2. Summarize findings that more than one tester hit. Record single-session and
   dissenting observations separately rather than dropping them; a complaint
   only one tester made is still a finding, and a low rating is never averaged
   away.
3. Decide severity for each finding:
   - A finding that stops a tester completing a core journey, or that blocks a
     required Phase 4 deliverable, gets its own linked GitHub defect issue and
     a row in the bug log referencing that issue.
   - Every other finding stays visible as a bug log row with its severity. It
     does not need an issue.
4. Delete the `[USABILITY]` reports from the test environment and rerun
   `bun run fixture` to restore the fixture report states.
