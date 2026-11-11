# OPS Calendar

A tactical operations calendar built with Next.js 15, TypeScript, Tailwind CSS 4,
Radix UI, Zustand, date-fns, and date-fns-tz.

## Run locally

Install Node.js 20.9 or later, then:

```sh
npm install
npm run dev
```

Open http://localhost:3000. Validate with `npm run test`, `npm run typecheck`,
and `npm run build`.

## Enable online groups

1. Create a Supabase project. In its SQL editor, run `supabase/schema.sql` once
   on a new project, then run `supabase/username-migration.sql`. Existing
   installations that already ran `schema.sql` only need the migration. These
   scripts create the tables, row-level security policies, and functions.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` to your
   project URL and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to its publishable
   key (or legacy anon key). These are public client values: **never** put the
   service-role or secret key in this file. Restart the Next.js server.
3. In Supabase Authentication, enable email/password sign-in. Set the Site URL
   and allowed redirect URLs to your deployed app URL; for local development
   allow `http://localhost:3000`. If email confirmations are enabled, users
   must follow the confirmation email before signing in. Supabase's default
   email service has delivery limits; configure an email provider for production.
4. Create an account with a unique username, sign in, and create a group. Open
   **Members**, search for a username, and invite them. The recipient must sign
   in and accept the invitation on the home page; use **Refresh** to check for
   new invitations. No invitation email is sent.

Usernames are case-insensitive, stored in lowercase, and must be 3-24 letters,
numbers, or underscores. Signed-in users can find usernames by partial search;
email addresses are not shown in search or member lists. Usernames cannot
currently be changed. Existing accounts choose a username when they next sign
in. Previously added members remain members. Pending invitations from the
earlier email flow become invitations that must be accepted when the verified
recipient next signs in. The old direct-add email function is disabled.

The group owner adds members; all group members can create, edit, and delete
group operations. Each group operation is stored once and automatically appears
in every member's private calendar, alongside their private operations. Editing
or deleting a shared operation from the private calendar changes it for the
whole group. New operations created from the private calendar are private; new
operations created from a group calendar are shared with that group. The app
refreshes online data every 15 seconds, when the window regains focus, and when
you press Refresh; concurrent edits use the last saved version.

Deploy the app to a publicly reachable Next.js host and configure the same
public Supabase environment variables there for other people to use it.
Online data is protected by Supabase authentication and row-level security.
The SQL schema and live access policies must be applied before online features
can work; client-side checks are not a replacement for them.

## Current functionality

- Strategic month view, tactical week/day time grids, and a seven-day chronological log.
- Overlapping timed operations share the available column width. All-day and
  multi-day operations appear in the lane above the time grid.
- Select an empty 15-minute slot to initialize an operation. Drag timed
  operations to move them or drag their bottom edge to resize. In the top
  lane, drag horizontally to move by day and drag the right edge to resize by
  day; navigate to an operation's end if its right edge is outside the view.
- Mini-calendar, active/today operation feed, and accessible mobile drawer.
- Create, edit, and delete operations with classification and status.
- UTC/local display toggle and live dual clocks. Timed operation details show
  local and UTC dates and times, including across midnight boundaries.
- All-day operations, online group/private calendars, and a separate device calendar.

The interface is deliberately dark-only and shadowless. The time toggle changes
the calendar's date boundaries and the editor's input timezone; it does not
change stored timed-operation instants. Switching modes retains the selected
calendar date. All-day date ranges are timezone-independent calendar dates.
Ambiguous local times during a daylight-saving rollback are rejected; select UTC
mode to specify an exact time. Existing ambiguous instants can be edited without
changing their time. Each local-day grid uses its actual elapsed duration,
including 23- and 25-hour daylight-saving days; repeated hours have distinct
Zulu labels. Moving an operation between days preserves its elapsed duration
and vertical grid position, so its local clock time can change across a
daylight-saving transition.

The device calendar remains available from the home page and is separate
from online accounts. Its operations do not sync between devices; clearing
site data removes them. New device calendars include explicitly
marked sample operations. Existing Daymark events are read with default
`TLP:CLEAR` and `pending` metadata without deleting the original data. Device
operations are not automatically uploaded to an account. Changes are persisted
only after a successful save.

## Competition planner

Open **COMPETITIONS / HK** in the calendar sidebar (inside the navigation drawer
on mobile). It includes all five requested platforms: Solana/MLH, Lanqiao Cup,
Kaggle, RoboMaster and Codeforces. Filter by platform, HK online options or
confirmed upcoming dates. The catalog is a **2026-11-10 research snapshot**, not
a live registration or eligibility feed. Each entry links to its official source.
Online availability is not a guarantee of individual eligibility or prize rights.

Codeforces rounds have confirmed dated milestones. Kaggle's Titanic and House
Prices practice options require reviewing their individual rules. Lanqiao's Hong
Kong division/track eligibility and dates require organizer confirmation.
RoboMaster 2027 requires a qualified university team; team registration closed
October 27, 2026. The linked Solana hackathon ended November 8, 2026 US Eastern
time (November 9 HKT); historical entries are explicitly marked.

The seven new recommendations are Samsung Solve for Tomorrow, Hong Kong Science
Fair, AtCoder ABC 484, Diamond Challenge, EdCity Student Innovation Competition,
Technovation Challenge and the VEX V5 Hong Kong High School Championship.
Each includes school/team/age requirements, step-by-step joining instructions,
an official link, deadline notes and a locally bundled organizer logo. Open
**Information details / how to join** in the planner, or click a saved entry.

Use **ADD ALL 7 RECOMMENDATIONS** to save their 12 dated milestones in the current
browser, private or group calendar. Group imports are visible to all members.
Repeated imports skip existing catalog milestones and preserve custom edits;
local imports save atomically. An online failure reports partial progress and
stops; retry adds only missing entries. No entries are automatically uploaded
or added to other calendars. Source identifiers are stored in the optional
competition metadata, with no database migration.

Samsung and EdCity deadlines without confirmed cutoff times are all-day date
markers, not invented timed deadlines. The VEX championship spans both local
competition dates; its registration-opening reminder is not an assertion that
entry is already open. International deadlines are converted from their source
timezones, including the US daylight-saving offset used for Technovation.
Exact-cutoff reminders use one-minute markers starting at the cutoff; this is
not a submission grace period.

Choose a competition or deadline milestone, review/customize it, then save.
Registration/submission deadlines are separate calendar entries. Undated options
create a **personal preparation target**, never an invented official deadline.
Catalog date previews use Hong Kong time; the editor/calendar continue to honor
the existing UTC/local toggle. Saving navigates to the entry's scheduled date.

Competition logos appear in month, week, day, agenda and the active/today feed.
Click an entry for eligibility, joining steps, official links and deadline notes.
Edit organizer, HTTPS logo/link, entry type, requirements, notes, dates and status,
or enable **COMPETITION / CUSTOM DETAILS** on an ordinary event for another contest.
The platform and organizer icons are bundled locally; custom logos load from their
configured HTTPS host. Unavailable logos show labelled initials. Clearing the
competition checkbox removes only its competition metadata.

Saved competition data uses the existing local/online operation payload, including
shared-group behavior, without a database migration. It is not refreshed from
organizer sites; editing one milestone does not update other entries. Adding a
date is planning only: it does not register you, pay fees or submit a project.

## Project structure

- `src/app`: root layout, Tailwind configuration, and tactical design tokens.
- `src/components/calendar`: responsive shell, sidebar, views, and editor.
- `src/components/ui`: accessible UI primitives.
- `src/stores/calendar-store.ts`: Zustand state, time mode, and persistence.
- `supabase/schema.sql`: online data tables, access policies, and group functions.
- `src/types/calendar.ts`: operation, classification, status, and view types.
- `src/lib/calendar`: date/time helpers, storage validation, and tests.

Timed operations are stored as instants with exclusive ends; all-day operations
store date-only ranges with exclusive end dates. Zustand keeps the local IANA
timezone, selected display timezone, time mode, selected date, and view.

## Shortcuts

- `M`: strategic month view
- `W`: tactical week view
- `D`: tactical day view
- `A`: chronological log
- `T`: today in the selected time base
- `C`: initialize operation

Shortcuts are disabled while typing or while a dialog is open.
In the time grid, use arrow keys to navigate slots. To move or resize with a
keyboard, focus an operation or its resize handle, press Space, use the arrows,
then press Space to drop or Escape to cancel.

## Planned

Operation search and external Google/Outlook calendar integration are not yet
implemented. The interface does not monitor a real SOC.
