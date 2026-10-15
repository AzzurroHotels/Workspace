# Azzurro Workspace — audit and implementation

Reviewed 15 October 2026. Repository: https://github.com/AzzurroHotels/Workspace

Baseline commit: `866e482b478d9dbcf4faffa8529e750830e68767`.
Local branch: `enhance/workspace-ui`. Desktop is the primary design target, following the user's clarification.

## Release decision

On 15 October the user deferred email authentication and requested normal entry for the live rollout. The frontend now explicitly retains name-based shared access; Users and authenticated role restrictions remain deferred. The shared_trackers migration adds tracker persistence and server timestamps without rewriting existing data. The security findings below remain applicable until staff sign-in is activated. See RELEASE.md for current steps.

## Result

Implemented a desktop-first paper design with cream surfaces, dark ink, red controls and self-hosted typography, status-specific colors, improved navigation and forms, and fixes to task visibility, editing, persistence, refresh behavior, and REST concurrency handling. Prepared on `enhance/workspace-ui`; the additive shared tracker/timestamp migration has now been applied, with every original row fingerprint preserved. See RELEASE.md for current release status.

Supabase access was granted after the initial denial. The backend schema, permissions, triggers, advisors and targeted logs have now been inspected read-only. Staff sign-in, an Admin/Viewer Users tab and a database migration are implemented and tested locally. The live site still has the original application and permissive policies. No production task/member/history rows were changed by the migration, and no sign-in email has been sent. The staff-only migrations remain deferred.

## Fixed findings

| Priority | Finding in baseline | Change and evidence |
| --- | --- | --- |
| High | A successful save followed by a failed reload was caught as `Not saved`, inviting duplicate retries. | Separate write and reload phases; retain confirmed changes, explain that refresh is needed, block further edits until reconnect. Mocked browser failure/recovery passes. |
| High | Retrying creation after a committed request lost its response could generate a second record. | Retain a stable draft ID and reuse a record found during recovery. Browser test confirms a retry sends no second insert. |
| High | Updates and deletes used only record IDs; concurrent changes to edited fields could be silently overwritten. | Compare the original database values for changed fields; guard deletes against all writable record fields. Empty update/delete responses produce a conflict. Adapter tests cover this and related cases. |
| Medium | Member removal performs several writes; a failure can commit only some of them. | Use one guarded member DELETE. The existing ON DELETE SET NULL foreign key unassigns tasks atomically, preserving concurrent reassignment. General multi-record saves still report partial failures. |
| Medium | All-tasks view excluded completed tasks; a completed task with no assignee had no board tab through which to find it. | Explicit active/all/completed/overdue scopes and an Unassigned tab. Tested completed unassigned tasks and matching exports. |
| Medium | Periodic refresh replaced the content and could interrupt searching or keyboard use. | Skip refresh during editing, dialogs, hidden pages, and focused content controls; avoid rendering unchanged data. Tested preservation of draft/search. |
| Medium | Mobile CSS hid the generic `.label` class, removing all four metric labels. | Dedicated metric and navigation classes. All labels visible at every tested width. |
| Medium | Board required sideways scrolling and the list required a 740px table on phones. | Preserve four desktop columns from 1280px; use two columns on medium widths, one on phones, and labelled mobile table rows. No page-level overflow at seven tested widths. |
| Medium | Browser storage failures could throw during startup or saving; cached data was not shape-checked. | Guard storage access, validate the cache, retain corrupt originals, and roll back unsaved changes with an explicit message. Browser quota-failure test passes. |
| Medium | Role/priority and some identifier values were interpolated without consistent escaping. | Escape user/database text and attributes; allow only known role/status/priority CSS classes. Injection fixture test passes. |
| Medium | A second task save after saving a note could overwrite other fields reloaded from the server. | Apply only fields changed from the original editor snapshot; retain unsaved form text across note saves. |
| Medium | The REST paginator assumed any response shorter than 500 rows was the final page. | Advance by the actual returned row count until an empty page; detect duplicate IDs during an unstable page sequence. Tested with a one-row server cap. |
| Low | Header showed a fixed `AR` avatar, member screen was blank when empty, and dashboard ignored overdue work. | Actual visitor initials; member onboarding empty state; overdue alert and filtered-board shortcut. |
| Low | No URL navigation state, incomplete dialog labelling, inconsistent keyboard focus, and low-contrast muted text. | Hash navigation, Back/Forward, dialog names, visible focus rings, skip link, labelled status controls, semantic task buttons, stronger text contrast. Manual visual checks and browser interactions completed; no blanket accessibility-compliance claim. |
| Low | No repeatable development/test instructions or automated checks. | Loopback-only preview server, Node tests, fixture-based browser suite, README, and read-only database audit queries. |

## Visual direction and flow review

1. **Entry — working locally:** the explicitly configured shared-name mode retains normal entry for this release. The prepared staff mode requires a verified email-link session and approved membership. Missing configuration fails closed. Only a deliberate loopback design preview uses fixed fictional identity; a preview flag on a public host cannot enable it.
2. **Dashboard — working:** four softly colored metrics, upcoming deadlines, overdue shortcut, and a readable calendar. Long calendar labels truncate visually but remain named buttons with full titles; day counts reveal all tasks on phones.
3. **Task boards — working:** paper navigation, red actions, ochre/blue/lilac/sage status columns, four-column desktop layout, direct status selection, notes, and readable list view. All filters use the same task selection as export.
4. **Task editing — working:** spacious 640px desktop dialog, two-column metadata fields, separate note save, update history, validation, deletion confirmation, and error recovery.
5. **Trackers — working:** names and links become document-type tiles; real anchors open in a new tab with noopener/noreferrer. Admin CRUD and Viewer link access are enforced in the UI and database. Unsafe protocols and embedded credentials are rejected; stored text is escaped. Search and document-type filters are included.
6. **Sidebar — working:** Hide sidebar above the wordmark expands content to full width; Show sidebar remains accessible in the header and the preference survives reload.
7. **Team members — working:** role colors, task shortcut, editing/removal, and an empty state. Removing a member keeps tasks unassigned.

Screenshots in the accompanying outputs folder use fictional test data: `desktop-dashboard.png`, `desktop-board.png`, `desktop-list.png`, `desktop-members.png`, and `mobile-board.png`. Baseline screenshots were captured from the original Git files. No screenshots contain production task content.

The paper design follows the public [Komi](https://komistore.app/) reference without copying its assets. Two project-local [Anthropic skills](https://github.com/anthropics/skills), frontend-design and webapp-testing, were installed before implementation. See DESIGN.md. Additional screenshots show Trackers, expanded content, Users and sign-in.

## Verified backend audit

The project is Workspace, ref iunkhgyoujdxybufjcgo, region ap-northeast-2, PostgreSQL 17.11. At inspection it held 37 tasks, 4 members, 183 activity rows and no Auth users. Counts can change. No production task contents appear in screenshots or this report.

**Critical: public write access.** All three tables have RLS enabled, but board_members and board_tasks have an ALL policy for anon with USING(true) and WITH CHECK(true). The browser roles also have unnecessary privileges including TRUNCATE. The staged migration revokes anonymous access, narrows table grants, allows approved Admin/Viewer accounts to read, and permits only Admin to edit tasks/members. The live database remains permissive until release.

**High: impersonable audit identity.** The existing SECURITY DEFINER activity trigger trusts the client x-board-actor header. The replacement derives user ID/email from verified Auth identity and display name from admin-managed membership. Legacy activity remains unchanged. Malformed header decoding is removed. Browser/PUBLIC function EXECUTE is revoked; isolated PostgreSQL tests confirm normal triggers still work.

**Confirmed existing integrity.** The database enforces task statuses/priorities, title/member-name limits, member role labels, and an ON DELETE SET NULL task-member foreign key. Task/member AFTER triggers append activity. No orphan assignments, descriptions over 10,000 characters, notes over 3,000 characters, or notes missing timestamps were found. The migration adds those description/note limits and server-generated note timestamps.

**User access.** The migration seeds vivekalthi@gmail.com as the initial Admin. The new Users tab supports adding, editing and removing approved emails with Admin or Viewer access. Adding access does not send an invitation or create an Auth account directly. The prepared Before User Created hook rejects unapproved first-time accounts when enabled in Supabase. On first approved sign-in, Supabase creates the Auth account; the approved email still controls all workspace access. Admin/Dev/ProB member labels remain separate from sign-in permissions.

Private policy helpers join the current Auth user to the approved email and require email confirmation. New Auth accounts alone have no data access. Revocation and role changes apply to database requests without waiting for old JWT role claims to expire. Access mutations are serialized through a private guard row, and self-demotion/removal and removal of the last administrator are rejected. Viewers cannot edit, create users, or elevate their own role. User-access audit entries are visible only to Admin; task/member/tracker history remains visible to staff. Trackers use the same verified-member read and admin-only write policies, with guarded updates/deletes and audited server identity.

**Advisors and logs.** Security advisors reported [anonymous](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) execution privileges on the trigger function. This is an ACL finding, not proof of a usable trigger RPC exploit. The migration removes those privileges. An activity index was reported [unused](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index); it is preserved because an observation window does not establish that it is unnecessary. Targeted last-24-hour log queries returned no matching REST HTTP 400+ responses or PostgreSQL ERROR/FATAL/PANIC entries; this is not a claim that all services or prior periods are error-free. No tracked migrations or Edge Functions were present.

Public Auth settings confirm email sign-in and signup are enabled, with email confirmation required. SMTP and the live Site URL/redirect settings are not yet verified: the browser connection dropped during inspection, and the user reports SMTP is not configured or is uncertain. General staff email delivery requires [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Verification

- JavaScript syntax and browser SDK build pass.
- 31 Node test results pass: 13 REST-adapter cases, plus the isolated PostgreSQL migration suite and its 17 permission/integrity cases.
- 33 browser scenario groups pass: 14 general UI/recovery groups, 11 access/auth groups and 8 paper-theme workflow groups. They use the real bundled Supabase SDK with intercepted HTTP endpoints; no real email is sent.
- Widths: 1920, 1440, 1280, 1024, 768, 390 and 320px. Main views, board modes, Users and dialogs have no page-level overflow. Desktop retains four board columns at 1280px+. Login is also checked on narrow screens.
- Coverage includes CRUD, notes/history, independent note save, drag/drop, status controls, search/export, calendar, keyboard, Back/Forward, persistence, invalid input, long names, escaping, storage failures, reconnects, and duplicate-free retry after a lost response.
- Auth coverage includes Admin user management, Viewer presentation, self-protection, demotion, revocation, legacy-name-cache bypass prevention, PKCE callback, session restoration, sign-out and retryable email errors. Database tests independently verify authorization and verified actor attribution.
- Zero uncaught browser JavaScript errors. Screenshots use fictional records and were visually inspected.
- The supplied live GitHub Pages URL responds successfully and still serves the legacy app.

Not verified: production migration execution, real email delivery, live authenticated writes, concurrent transactions against hosted Postgres, Safari/Firefox, or formal WCAG compliance. PGlite tests are isolated PostgreSQL tests, not a production smoke test.

## Release status and remaining limits

Production: https://azzurrohotels.github.io/Workspace/. Configure the exact return URL and SMTP, then release the sign-in frontend with both migrations and the Before User Created hook in a coordinated window. See RELEASE.md. Do not change policies while leaving the original name-only app deployed.

The full activity history still loads and polling runs every 30 seconds when idle. Larger workspaces should use incremental history or realtime updates. Field comparisons cannot detect a value changed and later changed back. General multi-record saves remain multiple requests and report partial outcomes; ordinary member removal is now one atomic delete.

A final read-only check confirmed workspace_access and board_trackers do not yet exist on production; the live activity table has no entity check constraint that would block new tracker events. The security corrections are staged locally. The live workspace has not yet been secured by this change.

## Requested restoration

Whole-card click and keyboard opening, explicit card Edit buttons, and completed tasks on member tabs were restored after comparison with the original repository. The user confirmed these were the missing behaviors. Timestamps and other new features are retained. The sidebar a mark was removed and the hide action moved above the wordmark. All 33 browser scenario groups passed again, including restored controls, drag/drop, notes, Viewer restrictions and seven viewport widths. Production remains unchanged.
