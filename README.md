# Azzurro Workspace

A desktop-first static HTML/CSS/JavaScript workspace with Supabase. The bundled official SDK manages email-link sign-in; database policies enforce Admin and Viewer access.

## Local preview

Use Node.js 22 or newer (verified with Node 24). Run npm start and open http://127.0.0.1:4173. Normal startup uses the configured shared workspace and requires an approved, verified staff email. Missing configuration fails closed; no name-entry mode remains.

Run npm run demo for an explicitly labelled, loopback-only design preview with fictional sample data and a fixed Demo administrator identity. It never contacts Supabase. Set a separate port, such as PORT=4174, to keep the demo separate. On PowerShell use $env:PORT='4174'. Local Users records demonstrate the interface only; they grant no production access.

npm run start:shared is an explicit alias for normal shared mode. Shared mode requires both migrations, the configured signup hook, SMTP, and a verified approved staff account. Never put service-role credentials, SMTP passwords or database passwords in frontend configuration.

## Roles and desktop workflows

| Capability | Admin | Viewer |
| --- | --- | --- |
| Dashboard, board, members, task details/history | Yes | Yes |
| Search, filter, calendar, export | Yes | Yes |
| Create/edit/delete tasks, notes and members | Yes | No |
| Open shared tracker links | Yes | Yes |
| Add/edit/remove trackers | Yes | No |
| Users tab; add/change/remove access | Yes | No |

Users are approved by normalized email. Adding access sends no invitation. The person opens the workspace, requests a sign-in link and opens it in the same browser. Supabase manages session persistence and refresh. Admin/Dev/ProB member labels describe assignment responsibilities; they do not grant sign-in permissions.

The paper theme uses self-hosted Barlow Condensed and DM Sans, cream surfaces, red controls and muted status colors. Hide sidebar sits above the sidebar wordmark. When closed, a Show sidebar button appears in the header; the setting is remembered. Trackers accept a name and HTTP/HTTPS link; tiles open in a new tab, while document permissions remain with the original service.

The dashboard shows metrics, upcoming work, overdue tasks and a calendar. Boards have four desktop columns, list mode, status controls, drag/drop, assignee filters and Active/All/Completed/Overdue scopes. Cards open from their body, title, Edit button or Enter/Space. Selecting a member shows their active and completed work by default; the scope menu remains available. Search includes titles, descriptions, notes and assignees; export follows the current filters. Notes can be saved independently while retaining unsaved details. Each new update displays its recorded date and time in Sydney time on the board, list and history; shared timestamps are stamped by PostgreSQL.

Admins can use N for a new task; / focuses board search; Escape closes dialogs. Shortcuts pause while typing. URL hashes and Back/Forward work. Dates follow Australia/Sydney time. Smaller screens reflow into two/one columns and labelled list rows.

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

Browser checks require Playwright and a browser. Start npm start, then run npm run test:ui and npm run test:access-ui in another terminal. Install Playwright with npm install --no-save playwright and npx playwright install chromium if needed. Alternatively set PLAYWRIGHT_MODULE to an existing package directory and BROWSER_CHANNEL to msedge or chrome. TEST_URL defaults to http://127.0.0.1:4173 and TEST_OUTPUT to test-results. All auth/database endpoints are intercepted; no real login email is sent.

The additional tests/paper-ui.py suite uses Python Playwright and Microsoft Edge by default. Run it against npm run demo with TEST_URL=http://127.0.0.1:4174 and TEST_OUTPUT set as desired; install the Python playwright package if needed. It tests tracker CRUD, actual new-tab navigation with intercepted documents, layout, sidebar persistence, timestamp presentation and fail-closed startup.

Project-local frontend-design and webapp-testing skills from [Anthropic](https://github.com/anthropics/skills) are in .agents/skills. DESIGN.md records the reference study, palette and design decisions.

## Release

Production is https://azzurrohotels.github.io/Workspace/. The new frontend and two migrations must be released together. The old app cannot use staff-only policies; a login screen alone does not secure the API.

See RELEASE.md for the current release status and exact settings, and AUDIT.md for findings/evidence. The release branch is `enhance/workspace-ui`; production deployment is pending SMTP configuration and the coordinated migrations. The production database remains unchanged.
