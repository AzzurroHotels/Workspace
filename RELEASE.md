# GitHub Pages release

Production: https://azzurrohotels.github.io/Workspace/
Supabase project: `iunkhgyoujdxybufjcgo`
Prepared initial Admin: `vivekalthi@gmail.com`.

The code and two migrations are tested locally. Release branch: `enhance/workspace-ui`, targeting `main`.

## Release readiness — 15 October 2026

GitHub Pages is confirmed to publish from the root of `main` using the existing legacy build. Keep the release on its feature branch until staff sign-in is ready; merging now would replace the working dashboard with an unconfigured login flow.

Production preflight found 37 tasks, 4 members, 187 activity records and no Auth users. Neither new migration has been applied. Supabase's email settings show custom SMTP disabled. No production records, policies, authentication settings or Pages configuration were changed during this preflight. Configure and verify SMTP, the exact return URL and signup hook before the coordinated live release below. The release must not seed demo data or overwrite existing tasks.

Validation: 31 automated adapter/database checks passed, including preservation of existing records. The latest local browser verification passed 33 scenario groups covering recovery, roles, trackers, responsive layouts, restored task-board controls and sidebar placement. The public asset build and JavaScript syntax checks pass.

## Sign-in configuration

In [Supabase URL Configuration](https://supabase.com/dashboard/project/iunkhgyoujdxybufjcgo/auth/url-configuration), set **Site URL** to `https://azzurrohotels.github.io/Workspace/` and add the same exact value to **Redirect URLs**. Preserve other legitimate redirects. Keep `/Workspace/` and the trailing slash. The app computes its return URL from its own directory and supports this GitHub Pages path.

In [Supabase Emails](https://supabase.com/dashboard/project/iunkhgyoujdxybufjcgo/auth/templates), open the SMTP settings and configure the provider's host, port, sender email/name, username and password. Enter credentials directly in the dashboard, never in GitHub, browser code, or chat. The user reports SMTP is not configured or is uncertain; delivery must be verified before general staff rollout.

Use the standard magic-link confirmation URL in the email template. The official SDK handles the PKCE callback. This app does not ask users to type an OTP code. Keep email confirmation enabled and allow new accounts so approved first-time users can sign in. After applying both migrations, enable the PostgreSQL **Before User Created** hook in Supabase Authentication → Hooks and select `public.hook_before_user_created`. It accepts only emails already added in Users. Leave account creation enabled for approved first-time users. Creating an Auth account alone does not grant access; verified database membership is also required. Revoking access blocks existing sessions at the data-policy layer. See [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook).

Supabase's default sender only delivers to organization team members. It is not suitable for general staff onboarding. See [SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp), [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls), and [email-link sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Publish together

1. Configure and verify the sender and return URL. Review the source, migration and screenshots; preserve a recoverable database backup using the organization's normal process.
2. Run `npm run build:site`. The resulting `dist/` contains only public runtime assets and `.nojekyll`. It does not configure or trigger GitHub Pages automatically.
3. Confirm the repository's current Pages source in GitHub settings. Publish the new runtime files together through that source. If Pages serves the root of `main`, update that root; do not switch deployment sources blindly.
4. Coordinate frontend publication with `supabase/migrations/202610150001_staff_access.sql`, followed by `supabase/migrations/202610150002_trackers_and_signup.sql`. Enable the signup hook before making the new sign-in flow available. Do not leave the legacy name-only application running against staff-only policies. Do not treat the login screen as securing data until the migration succeeds.
5. Wait for Pages to finish. Verify all new relative assets load under `/Workspace/`, then have the initial administrator request and open a real email link in the same browser. Confirm Dashboard, boards, Trackers, members, Users and the sidebar toggle work.
6. Add an actual staff email as Viewer and verify their read-only access. Verify anonymous API denial on tasks, members and trackers, rejection of unapproved first-time signups, rejection of previously registered but unapproved users, and actor attribution. Verify Viewer tracker links open but mutations are denied. Save an update and confirm its server-stamped time. Use explicitly designated disposable test records for live write checks. Run Supabase security advisors again.

No staff emails other than the initial administrator have been provided. Adding access does not send an invitation; staff request their own link from the app.

## Recovery

Each migration is transactional and preserves existing tasks, members and history. It is versioned, not an idempotent seed script. If it fails, inspect the error before retrying.

After policies are active, resolve frontend/email failures while keeping access restricted. Do not restore anonymous-write policies as a routine rollback. A database owner can correct an administrator email if necessary. Keep new access and activity columns when rolling forward; dropping them would discard new information.
