# Azzurro Workspace release

Production: https://azzurrohotels.github.io/Workspace/
Supabase project: `iunkhgyoujdxybufjcgo`.

## Current release — 15 October 2026

Published to the existing GitHub Pages URL. PR #1 is merged into `main`, Pages reported a successful build, and the live browser loaded all 37 tasks, 4 members, timestamp labels and the Trackers tab. Sidebar collapse/reopen worked, with no JavaScript errors. Original full-row fingerprints still matched after live verification.

The user asked to keep normal entry for now and publish the frontend. `config.js` explicitly selects `accessMode: 'shared-name'`. This preserves the existing name-based shared workspace and its editing permissions. Names remain self-reported; this mode does not provide authenticated staff roles. The prepared Users interface is hidden until staff sign-in is activated. No passwords or email sender are required for the current release.

The release includes the paper theme, restored whole-card/Edit controls and completed member tasks, shared tracker tiles, timestamped notes, sidebar collapse above the wordmark, filters/list/export, responsive layouts and persistence fixes. Assets use a release query version to avoid mixing old cached scripts with the new page. GitHub Pages continues to serve the root of `main`; `.nojekyll` keeps the application static.

Applied `supabase/migrations/20261015024045_shared_trackers.sql` to production for this release; Supabase records version `20261015024045`. It adds the tracker table and its existing-style shared access policy, server timestamps for new updates and tracker activity support. It does not update, delete or seed any existing task, member or history row. Leave `20261015024100_staff_access.sql` and `20261015024101_trackers_and_signup.sql` unapplied for now.

A recoverable local data backup was saved outside the repository before release: 37 tasks, 4 members and 187 activity entries. Never commit that backup or seed demo data into production. Full-row fingerprints matched exactly before and after the migration for all three original tables. All live verification of existing records must be read-only.

Validation: 33 automated adapter/database checks passed, including full-record preservation and the later transition from shared tracker access to staff-only policies. Browser suites passed 34 scenario groups covering shared-name entry, refresh/recovery, task workflows, trackers, layout, sidebar behavior and the prepared authenticated mode. Syntax and the 22-file public asset build pass.

## Future staff sign-in activation

This is deferred, not active in the current release. First sign in to Supabase using an account allowed to change Authentication settings. The inspected account had disabled controls; Site URL was `http://localhost:3000`, no redirect allowlist existed, and custom SMTP was disabled.

1. In Authentication → URL Configuration set Site URL to `https://azzurrohotels.github.io/Workspace/` and add that exact value to Redirect URLs, preserving other legitimate entries.
2. Configure custom SMTP in Authentication → Emails → SMTP. Enter provider credentials only in Supabase. Verify delivery before changing access. Supabase's default sender is restricted to organization team addresses and is not suitable for general staff onboarding: https://supabase.com/docs/guides/auth/auth-smtp.
3. Apply `20261015024100_staff_access.sql`, then `20261015024101_trackers_and_signup.sql`. The latter preserves existing tracker rows and removes the temporary shared tracker policy. The exact initial administrator is `vivekalthi@gmail.com`.
4. Enable PostgreSQL Before User Created hook `public.hook_before_user_created` in Authentication → Hooks. Keep email confirmation enabled and new accounts allowed for approved users. The hook blocks unapproved first-time accounts; RLS independently checks approved verified membership on every request.
5. Coordinate removal of `accessMode: 'shared-name'` with those migrations and publish the matching frontend. A missing accessMode selects staff sign-in, not shared entry. A client-side flag cannot bypass the restricted database policies once they are applied.
6. Verify a real email-link sign-in in the same browser, Admin/Viewer behavior, anonymous denial and revocation. Adding a user in Users grants email approval; it does not send an invitation. Preserve tasks, members, trackers and history throughout.

## Recovery

The shared migration is transactional. On failure inspect the error before retrying. It preserves the original tables and is backward compatible with the original frontend. Recover a frontend failure by reverting its commit, without deleting production data or dropping the tracker table.

After the future staff policies are activated, resolve email/frontend failures while keeping access restricted. Do not restore anonymous-write policies as a routine rollback. Preserve all new records and history when rolling forward.
