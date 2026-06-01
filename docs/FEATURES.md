# Workout Tracker — Features

Per-tab reference. For setup and day-to-day usage, see the main [README](../README.md).

## Tabs

### Settings

Holds your **session types** (training split) — the one thing that's personal to each user.
List one session per row in column A (e.g. Push / Pull / Legs, or Upper / Lower, or any names
and any number you like). The Session dropdowns on Today, Log and Programs read this list
**live**, so adding or renaming a session updates them automatically.

- Pre-filled on first setup with `Push` / `Pull` / `Legs` as a placeholder — overwrite it.
- Re-running setup never overwrites your list once it exists.
- If a dropdown ever looks stale, run **Workout → Apply Session Types (from Settings)**.
- The engine groups all history by the text in the Session column, so the count and names are
  entirely yours, and renaming a session never disturbs old logged data.

### Today

Where you log each session. Top rows (1–4): Meso, Session type (from the Settings tab), Week,
Date (auto-fills to today). Row 7 onwards: one row per set — Exercise, Set number, Type,
Weight, Reps, RIR, Notes, Swap.

- Tick the **D4** checkbox to save the session to the Log.
- Week auto-fills: finds the most recent logged week for the current session type in the Log
  and adds 1.
- Session dropdown (B2) auto-loads the last session's exercises and weights (only when the
  Today rows are empty, to avoid overwriting work in progress).
- On save: the session structure is compared against the Programs tab. If anything changed
  (exercises added/removed, sets or types changed), you're prompted to update the program to
  match.
- Swap column (H): per-row dropdown of exercises in the same muscle group — user-managed, not
  saved to the Log.

### Log

Permanent record of every set ever logged. Columns: Date, Session, Week, Exercise, Set, Type,
Weight (kg), Reps, RIR, Notes. Append-only — never edit by hand.

- Date format: `ddd d MMM yyyy` (e.g. "Sun 17 May 2026").
- Type values: W (working), WU (warmup), D (drop set), RP (rest-pause / myo-reps).

### Programs

Stores the template structure for each session within each meso. Columns: Meso, Session,
Exercise, Set, Type. Used to pre-fill Today and to detect if today's session differs from the
saved program (triggers an update prompt on save).

### Progress

A read-only **meso-history grid**: one session type's week-by-week progression across the
current meso. Rows = Exercise · Set · Type; columns = each week with data (`Wk 1`, `Wk 2`…
with the session date); cells = `weight×reps` (`—` if not done that week). Computed from the
Log — never hand-edit; refreshing only redraws it.

- **B1 — Session selector:** which session type the grid shows. **Auto-follows Today's
  Session** (so it's already right when you sit down to log), but you can change it to browse
  another session; it re-syncs next time Today's Session changes. Options self-populate from
  the sessions in your Log.
- **Meso:** the current one (auto-detected from today's date via the Mesos tab). Between mesos
  it shows empty.
- **Refresh:** auto on session change and after a save; or tick the E1 checkbox / Workout →
  Refresh Ref.
- Includes all set types **except WU**; excludes RIR.
- Design spec: `prds/spec_ref-meso-history.md`.

### Exercises

Master list of exercises with fractional muscle group allocations. Columns: Exercise, Primary
Muscle, then one column per muscle group (fractional contribution 0–1), Source.

- Exercise names here must **exactly** match the names used in the Log — any mismatch
  (including a stray trailing space or different capitalisation) means that exercise
  contributes zero volume to Set Volume.
- Ships pre-filled with ~35 exercises. Add your own by copying the row pattern: name, primary
  muscle, and a 0–1 value under each muscle the lift trains.
- This tab is the source of truth for both the Set Volume calculation and the Swap dropdowns.

### Mesos

Date range for each meso (training block). Columns: Meso, Start Date, Weeks, End Date (auto),
Notes.

- End Date auto-computes as `Start Date + Weeks × 7 − 1`.
- The meso name here must match B1 in Set Volume exactly for the volume filtering to work.

### Set Volume

Working sets per muscle group per week, for the selected meso. Refreshed by ticking the B2
checkbox or via **Workout → Refresh Set Volume**.

- **B1:** current meso name (dropdown from the Mesos tab; must match a Mesos row).
- **Row 4:** headers — col A `Muscle Group`, col B `Meso Target`, col C onwards `Wk 1`,
  `Wk 2`… (six week columns are created by default; add/remove to match your block).
- **Rows 5+:** one row per muscle group (all 22, pre-filled).
- **Col B `Meso Target`** (manual): dropdown of `Build` / `Maintenance` / `Not targeted`.
  Reflects intent for the *currently selected* meso so you can distinguish "on plan" from
  "neglected." Blank = unknown / needs confirmation (distinct from Not targeted). Update
  manually when the meso changes.
- **Col C onwards:** working sets per muscle group per week, auto-calculated. Refresh never
  touches col B.
- **Set-counting rule:** uses MAX(set number) per exercise per session per week — so RP sets
  (which share a set number with the preceding W set) are not double-counted. Warmups (WU)
  are excluded entirely.
- Filters to the current meso's date range using the Mesos tab — data from other mesos is
  ignored.

### Volume Guide

Static reference table of weekly set ranges (MEV → MAV, MRV) per muscle group, plus recovery
rate, focus-meso targets, and notes. Pre-filled and read-only — use it to interpret the Set
Volume numbers.

- Ranges are practitioner frameworks (MEV/MAV/MRV), not direct research outputs — starting
  points to adjust to your own recovery and progress. Sources listed at the bottom of the tab.

### Best Lifts

Tracks all-time personal bests for a user-curated set of exercises. Col A is a dropdown — pick
the exercises you want to track; the script fills in cols B–H from the Log.

- **B2:** Bodyweight (kg), manual — used for ×BW ratios.
- **E2:** Refresh checkbox — tick to refresh (resets to FALSE after).
- **G2:** "Last updated: …" timestamp, written by the script.
- **Rows 5+:** one row per exercise selected in col A.
- **Best Weight (B/C/D):** heaviest working set ever; tiebreak = most reps at that weight,
  then most recent date.
- **Est. 1RM (F/G):** highest Epley-adjusted 1RM across all working sets —
  `weight × (1 + (reps + RIR) / 30)`, RIR blank treated as 0.
- Only **W** (working) sets count. WU / D / RP excluded everywhere.
- Refresh trigger: E2 checkbox or **Workout → Refresh Best Lifts**.
- Row order is preserved — the script never reorders. Empty rows in col A get B–H cleared.

---

## Keeping exercise names in sync

Set Volume and Best Lifts match on the **exact** exercise name. If a name in the Log doesn't
appear in the Exercises tab, that exercise contributes zero volume (Set Volume) and won't be
found (Best Lifts). To avoid drift:

- Pick exercise names from dropdowns where available rather than typing freehand.
- When you add an exercise to the Exercises tab, use the exact spelling you'll log with.
- Watch for trailing spaces and capitalisation differences — they count as mismatches.
