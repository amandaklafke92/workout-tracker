# Workout Tracker

A free, self-contained **Google Sheets** workout tracker driven by a single Apps Script
file. Log each training session on your phone or laptop, and the sheet automatically:

- pre-fills today's session from your last one (weights, reps, RIR),
- keeps a permanent **Log** of every set you've ever done,
- calculates **working-set volume per muscle group per week** for the current training block,
- tracks **all-time PRs** (best weight + estimated 1RM) for the lifts you care about,
- ships with an evidence-based **volume guide** (MEV/MAV/MRV per muscle) for reference.

Everything runs inside a Google Sheet inside your own Google account so no data
leaves your Google Drive.

---

## Who it's for

You'll probably love this if you...

- Already have your own resistance training program or know how to program
- Are already in the habit of tracking your workouts
- Want more control over the analyses you can run on your own training data
- Are sick and tired of paying for subscriptions

One tradeoff to be aware of: you're sacrificing an app's pretty user interface for a spreadsheet.

But that also comes with another advantage: the Google Sheet is more easily shareable with AI. Give AI access to it and you can get deeper insights than any walled, proprietary app will can you. 

I initially built this for myself but because I know I'm no special cookie, I figured there would be other fitness geeks like me that might also want this. If you're still reading, that's probably you.

---

## What you get: the 11 tabs

Tabs are **colour-coded by type** — the **Start Here** tab has the key.

| Tab | What it's for |
|-----|---------------|
| **Start Here** | Orientation + the tab-colour key (what each tab is for). |
| **Today** | Where you log each session. Pick a session type and it loads your last one to beat. |
| **Progress** | Read-only grid: your week-by-week progression for a session, this meso. |
| **Log** | Permanent, append-only record of every set. Never edit by hand. |
| **Programs** | Saved session templates per training block — drives the auto pre-fill. |
| **Exercises** | The exercise library: each exercise mapped to the muscles it trains (pre-filled with ~35 to start). |
| **Mesos** | The date range of each training block ("meso"). |
| **Set Volume** | Working sets per muscle group per week, for the selected block. |
| **Volume Guide** | Reference table of recommended weekly set ranges per muscle. |
| **Best Lifts** | All-time personal records for the exercises you choose to track. |
| **Settings** | **Your session types (training split)** — set this to your own days. See below. |

Full per-tab detail is in [`docs/FEATURES.md`](docs/FEATURES.md).

---

## Is it safe?

A question you should be asking if you're going to paste code into your Google account and approve permissions.
Things to know:

- **It makes no network calls and sends no data anywhere.** The script only uses Google's
  built-in Sheets tools to build and manage *this one spreadsheet*. There are no web
  requests, no email, no access to your other files. Everything stays in your Google Drive.
  *(Don't believe me? Search the file for `UrlFetchApp`—there isn't one.)*
- **The Google permission screen looks scary but it's normal.** "Google hasn't verified
  this app" just means it's a personal script you pasted yourself, not a published add-on
  Google has reviewed. You're granting your own script access to your own sheet.
- **But don't just take my word for it.** Read the file, ask a developer friend, or
  paste it into an AI assistant and ask: *"This is a Google Apps Script I'm about to run on
  my own spreadsheet—does it do anything besides build and manage that sheet? Any network
  calls or data leaving my account?"* Cloned the whole repo? You can point an AI at the
  folder and ask how any part of it works, too.

---

## Setup (about 5 minutes, once)

### 1. Create the sheet
Open [sheets.new](https://sheets.new) to create a fresh, blank Google Sheet. Give it a name
like "Workout Tracker".

### 2. Add the script
1. In the menu bar: **Extensions → Apps Script**. A new tab opens.
2. Delete anything in the editor (usually an empty `function myFunction() {}`).
3. Open [`workout_tracker.gs`](workout_tracker.gs) from this repo, copy the **entire** file,
   and paste it into the Apps Script editor.
4. Press **Cmd+S** (Mac) or **Ctrl+S** (Windows) to save. *(Apps Script does not auto-save.)*

### 3. Build the tabs
1. At the top of the Apps Script editor, the function dropdown probably shows `onOpen`.
   Click it and choose **`setupWorkoutTracker`**.
2. Click **▶ Run**.
3. Google will ask you to authorize the script. Click **Review permissions**, pick your
   Google account, click **Advanced → Go to (your project)**, then **Allow**. *(This is
   normal — the script only touches this one spreadsheet.)*
4. Run it once more if the first run was interrupted by the permission prompt.

You'll see "Setup complete!" and all 10 tabs appear in your sheet.

### 4. Set your training split (the **Settings** tab)
This is the one bit that's personal to you. Open the **Settings** tab and, in column A,
replace the example session types (`Push` / `Pull` / `Legs`) with **your own training days** —
however many you have, named however you like:

- 2-day: `Upper`, `Lower`
- 3-day: `Push`, `Pull`, `Legs`
- 4-day: `Upper A`, `Lower A`, `Upper B`, `Lower B`
- …or anything else — `Chest day`, `Arm day`, `Day 1`, whatever you call them.

One per row. That's it — the **Session** dropdowns on Today, Log and Programs update from this
list automatically. (If a dropdown ever looks out of date, run **Workout → Apply Session
Types**.)

### 5. Turn on the trigger (so saving works)
1. Go back to the **spreadsheet tab** and **reload the page**. A new **Workout** menu appears
   next to Help.
2. Click **Workout → Set up triggers (run once)** and approve any prompt.

This one trigger is what makes the "tick to save" checkbox and the session auto-load work.
You only ever do this once.

> **That's it.** You're ready to log. The exercise library and volume guide come pre-filled;
> the Log, Mesos, Set Volume, and Best Lifts tabs start empty for your own data.

---

## How to use it

### First: set up a meso and a program
Before your first session, give the tracker your plan so it can pre-fill each day:

1. **Mesos tab** — add your current training block: a **Meso name**, Start Date, and number of
   Weeks. (The end date fills in automatically.)
2. **Programs tab** — enter your plan, **one row per set**:
   `Meso · Session · Exercise · Set # · Type`. Cover each training day (Session) with the
   exercises you'll do, and put your meso name from step 1 in the **Meso** column — that's
   what links the program to the block.

Now when you pick a session on the Today tab, those exercises load in automatically. *(You can
skip this and just type exercises straight into Today, but you lose the auto pre-fill.)*

> Building the program is currently manual data entry, one row per set — the most tedious part
> of setup. An easier exercise-picker is on the roadmap.

### Log a session (the daily loop)
On the **Today** tab:

1. **A2 / "Session"** — pick your session type from the dropdown (the days you listed on the
   Settings tab).
   - If you've logged that session type before, your last one auto-loads into the rows
     below, and the **Week** number (B3) bumps up by one. Edit the weights/reps as you go.
2. Set the **Meso** name (B1) to match your current block in the Mesos tab. The **Date** (B4)
   auto-fills to today.
3. Log your sets from **row 7 down**: Exercise, Set #, Type, Weight (kg), Reps, RIR, Notes.
4. When you're done, **tick the save checkbox at G4** ("✅ Tick to save session →"). Your sets are appended to the Log and the
   Today tab clears, ready for next time.

You can also use **Workout → Save Today → Log** and **Workout → Load Last Session** from the
menu instead of the checkbox/dropdown.

### Session types (your split)
Your session types are whatever you put on the **Settings** tab — any number, any names. Each
type pre-fills independently from its own history, so "Push" beats your last Push, "Lower"
beats your last Lower, and so on. To change your split later, just edit the Settings tab (and
run **Workout → Apply Session Types** if the dropdowns don't refresh on their own). Renaming a
session doesn't touch your old logged data — history is grouped by the text in the Session
column.

### Set types (the "Type" column)
| Type | Meaning |
|------|---------|
| `W` | Working set |
| `WU` | Warm-up (excluded from volume + PRs) |
| `D` | Drop set (same set number as the W it follows) |
| `RP` | Rest-pause / myo-reps — one row, total reps in Reps, breakdown like `10+3+2` in Notes |

### Track your training blocks (Mesos)
On the **Mesos** tab, add a row per block: a name, a start date, and the number of weeks.
The end date fills in automatically. The Set Volume tab uses these dates to know which Log
entries belong to which block.

### See your weekly volume (Set Volume)
1. Set **B1** to the meso you want to analyse (must match a Mesos name).
2. Make sure row 4 has a `Wk 1`, `Wk 2`, … column for each week of the block (six are
   created by default — add or remove to match your block length).
3. Tick the **Refresh** checkbox (B2), or use **Workout → Refresh Set Volume**.

It counts working sets per muscle group per week, using each exercise's muscle allocations
from the Exercises tab. Compare against the **Volume Guide** tab to see where you're under or
over. The optional **Meso Target** column (B) lets you mark each muscle as Build /
Maintenance / Not targeted for the current block.

### Track PRs (Best Lifts)
1. Enter your **bodyweight** in B2 (used for the strength-to-bodyweight ratios).
2. In column A from row 5, pick the exercises you want to track (dropdown).
3. Tick the **Refresh** checkbox (E2), or use **Workout → Refresh Best Lifts**.

It fills in your best weight, the reps and date you hit it, and your best estimated 1RM
(Epley formula, adjusted for RIR). Only working (`W`) sets count.

---

## Analysing your data with AI

Your whole training history is just rows in the **Log** tab — which means you can hand it to
an AI assistant and ask real questions about it. Give the AI access to the sheet (or export /
paste the Log), and ask away. This was a big part of why I built it: I wanted to *own* the
data and be able to interrogate it however I like, without waiting for an app to add the
report I wanted.

A few things you can ask:

- "Which muscle groups have I trained below the Volume Guide's MEV over the last 4 weeks?"
- "Show my estimated 1RM trend for back squat across the last three mesos."
- "Am I progressing on lateral raises, or have I stalled?"
- "Which exercises haven't I done in over a month?"

<!-- TODO (Amanda): replace the examples above with the real questions you've actually asked —
     check your Codex chats for good ones. -->

---

## FAQ & gotchas

**Exercise names must match exactly.** Volume and PRs are matched by the exact text of the
exercise name. If the Log says `Leg extension` but the Exercises tab says `Leg Extension`,
that exercise contributes **zero** volume. Pick names from the dropdowns where possible, and
keep the Exercises tab in sync with what you actually log. (Trailing spaces count too.)

**Add your own exercises — and edit the credits.** The starter library has ~35 exercises. To
add one, put a new row in the Exercises tab: the name, its primary muscle, and a fractional
contribution (0–1) for each muscle it trains (e.g. a row might put `1` under Quads and `0.5`
under Glutes). And the existing muscle credits are *evidence-informed estimates, not gospel* —
if you disagree with how an exercise is allocated, just change the numbers. Set Volume
recalculates from whatever's in this tab.

**Don't split one session across two dates.** The auto-load and Ref tab find your *most
recent date* for a session type. If a single session spans two calendar days, log it all
under one date, or you'll only see half of it next time.

**Unilateral exercises:** log per-side weight, one row per set.

**The checkbox does nothing — or saves but won't untick?** Same cause: the installable trigger
isn't active. *Every* checkbox in the sheet runs through it — including saving **and** the
auto-reset that clears the box afterwards — so if one misbehaves they all will. Run
**Workout → Set up triggers (run once)**, approve the prompt, reload the sheet, and try again.

**The Ref tab** shows the **week-by-week progression** for one session type across your
current meso (a grid: exercises down, weeks across, `weight×reps` in each cell). It follows
Today's Session automatically and refreshes after you save; you can also point its **B1**
selector at a different session to browse, or use **Workout → Refresh Ref**.

---

## Re-running setup / updating

- **`setupWorkoutTracker`** — safe to re-run. It rebuilds the Today/Ref/Exercises/Mesos/
  Set Volume/Volume Guide/Best Lifts tabs and re-creates the Log/Programs only if missing.
  It does **not** wipe an existing Log. *(Note: re-running clears the Mesos/Set Volume/Best
  Lifts layouts, so it's mainly for a fresh sheet.)*
- **`updateSchema`** — rebuilds just the Today and Ref tabs (use after editing the script).
- **`fixRef`** — rebuilds the Ref tab (the meso-history grid) only.

---

## License

MIT — see [`LICENSE`](LICENSE). Use it, fork it, change it, share it.

Built originally as a personal tracker, then cleaned up to share. Contributions and ideas
welcome.
