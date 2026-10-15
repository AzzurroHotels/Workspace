# Azzurro Workspace

A desktop-first static HTML/CSS/JavaScript workspace with Supabase. The current release retains name-based shared entry as requested. Admin-created name/password sign-in and Admin/Viewer policies are prepared for a later activation.

## Operations workflow release (15 October 2026)

Operations, Onsite Maintenance, Recurring tasks and Purchase List are part of the live workspace. Existing task fields and history were preserved; existing tasks now belong to Operations, and the new workflow lists start empty. The current release retains shared name-based entry. Staff name-and-password access remains deferred until the initial Supabase Auth administrator is ready.

For the isolated fictional-data preview on PowerShell:

```powershell
$env:PORT='4175'
$env:WORKFLOW_PREVIEW='true'
npm run demo
```

Open http://127.0.0.1:4175/#recurring. This preview uses fictional records and browser storage only. Preview edits are not transferred to production. For automated browser tests use the default demo fixture without WORKFLOW_PREVIEW.

## Local preview

Use Node.js 22 or newer (verified with Node 24). Run npm start and open http://127.0.0.1:4173. Normal startup uses the configured shared workspace. The explicit `accessMode: 'shared-name'` flag preserves existing name entry; without that flag the app requires an administrator-created name/password account. Missing backend configuration fails closed.

Run npm run demo for an explicitly labelled, loopback-only design preview with fictional sample data and a fixed Demo administrator identity. It never contacts Supabase. Set a separate port, such as PORT=4174, to keep the demo separate. On PowerShell use $env:PORT='4174'. Local Users records demonstrate the interface only; they grant no production access.

npm run start:shared is an explicit alias for normal shared mode. Production has the `shared_trackers` and `operations_workflows` migrations. Staff sign-in additionally requires the two scripts in `supabase/deferred/`, a verified first admin account, and the `create-workspace-user`, `update-workspace-user`, and `workspace-sign-in` Edge Functions. Staff sign in with the name entered by an administrator; email identity details stay behind the scenes for Supabase Auth. Only admins create accounts and choose Admin or Viewer access. Passwords go to Supabase Auth and are never stored in workspace records. Never put service-role credentials or database passwords in frontend configuration.

## Roles and desktop workflows

The role table and Users controls below apply only after staff sign-in is activated. Currently all workspace visitors retain the existing editing access, and Users is hidden.

| Capability | Admin | Viewer |
| --- | --- | --- |
| Dashboard, board, members, task details/history | Yes | Yes |
| Search, filter, calendar, export | Yes | Yes |
| Create/edit/delete tasks, notes and members | Yes | No |
| Open shared tracker links | Yes | Yes |
| Add/edit/remove trackers | Yes | No |
| Users tab; add/change/remove access | Yes | No |

An admin adds a person using only a name and password, choosing Admin or Viewer separately. The entered name also supplies the internal login ID; Supabase email identity details are generated and kept out of the interface. Only accounts created by an admin can sign in. Supabase manages session persistence and refresh. Admin/Dev/ProB member labels describe assignment responsibilities; they do not grant sign-in permissions.

The paper theme uses self-hosted Barlow Condensed and DM Sans, cream surfaces, red controls and muted status colors. Hide sidebar sits above the sidebar wordmark. When closed, a Show sidebar button appears in the header; the setting is remembered. Trackers accept a name and HTTP/HTTPS link; tiles open in a new tab, while document permissions remain with the original service.

The dashboard shows metrics, upcoming work, overdue tasks and a calendar. Boards have four desktop columns, list mode, status controls, drag/drop, assignee filters and Active/All/Completed/Overdue scopes. Cards open from their body, title, Edit button or Enter/Space. Selecting a member shows their active and completed work by default; the scope menu remains available. Search includes titles, descriptions, notes and assignees; export follows the current filters. Notes can be saved independently while retaining unsaved details. Each new update displays its recorded date and time in Sydney time on the board, list and history; shared timestamps are stamped by PostgreSQL.

Admins can use N for a new task; / focuses board search; Escape closes dialogs. Shortcuts pause while typing. URL hashes and Back/Forward work. Dates follow Australia/Sydney time. Smaller screens reflow into two/one columns and labelled list rows.

## Operations, routines and purchases

Operations keeps the existing `#board` links, original tasks and all board controls. Onsite Maintenance has the same controls with a separate task area. Dashboard metrics and calendar include both areas; maintenance rows are labelled. Each board remembers its own filters. Existing rows received only `area=operations`; original content and history are preserved.

Recurring tasks have daily and weekly groups, optional categories, instructions, start date, Sydney time and pause. Occurrences are ordered by scheduled date and time. Due soon starts 30 minutes before; Due now lasts 15 minutes after; later tasks are Overdue. Text labels accompany colors, and the sidebar shows the count needing attention on every tab. Colors refresh every 15 seconds while the app is open. Daily tasks reset at Sydney midnight; weekly tasks reset on the scheduled weekday. A new weekly routine never creates an overdue occurrence before its start date. Completion history is retained across cycles; a unique database constraint prevents duplicate completions for the same task/date. Pausing retains history; removing a routine deletes its completion records atomically. There are no background/email/push notifications. Sydney daylight saving applies; a time skipped by the spring clock change becomes overdue after the jump, while the repeated autumn hour remains one occurrence per date.

Purchase List provides To buy, Purchased and All items views, search, quantity/unit, location/category, priority and details. High-priority pending items appear first. Mark purchased records server time; moving back clears the current purchased timestamp. Editing a purchased item preserves that timestamp. Changes are kept in the workspace activity log.

## Build and checks

The committed vendor/supabase.js runs directly on a static host. To rebuild and verify:

~~~sh
npm ci
npm run build
npm run check
npm test
npm run build:site
~~~

build:site copies only runtime assets into dist/ and does not deploy. Dependency license notices are under vendor/. The Node tests use mocked REST and isolated PGlite PostgreSQL with synthetic identities; production is untouched.

Browser checks require Playwright and a browser. Start npm start, then run npm run test:ui and npm run test:access-ui in another terminal. Install Playwright with npm install --no-save playwright and npx playwright install chromium if needed. Alternatively set PLAYWRIGHT_MODULE to an existing package directory and BROWSER_CHANNEL to msedge or chrome. TEST_URL defaults to http://127.0.0.1:4173 and TEST_OUTPUT to test-results. All auth/database endpoints are intercepted; no real login email is sent. Run `npm run test:shared-ui` to verify the current name-based entry and shared tracker flow.

The additional tests/paper-ui.py suite uses Python Playwright and Microsoft Edge by default. Run it against npm run demo with TEST_URL=http://127.0.0.1:4174 and TEST_OUTPUT set as desired; install the Python playwright package if needed. It tests tracker CRUD, actual new-tab navigation with intercepted documents, layout, sidebar persistence, timestamp presentation and fail-closed startup.

The tests/workflows-ui.py suite checks maintenance separation and preserved task fields, recurrence CRUD/completion/undo, timed reminders with open drafts, purchase status transitions, sidebar counts and seven responsive widths. It runs against the normal demo server on port 4174.

Project-local frontend-design and webapp-testing skills from [Anthropic](https://github.com/anthropics/skills) are in .agents/skills. DESIGN.md records the reference study, palette and design decisions.

## Release

Production is https://azzurrohotels.github.io/Workspace/. This release preserves existing name entry and includes the additive `shared_trackers` and `operations_workflows` migrations. Staff-only policies and name/password sign-in remain deferred.

See RELEASE.md for the current release status and AUDIT.md for findings/evidence. The source is on `main`, which publishes through GitHub Pages. Current database records were preserved during release. The entered name maps to a unique internal login ID only when the deferred staff mode is activated; email identities stay private. Existing shared-name sessions remain available.
