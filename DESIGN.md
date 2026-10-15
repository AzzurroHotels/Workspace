# Azzurro paper workspace

Direction requested by the user on 15 October 2026: a desktop-first paper aesthetic inspired by https://komistore.app/, with a collapsible sidebar, approved-user sign-in, tracker links and visible task update times.

## Reference study and decisions

The public Komi page uses cream (#f1eadc), near-black ink (#1b150d), red actions, condensed Anton headings, Zen Kaku Gothic New body text, visible outlines and offset shadows. These were inspected in the rendered page. No proprietary assets or application logic are copied.

Azzurro adapts the printed-paper idea to hotel operations: legible task sheets, an index of shared trackers, short update timestamps, and visible staff access. Navigation and forms keep familiar behavior. No landing-page hero is added to the working dashboard.

Palette: paper #f3eddf, sheet #fffcf5, ink #29251f, red #b52e34, sage #dce7d3, ochre #ead7a3. Sky and lilac support workflow states. A faint paper-grain layer is decorative and never receives pointer events.

Type: self-hosted Barlow Condensed 600/700 for headings and large numbers; DM Sans 400/500/600/700 for controls and readable task content. Heading weight carries character without sacrificing dense task readability. Labels remain sentence case.

Layout, left aligned:

    [paper sidebar] [toggle | location                    date | account]
                    [page title                            primary action]
                    [useful summary / filters / search]
                    [working content: task sheets, calendar or tracker tiles]

The sidebar collapses completely. Hide sidebar is above the sidebar wordmark; Show sidebar appears in the header only while collapsed. The standalone red a mark is removed from the sidebar. Desktop boards retain four columns; smaller widths reflow. Tracker tiles are actual links with separate admin edit/remove controls. Motion responds only to user actions and respects reduced motion.

## Review against the brief

The previous navy/teal SaaS surfaces were rejected as insufficiently distinctive. Replace the surface system throughout, not only the home screen. Paper and offset shadows are deliberate choices from the supplied reference. Avoid ornamental numbering, giant marketing copy, excessive card nesting, and tilted content. Color denotes status, document type or action. Login, errors, empty states and dialogs use the same system.

## Skills

Project-local skills installed with the Codex skill installer before implementation:
- anthropics/skills: skills/frontend-design
- anthropics/skills: skills/webapp-testing

Source: https://github.com/anthropics/skills. Repository metadata observed 15 October 2026: 181,181 stars; main revision dbd4588f9e1033efb41dad4bef2f7947c8993d44. Stars refer to the whole repository, not an individual skill. Existing anti-ui-slop product-interface guidance was also used.

## Access and preview

The release explicitly retains the current name-based entry at the user’s request. Without that explicit configuration, startup requires verified Supabase email identity and approval in Users. Missing backend configuration fails closed. A deliberate loopback-only design preview uses fictional data and a fixed Demo administrator label; it cannot access production and must not be presented as successful staff authentication.

## Visual review

Desktop screenshots were inspected at 1440px. The first pass stretched the upcoming-work sheet to the calendar height; the final pass aligns sheets at the top and compacts calendar cells to reduce unused space. The reopening control remains in the sticky header, update timestamps use stronger contrast, and tracker tiles retain separate edit/remove actions. All five tabs, login, dialogs, mobile reflow and expanded content were reviewed with fictional data.

## Feature preservation correction

Restored whole-card pointer and Enter/Space opening, explicit Edit buttons, and active plus completed work when a member tab is selected. Existing timestamps, Notes, status controls, drag/drop, filters, list view and export remain available. Viewers open read-only details and receive no Edit action.


## Workflow additions (local preview)

Retain the approved paper palette and type: cream #f3eddf, ink #29261f, red #b52e36, sage #deead6, ochre #f4e5b5 and lilac #e5ddeb; Barlow Condensed headings and DM Sans controls/body. Daily and weekly routines use side-by-side schedules on desktop, with left-aligned time rails and restrained text-backed reminder colors. Purchase items use a compact full-width ledger with quantity, location, priority and purchase actions. This avoids making the shopping list look like another Kanban board while keeping the established Azzurro identity. The sidebar order follows the requested work sequence. New layouts collapse to one column on narrower screens. Existing Operations and Maintenance share the complete board component rather than introducing divergent controls.
