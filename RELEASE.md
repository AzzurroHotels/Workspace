# Azzurro Workspace release

Production: https://azzurrohotels.github.io/Workspace/
Supabase project: `iunkhgyoujdxybufjcgo`.

## Pending workflow release - approval required

Status: local implementation and isolated tests only. The user instructed: "publish only if i approve." No production migration, push, PR, merge or Pages publication has been performed for this version.

Preview: http://127.0.0.1:4175/#recurring (fictional, browser-only data). Local branch: `enhance/operations-recurring-purchases`; base live commit: `73795c9`.

Includes Operations rename, separate Onsite Maintenance board, daily/weekly recurring schedules with due colors and sidebar counts, and Purchase List with reversible purchased status. Local auth work adds admin-created name/password accounts and persistent browser sessions. The Users form now asks only for a name and password; admins choose Admin or Viewer outside the form, and email identity details stay internal. The deployed shared-name entry, Supabase project, task data and GitHub Pages remain unchanged. Cache version is `20261015.6`.

After explicit user approval only:

1. Refresh remote/main and take a fresh private backup of tasks, members, trackers and activity. Record counts and full-row fingerprints; exclude only the new area field from the post-migration comparison.
2. Apply only `supabase/migrations/20261015040000_operations_workflows.sql`. It adds `board_tasks.area` with default operations plus three empty workflow tables. It does not seed demo data or rewrite original task fields. Align the local filename to the actual assigned migration version if the management API assigns a different timestamp.
3. Compare original fields and history against the pre-migration snapshot, investigate any concurrent team edits, and verify grants/schema. Publish the matching frontend through the existing GitHub Pages source.
4. Verify live tabs, existing task counts/history, and new empty workflow views without creating dummy production records. Preserve all new records if a frontend rollback is needed; do not drop tables or reset data.

The pending staff-authentication scripts were moved to `supabase/deferred/` so an ordinary migration run cannot unexpectedly activate sign-in. They now cover all new workflow tables and require the operations_workflows schema first. Staff authentication remains a separate deferred change.

## Published release — 15 October 2026

Published to the existing GitHub Pages URL. PR #1 is merged into `main`, Pages reported a successful build, and the live browser loaded all 37 tasks, 4 members, timestamp labels and the Trackers tab. Sidebar collapse/reopen worked, with no JavaScript errors. Original full-row fingerprints still matched after live verification.

The user asked to keep normal entry for now and publish the frontend. `config.js` explicitly selects `accessMode: 'shared-name'`. This preserves the existing name-based shared workspace and its editing permissions. Names remain self-reported; this mode does not provide authenticated staff roles. The prepared Users interface is hidden until staff sign-in is activated. No passwords or email sender are required for the current release.

The release includes the paper theme, restored whole-card/Edit controls and completed member tasks, shared tracker tiles, timestamped notes, sidebar collapse above the wordmark, filters/list/export, responsive layouts and persistence fixes. Assets use a release query version to avoid mixing old cached scripts with the new page. GitHub Pages continues to serve the root of `main`; `.nojekyll` keeps the application static.

Applied `supabase/migrations/20261015024045_shared_trackers.sql` to production for this release; Supabase records version `20261015024045`. It adds the tracker table and its existing-style shared access policy, server timestamps for new updates and tracker activity support. It does not update, delete or seed any existing task, member or history row. Leave `20261015024100_staff_access.sql` and `20261015024101_trackers_and_signup.sql` unapplied for now.

A recoverable local data backup was saved outside the repository before release: 37 tasks, 4 members and 187 activity entries. Never commit that backup or seed demo data into production. Full-row fingerprints matched exactly before and after the migration for all three original tables. All live verification of existing records must be read-only.

Validation: 33 automated adapter/database checks passed, including full-record preservation and the later transition from shared tracker access to staff-only policies. Browser suites passed 34 scenario groups covering shared-name entry, refresh/recovery, task workflows, trackers, layout, sidebar behavior and the prepared authenticated mode. Syntax and the 22-file public asset build pass.

## Future staff sign-in activation

This remains deferred and production is still in shared-name mode. A read-only check confirms `public.workspace_access` does not exist in production, so staff authentication has not been activated there.

1. After explicit approval, refresh the production branch and take a fresh, private backup before applying the operations migration described above.
2. After `operations_workflows` is applied, apply `supabase/deferred/20261015024100_staff_access.sql`, then `supabase/deferred/20261015024101_trackers_and_signup.sql`, assigning fresh migration versions when activated. These preserve tasks and trackers while switching database access to verified staff roles. The initial admin row is `vivekalthi@gmail.com`, username `vivek`, display name `Vivek`.
3. In Supabase Authentication, create the first Auth identity for that approved email, set a fresh password directly in the dashboard, and confirm the email. Do not send passwords through chat or put them in source files.
4. Deploy `supabase/functions/create-workspace-user` and `supabase/functions/update-workspace-user` with JWT verification enabled, plus `supabase/functions/workspace-sign-in` with JWT verification disabled for its pre-login endpoint. All keep the service-role key server-side. The sign-in function privately maps the entered name to its account and returns a session only after Supabase verifies the password. The create function derives the internal login and email identity, while the update function changes the account name/password after an administrator check. Both write access changes with the signed-in administrator's JWT so RLS and audit history apply. No function stores or logs passwords. Keep public signup disabled.
5. Coordinate `accessMode: 'shared-name'` → `staff-password` and `userCreationEnabled: true` with the database policies and both deployed functions. The flag stays false until the functions and initial administrator are ready. Supabase Auth persists sessions in the browser and refreshes tokens; a project security policy can still require a future sign-in.
6. Verify name/password sign-in, Admin/Viewer behavior, anonymous denial, revocation, user creation and browser reload. Preserve current tasks, trackers, members and activity throughout. No SMTP is needed for administrator-created accounts; configure a mail sender later if password recovery email is added.

## Recovery

The shared migration is transactional. On failure inspect the error before retrying. It preserves the original tables and is backward compatible with the original frontend. Recover a frontend failure by reverting its commit, without deleting production data or dropping the tracker table.

After the future staff policies are activated, resolve email/frontend failures while keeping access restricted. Do not restore anonymous-write policies as a routine rollback. Preserve all new records and history when rolling forward.
