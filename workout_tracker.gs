// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  WORKOUT TRACKER — Google Apps Script                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// SETUP (two steps, once):
//   1. In a fresh Google Sheet: Extensions > Apps Script, paste this whole file,
//      save (Cmd/Ctrl+S), then run setupWorkoutTracker() and accept the prompts.
//   2. Reload the sheet, then use the new "Workout" menu >
//      "Set up triggers (run once)".
// That's it — see README.md for the full walkthrough.
//
// setupWorkoutTracker() builds all 10 tabs from scratch:
//   Today        — log each session (input)
//   Ref          — read-only view of the last session for the current type
//   Log          — permanent append-only record of every set
//   Programs     — saved session templates per meso (drives prefill)
//   Exercises    — exercise library with fractional muscle allocations (pre-filled)
//   Mesos        — date range per training block
//   Set Volume   — working sets per muscle group per week, per meso
//   Volume Guide — static MEV/MAV/MRV reference (pre-filled)
//   Best Lifts   — all-time PRs for a user-chosen set of exercises
//   Settings     — your session types (training split); edit to your own days
//
// Re-running setupWorkoutTracker() rebuilds Today/Ref and rewrites the reference
// tabs; the Log is only created if missing, never wiped. updateSchema() refreshes
// just the Today/Ref tabs on an existing sheet.
//
// ── COLUMN REFERENCE ─────────────────────────────────────────────────────────
// Log:      A=Date, B=Session, C=Week, D=Exercise, E=Set, F=Type, G=Weight(kg),
//           H=Reps, I=RIR, J=Notes
// Type values: W (working), D (drop), WU (warmup), RP (rest-pause / myo-reps)
//
// Today meta rows (1–4): A1=Meso, A2=Session (dropdown), A3=Week,
//           A4=Date (formula) | D4=save checkbox
// Today data rows (7+):  A=Exercise, B=Set, C=Type, D=Weight(kg), E=Reps,
//           F=RIR, G=Notes, H=Swap (user-managed — not logged, not loaded)
//
// Programs:  A=Meso, B=Session, C=Exercise, D=Set, E=Type
// Exercises: A=Exercise, B=Primary Muscle, C..X=22 muscle fractions, Y=Source
//
// ── SHARED CONSTANTS ─────────────────────────────────────────────────────────

// The 22 muscle groups, in column order. Shared by the Exercises tab (headers),
// Set Volume (rows), and Volume Guide (rows). Single source of truth.
const MUSCLE_GROUPS = [
  'Chest', 'Front Delts', 'Side Delts', 'Rear Delts', 'Upper Back', 'Lats',
  'Upper Traps', 'Serratus', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Obliques',
  'Lower Back', 'Neck', 'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Abductors',
  'Calves', 'Tibialis'
];

// Session types (your training split) are NOT hardcoded — each user lists their
// own on the Settings tab, and the Session dropdowns read from there live. The
// set types below (W/D/WU/RP) and the 22 muscle groups above are universal, so
// they stay fixed in code.

// Starter exercise library, embedded so setup is one-click (no CSV import).
// CANONICAL SOURCE is data/exercise-library.csv in the repo — if you edit one,
// edit both. No field contains a comma, so a plain split(',') parses it safely.
// Columns: Exercise, Primary Muscle, <22 muscle fractions>, Source.
const EXERCISE_LIBRARY_CSV =
`Exercise,Primary Muscle,Chest,Front Delts,Side Delts,Rear Delts,Upper Back,Lats,Upper Traps,Serratus,Biceps,Triceps,Forearms,Abs,Obliques,Lower Back,Neck,Glutes,Quads,Hamstrings,Adductors,Abductors,Calves,Tibialis,Source
Assisted pull-ups (neutral-grip),Lats,,,,0.5,,1,,,1,,0.5,,,,,,,,,,,,MF
Assisted pull-ups (neutral-grip; band: purple),Lats,,,,0.5,,1,,,1,,0.5,,,,,,,,,,,,MF
Back squats (bb; elevated),Quads,,,,,,,,,,,,,,0.5,,1,1,,1,,,,MF
Back squats (bb),Glutes,,,,,,,,,,,,,,0.5,,1,1,,1,,,,MF
Bench press (bb; close-grip),Chest,1,0.5,,,,,,,,1,,,,,,,,,,,,,MF
Bicep curl (cables; seated),Biceps,,,,,,,,,1,,,,,,,,,,,,,,MF
Bicep curl (bb),Biceps,,,,,,,,,1,,,,,,,,,,,,,,MF
Bicep curl (db; seated),Biceps,,,,,,,,,1,,,,,,,,,,,,,,MF
Bulgarian split squats (db; contralateral; glute-focused),Glutes,,,,,,,,,,,0.5,,,,,1,0.5,,1,0.5,,,MF
Chest press (bb),Chest,1,0.5,,,,,,,,0.5,,,,,,,,,,,,,MF
Chest press (machine; plate-loaded),Chest,1,0.5,,,,,,,,0.5,,,,,,,,,,,,,MF
Conventional deadlift (bb),Glutes,,,,,0.5,,,,,,0.5,,,0.5,,1,0.5,1,1,,,,MF
Hamstring curl (lying),Hamstrings,,,,,,,,,,,,,,,,,,1,0.5,,0.5,,MF
Hamstring curl (seated),Hamstrings,,,,,,,,,,,,,,,,,,1,0.5,,0.5,,MF
Hip abduction (machine; forward; pin-loaded),Glutes,,,,,,,,,,,,,,,,1,,,,1,,,MF
Hip abduction (machine; upright; pin-loaded),Glutes,,,,,,,,,,,,,,,,1,,,,1,,,MF
Hip abduction (machine; single-leg; pin-loaded),Glutes,,,,,,,,,,,,,,,,1,,,,1,,,MF
Hip adduction (pin-loaded),Glutes,,,,,,,,,,,,,,,,,,,1,,,,MF
Hip thrust (machine; plate-loaded; belt),Glutes,,,,,,,,,,,,,,,,1,0.5,,,,,,MF
Lat pulldown (neutral; close-grip),Lats,,,,0.5,0.5,1,,,1,,0.5,,,,,,,,,,,,MF
Lateral raise (machine; seated),Side Delts,,0.5,1,,,,0.5,,,,,,,,,,,,,,,,MF
Lateral raise (machine; single-arm; seated),Side Delts,,0.5,1,,,,0.5,,,,,,,,,,,,,,,,MF
Lateral raise (machine; single-arm; standing),Side Delts,,0.5,1,,,,0.5,,,,,,,,,,,,,,,,MF
Lateral raise (db; single-arm; standing),Side Delts,,0.5,1,,,,0.5,,,,,,,,,,,,,,,,MF
Lateral raise (cables; in front of body),Side Delts,,,1,,,,,,,,,,,,,,,,,,,,MF
Lateral raise (db; leaning; seated),Side Delts,,0.5,1,,,,0.5,,,,,,,,,,,,,,,,MF
Leg extension,Quads,,,,,,,,,,,,,,,,,1,,,,,,MF
Leg press (single-leg; side),Glutes,,,,,,,,,,,,,,,,1,0.5,,,,,,MF
Low incline press (db),Chest,1,0.5,,,,,,,,0.5,,,,,,,,,,,,,MF
Meadow row,Upper Back,,,,1,1,,,,0.5,,0.5,,,,,,,,,,,,MF
Overhead tricep extension (mid pulley; straight bar),Triceps,,,,,,,,,,1,,,,,,,,,,,,,MF
Pull-ups (neutral-grip),Lats,,,,0.5,0.5,1,,,1,,0.5,,,,,,,,,,,,MF
Rear delt fly (machine; sideways),Rear Delts,,,,1,0.5,,0.5,,,,,,,,,,,,,,,,MF
Shoulder press (db; seated),Side Delts,,1,1,,,,0.5,0.5,,0.5,,,,,,,,,,,,,MF
T-bar row (chest-supported; overhand-grip),Upper Back,,,,1,1,1,0.5,,0.5,,0.5,,,,,,,,,,,,MF
Triceps extension (seated; plate-loaded),Triceps,0.5,0.5,,,,,0.3,,0.3,1,0.3,,,,,,,,,,,,MF`;

// Parse EXERCISE_LIBRARY_CSV into row arrays for setValues().
// Numeric cells become numbers; blanks stay ''. Name/Primary/Source stay strings.
function _parseExerciseLibrary() {
  const lines = EXERCISE_LIBRARY_CSV.trim().split('\n');
  const sourceCol = 24; // last column (0-indexed): Exercise(0) + Primary(1) + 22 muscles + Source
  return lines.slice(1).map(line => line.split(',').map((cell, i) => {
    if (i === 0 || i === 1 || i === sourceCol) return cell.trim();
    const n = parseFloat(cell);
    return isNaN(n) ? '' : n;
  }));
}

// Static weekly volume guide (MEV/MAV/MRV per muscle). Display reference only.
// Columns: Muscle, Recovery, Beginner, Intermediate, Advanced, MRV,
//          Focus Meso Target, Indirect volume from, Notes.
const VOLUME_GUIDE_DATA = [
  ['Chest', 'Moderate', '6–10', '10–16', '14–20', '20–22', '18–22', 'All press variations', 'Front delts contribute to pressing; monitor combined push volume'],
  ['Front Delts', 'Fast', '0–4', '4–8', '6–12', '16–18', '12–16', 'All press variations', 'Usually sufficiently trained via chest pressing — low direct MEV for most'],
  ['Side Delts', 'Fast', '6–10', '10–16', '14–22', '22–26', '20–24', 'Upright rows', 'Respond well to higher frequency and volume; often undertrained'],
  ['Rear Delts', 'Fast', '6–10', '10–16', '14–20', '20–24', '18–22', 'Rows, face pulls', 'Often undertrained relative to front delts; benefits from direct work'],
  ['Upper Back', 'Moderate', '6–10', '10–16', '14–20', '20–22', '18–22', 'All rows and pulls', 'Large group; compound rows provide substantial volume'],
  ['Lats', 'Moderate', '6–10', '10–16', '14–20', '20–22', '18–22', 'All vertical pulls', 'Prioritise full stretch; lat pulldown, pullover variations'],
  ['Upper Traps', 'Fast', '0–4', '4–8', '6–12', '16–20', '12–16', 'Heavy rows, deadlifts', 'Often sufficiently trained via heavy compound pulling'],
  ['Serratus', 'Fast', '4–6', '6–10', '8–14', '16–20', '12–16', 'Pressing movements', 'Rarely needs much direct work; cable pullovers, push-up plus'],
  ['Biceps', 'Fast', '6–10', '10–16', '14–20', '24–26', '20–24', 'Rows, pull-ups', 'Fast recovering; tolerates high frequency well'],
  ['Triceps', 'Fast', '6–10', '10–16', '14–20', '22–24', '18–22', 'All press variations', 'Fast recovering; significant indirect volume from pressing'],
  ['Forearms', 'Fast', '4–8', '8–14', '12–18', '22–26', '16–20', 'All pulling, grip work', 'Often sufficiently trained via pulling; direct work if lagging'],
  ['Abs', 'Fast', '6–10', '10–16', '14–20', '24–26', '18–22', 'Compound lifts', 'Fast recovering; can train frequently throughout the week'],
  ['Obliques', 'Fast', '4–8', '6–12', '10–16', '20–22', '14–18', 'Compound lifts, abs work', 'Often trained via abs work and rotational movements'],
  ['Lower Back', 'Slow', '4–6', '6–10', '8–12', '14–16', '12–14', 'Deadlifts, rows, squats', '⚠ Easily overtrained; accumulates fatigue from all posterior chain work — monitor closely'],
  ['Neck', 'Fast', '3–6', '6–10', '8–14', '18–20', '12–16', '', 'Rarely trained directly; include only if specific goal'],
  ['Glutes', 'Moderate', '4–8', '10–16', '14–20', '20–22', '18–22', 'Squats, deadlifts', 'Hip thrust and Romanian DL provide best direct stimulus'],
  ['Quads', 'Slow', '4–8', '8–14', '12–18', '18–20', '16–20', 'All squat patterns', 'Slow recovering; monitor cumulative knee and leg fatigue'],
  ['Hamstrings', 'Slow', '4–8', '8–14', '12–18', '18–20', '16–20', 'Deadlift patterns', 'Slow recovering; high injury risk — progress load conservatively'],
  ['Adductors', 'Moderate', '4–6', '6–10', '8–14', '16–18', '12–16', 'Squats, lunges', 'Often undertrained; adductor machine or Copenhagen planks'],
  ['Abductors', 'Moderate', '4–6', '6–10', '8–14', '16–18', '12–16', 'Squats, step-ups', 'Lateral movements and hip abduction machine'],
  ['Calves', 'Fast', '6–10', '12–18', '16–24', '26–30', '22–26', '', 'Very fast recovering; often needs high volume and frequency to respond'],
  ['Tibialis', 'Fast', '4–6', '6–10', '8–14', '18–20', '12–16', '', 'Rarely trained directly unless specific rehab or prehab goal']
];

const VOLUME_GUIDE_SOURCES = [
  'SOURCES & NOTES',
  'Helms, E. et al. The Muscle & Strength Pyramid: Training (2nd ed.) — general evidence-based volume range 10–20 sets/muscle/week; per-session cap ~10 sets per muscle group.',
  'Schoenfeld, B.J. & Grgic, J. (2017). Evidence-Based Guidelines for Resistance Training Volume to Maximize Muscle Hypertrophy. Strength & Conditioning Journal.',
  'Trexler, E. et al. / MASS Research Review — dose-response meta-regression: volume–hypertrophy relationship is real but shows strong diminishing returns; individual variation is large.',
  'Note: MEV/MAV/MRV are practitioner frameworks, not direct research outputs. Ranges here reflect general research consensus adjusted for recovery rate. Treat as starting points — individual response varies significantly. Adjust based on your own recovery and progress over multiple mesos.'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Workout')
    .addItem('Save Today → Log', 'saveToLog')
    .addItem('Load Last Session', 'loadLastSession')
    .addSeparator()
    .addItem('Setup Today & Ref', 'updateSchema')
    .addItem('Fix Ref', 'fixRef')
    .addItem('Setup Programs Tab', 'setupProgramsTab')
    .addItem('Setup Workout Tracker', 'setupWorkoutTracker')
    .addItem('Apply Session Types (from Settings)', 'applySessionTypes')
    .addSeparator()
    .addItem('Refresh Set Volume', 'refreshSetVolume')
    .addItem('Setup Set Volume Targets', 'setupSetVolumeTargets')
    .addItem('Refresh Best Lifts', 'refreshBestLifts')
    .addSeparator()
    .addItem('Set up triggers (run once)', 'setupTrigger')
    .addToUi();
}

// Simple trigger — handles dropdown only (no dialogs needed here).
// The installable trigger (handleEdit) handles the save checkbox and its dialogs.
function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  if (sheet.getName() === 'Today') {
    if (range.getColumn() === 2 && range.getRow() >= 1 && range.getRow() <= 5 &&
        _isSessionRow(sheet, range.getRow())) {
      loadLastSession();
    } else if (range.getColumn() === 8 && range.getRow() >= 7 && e.value) {
      // Swap column (H): an exercise was picked from the dropdown.
      _performSwap(sheet, range.getRow(), e.value);
    }
  }
}

// True if the given Today row is the "Session" meta row (column A label).
// Used so the auto-load fires on a Session change regardless of its name,
// and does NOT fire when Meso / Week / Date are edited.
function _isSessionRow(todaySheet, row) {
  return String(todaySheet.getRange(row, 1).getValue()).trim().toLowerCase() === 'session';
}

// Swap handler — when an exercise is chosen from the col-H "Swap" dropdown,
// replace the exercise in col A of that row, then clear H (keeping its dropdown).
// The dropdown only offers same-muscle-group exercises, so the row's existing H
// validation stays valid after the swap. Programmatic writes here don't
// re-trigger onEdit, so there's no loop.
function _performSwap(todaySheet, row, newExercise) {
  todaySheet.getRange(row, 1).setValue(newExercise); // col A = Exercise
  todaySheet.getRange(row, 8).clearContent();        // clear H value, keep dropdown
}

// Installable trigger — handles both checkbox save and dropdown load.
// Registered via Workout > Set up triggers (run once).
// This runs with full permissions so ui.alert dialogs work correctly.
function handleEdit(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  if (sheet.getName() === 'Today') {
    if (range.getA1Notation() === 'D4' && e.value === 'TRUE') {
      saveToLog();
      sheet.getRange('D4').setValue(false);
    } else if (range.getColumn() === 2 && range.getRow() >= 1 && range.getRow() <= 5 &&
               _isSessionRow(sheet, range.getRow())) {
      loadLastSession();
    }
  }
  if (sheet.getName() === 'Set Volume' && range.getA1Notation() === 'B2' && e.value === 'TRUE') {
    refreshSetVolume();
    sheet.getRange('B2').setValue(false);
  }
  if (sheet.getName() === 'Best Lifts' && range.getA1Notation() === 'E2' && e.value === 'TRUE') {
    refreshBestLifts();
    sheet.getRange('E2').setValue(false);
  }
}

// ── TRIGGER SETUP (run once from menu) ───────────────────────────────────────
// Google's simple triggers (built-in onEdit) can't show dialogs.
// This creates an installable trigger for handleEdit which has full permissions.
// Run via Workout > Set up triggers (run once). Safe to re-run.

function setupTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Remove any existing handleEdit triggers to avoid duplicates
  // Clean up any old triggers (both names, in case of prior runs)
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onEdit' || t.getHandlerFunction() === 'handleEdit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  // Create the installable trigger pointing to handleEdit
  ScriptApp.newTrigger('handleEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  SpreadsheetApp.getUi().alert('Done! The checkbox will now show the update program dialog. You won\'t need to run this again.');
}

// ── TODAY META HELPER ─────────────────────────────────────────────────────────
// Reads Session / Date / Week from Today by scanning labels in column A.
// Robust to the header rows being in any order within rows 1–5.
function getTodayMeta(todaySheet) {
  const data = todaySheet.getRange('A1:B5').getValues();
  const meta = { sessionType: '', sessionDate: '', week: '' };
  for (const row of data) {
    const label = String(row[0]).trim().toLowerCase();
    if (label === 'session')   meta.sessionType = row[1];
    else if (label === 'date') meta.sessionDate = row[1];
    else if (label === 'week') meta.week = row[1];
  }
  return meta;
}

// ── PROGRAM HELPERS ───────────────────────────────────────────────────────────

// Returns {meso, rows} for the most recent meso in Programs matching sessionType,
// or null if the Programs tab doesn't exist or has no matching rows.
function getProgramForSession(ss, sessionType) {
  const programSheet = ss.getSheetByName('Programs');
  if (!programSheet || programSheet.getLastRow() < 2) return null;

  const data = programSheet.getDataRange().getValues();
  // Programs cols: 0=Meso, 1=Session, 2=Exercise, 3=Set, 4=Type
  const filtered = data.slice(1).filter(row => row[1] === sessionType && row[0]);
  if (filtered.length === 0) return null;

  // Last meso in document order is treated as current
  const lastMeso = filtered[filtered.length - 1][0];
  return { meso: lastMeso, rows: filtered.filter(row => row[0] === lastMeso) };
}

// Compares the structural elements of a logged session against a program.
// loggedRows: Today tab rows [[exercise, set, type, weight, reps, rir, notes], ...]
// programRows: Programs tab rows [[meso, session, exercise, set, type], ...]
// Returns an array of human-readable difference strings, empty if no differences.
function findProgramDifferences(loggedRows, programRows) {
  const loggedExercises  = [...new Set(loggedRows.map(r  => r[0]))];
  const programExercises = [...new Set(programRows.map(r => r[2]))];
  const differences = [];

  for (const ex of loggedExercises) {
    if (!programExercises.includes(ex)) differences.push(`Added: ${ex}`);
  }
  for (const ex of programExercises) {
    if (!loggedExercises.includes(ex)) differences.push(`Removed: ${ex}`);
  }

  for (const ex of loggedExercises.filter(e => programExercises.includes(e))) {
    const lRows = loggedRows.filter(r  => r[0] === ex);
    const pRows = programRows.filter(r => r[2] === ex);

    if (lRows.length !== pRows.length) {
      differences.push(`${ex}: ${pRows.length} → ${lRows.length} sets`);
    } else {
      for (let i = 0; i < lRows.length; i++) {
        const [lSet, lType] = [lRows[i][1], lRows[i][2]];
        const [pSet, pType] = [pRows[i][3], pRows[i][4]];
        if (lSet !== pSet || lType !== pType) {
          differences.push(`${ex} set ${pSet}/${pType} → set ${lSet}/${lType}`);
        }
      }
    }
  }

  return differences;
}

// Replaces the program rows for meso+sessionType with the structure from loggedRows.
// Inserts at the same position in the sheet to preserve ordering of other sessions.
function updateProgram(ss, meso, sessionType, loggedRows) {
  const programSheet = ss.getSheetByName('Programs');
  if (!programSheet) return;

  const data = programSheet.getDataRange().getValues();
  let firstRow = -1, lastRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === meso && data[i][1] === sessionType) {
      if (firstRow === -1) firstRow = i + 1; // 1-indexed sheet row
      lastRow = i + 1;
    }
  }

  const newRows = loggedRows.map(r => [meso, sessionType, r[0], r[1], r[2]]);

  if (firstRow === -1) {
    // No existing rows for this meso+session — append
    programSheet.getRange(programSheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
  } else {
    programSheet.deleteRows(firstRow, lastRow - firstRow + 1);
    programSheet.insertRows(firstRow, newRows.length);
    programSheet.getRange(firstRow, 1, newRows.length, 5).setValues(newRows);
  }

  ss.toast(`Program updated for ${meso} ${sessionType}`, 'Program updated', 3);
}

// ── WEEK HELPER ───────────────────────────────────────────────────────────────
// Returns the next week number for a given session type.
// Finds the most recent Log entry for that session, reads its Week value, adds 1.
// Returns 1 if no history exists.
function getNextWeekForSession(logSheet, sessionType) {
  const logData = logSheet.getDataRange().getValues();
  // Log cols: 0=Date, 1=Session, 2=Week
  const sessionRows = logData.slice(1).filter(r => r[1] === sessionType && r[0] && r[2] !== '');
  if (sessionRows.length === 0) return 1;
  const mostRecent = sessionRows.reduce((latest, row) =>
    new Date(row[0]) > new Date(latest[0]) ? row : latest
  , sessionRows[0]);
  const lastWeek = Number(mostRecent[2]);
  return isNaN(lastWeek) ? 1 : lastWeek + 1;
}

// ── SWAP DROPDOWN HELPER ─────────────────────────────────────────────────────
// Sets per-row data validation in column H for each loaded exercise row.
// Options = all exercises sharing the same primary muscle group (Exercise tab col B).
// Called after every session load so dropdowns always match the current exercise list.
function applySwapDropdowns(todaySheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const exSheet = ss.getSheetByName('Exercises');
  if (!exSheet || exSheet.getLastRow() < 2) return;

  const exData = exSheet.getDataRange().getValues().slice(1); // skip header

  // Build exercise → muscle group map, and muscle group → sorted exercise list
  const muscleOf = {};
  const byMuscle = {};
  for (const row of exData) {
    const name   = String(row[0]).trim();
    const muscle = String(row[1]).trim();
    if (!name || !muscle) continue;
    muscleOf[name] = muscle;
    if (!byMuscle[muscle]) byMuscle[muscle] = [];
    byMuscle[muscle].push(name);
  }
  for (const muscle in byMuscle) byMuscle[muscle].sort();

  // Clear column H entirely (values + validations) so old session's dropdowns don't persist
  todaySheet.getRange('H7:H200').clear();

  // Apply per-row validation based on the exercise in column A
  const exercises = todaySheet.getRange('A7:A200').getValues().flat();
  for (let i = 0; i < exercises.length; i++) {
    const ex = String(exercises[i]).trim();
    if (!ex) continue;
    const muscle  = muscleOf[ex];
    if (!muscle || !byMuscle[muscle]) continue;
    todaySheet.getRange(7 + i, 8).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(byMuscle[muscle], true)
        .build()
    );
  }
}

// ── LOAD LAST SESSION ─────────────────────────────────────────────────────────

function loadLastSession() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const todaySheet = ss.getSheetByName('Today');
  const logSheet   = ss.getSheetByName('Log');
  if (!todaySheet || !logSheet) return;

  const { sessionType } = getTodayMeta(todaySheet);
  if (!sessionType) return;

  // Always update week + swap dropdowns on session change — both run before the
  // existing-data guard so they fire even if exercises are already loaded.
  todaySheet.getRange('B3').setValue(getNextWeekForSession(logSheet, sessionType));
  applySwapDropdowns(todaySheet);

  const existing = todaySheet.getRange('A7:A200').getValues().flat().filter(v => v !== '');
  if (existing.length > 0) return;

  const program = getProgramForSession(ss, sessionType);
  if (!program) {
    // No Programs tab or no entry for this session — fall back to last log
    _loadFromLog(todaySheet, logSheet, sessionType);
    return;
  }

  // Build performance lookup from Log.
  // Key: "exercise|||set|||type" → most recent {weight, reps, rir, notes} for this session type.
  const logData = logSheet.getDataRange().getValues();
  // Log cols: 0=Date,1=Session,2=Week,3=Exercise,4=Set,5=Type,6=Weight,7=Reps,8=RIR,9=Notes
  const perfMap = {};
  for (const row of logData.slice(1).filter(r => r[1] === sessionType && r[0])) {
    const key = `${row[3]}|||${row[4]}|||${row[5]}`;
    if (!perfMap[key] || new Date(row[0]) > new Date(perfMap[key].date)) {
      perfMap[key] = { date: row[0], weight: row[6], reps: row[7], rir: row[8], notes: row[9] };
    }
  }

  const todayRows = program.rows
    .filter(row => row[2] !== 'Exercise')
    .map(row => {
      const key  = `${row[2]}|||${row[3]}|||${row[4]}`;
      const perf = perfMap[key] || {};
      return [row[2], row[3], row[4],
              perf.weight ?? '', perf.reps ?? '', perf.rir ?? '', perf.notes ?? ''];
    });

  todaySheet.getRange(7, 1, todayRows.length, 7).setValues(todayRows);
  todaySheet.getRange('H7:H200').clearContent();
  applySwapDropdowns(todaySheet);
  ss.toast(`Loaded ${program.meso} ${sessionType} with last performance`, 'Session loaded', 4);
}

// Fallback: load structure + performance directly from the last Log entry for this session.
function _loadFromLog(todaySheet, logSheet, sessionType) {
  const logData = logSheet.getDataRange().getValues();
  if (logData.length < 2) return;

  const tz = Session.getScriptTimeZone();
  const sessionRows = logData.slice(1).filter(row => row[1] === sessionType && row[0]);
  if (sessionRows.length === 0) return;

  const maxDate = sessionRows.reduce((max, row) => {
    const d = new Date(row[0]);
    return d > max ? d : max;
  }, new Date(0));
  const maxDateStr = Utilities.formatDate(maxDate, tz, 'yyyy-MM-dd');
  const lastRows   = sessionRows.filter(row =>
    Utilities.formatDate(new Date(row[0]), tz, 'yyyy-MM-dd') === maxDateStr
  );

  const cleanRows = lastRows
    .map(row => [row[3], row[4], row[5], row[6], row[7], row[8], row[9]])
    .filter(row => row[0] !== '' && row[0] !== 'Exercise');

  todaySheet.getRange(7, 1, cleanRows.length, 7).setValues(cleanRows);
  todaySheet.getRange('H7:H200').clearContent();
  applySwapDropdowns(todaySheet);

  const dateStr = Utilities.formatDate(maxDate, tz, 'dd MMM yyyy');
  SpreadsheetApp.getActiveSpreadsheet()
    .toast(`Loaded ${cleanRows.length} sets from last ${sessionType} (${dateStr}) — no program found`, 'Session loaded', 4);
}

// ── SAVE TO LOG ───────────────────────────────────────────────────────────────

function saveToLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const todaySheet = ss.getSheetByName('Today');
  const logSheet   = ss.getSheetByName('Log');

  if (!todaySheet || !logSheet) {
    SpreadsheetApp.getUi().alert('Could not find Today or Log tab.');
    return;
  }

  const { sessionType, sessionDate, week } = getTodayMeta(todaySheet);

  if (!sessionType || !sessionDate) {
    SpreadsheetApp.getUi().alert('Set a session type and date before saving.');
    return;
  }

  const raw = todaySheet.getRange('A7:G200').getValues();
  // Skip rows where the exercise column is the header label (from a bad load cycle)
  const rowsToSave = raw.filter(row =>
    row[0] !== '' && row[0] !== null && row[0] !== 'Exercise'
  );

  if (rowsToSave.length === 0) {
    SpreadsheetApp.getUi().alert('Nothing to save — log some sets first.');
    return;
  }

  const logRows = rowsToSave.map(row => [
    sessionDate, sessionType, week,
    row[0], row[1], row[2], row[3], row[4], row[5], row[6]
  ]);

  const lastRow    = logSheet.getLastRow();
  const savedRange = logSheet.getRange(lastRow + 1, 1, logRows.length, 10);
  savedRange.setValues(logRows);
  savedRange.offset(0, 0, logRows.length, 1).setNumberFormat('ddd d MMM yyyy');

  // Clear Today immediately after the save succeeds — BEFORE the optional
  // program-update dialog below. The dialog uses the in-memory rowsToSave, not
  // the sheet, so clearing first is safe. This guarantees the input area always
  // clears on a successful save, even if the dialog can't render (e.g. saved via
  // the checkbox before the installable trigger was set up — ui.alert would
  // otherwise throw here and skip the clear).
  todaySheet.getRange('A7:H200').clearContent(); // A–G = logged data, H = Swap (user-managed)
  ss.toast(`${rowsToSave.length} sets saved to Log.`, 'Saved', 4);

  // Compare against the program and offer to update if the structure changed.
  // Wrapped in try/catch so a UI failure here can never undo the save + clear.
  try {
    const program = getProgramForSession(ss, sessionType);
    if (program) {
      const differences = findProgramDifferences(rowsToSave, program.rows);
      if (differences.length > 0) {
        const ui = SpreadsheetApp.getUi();
        const response = ui.alert(
          `Update program — ${program.meso} ${sessionType}?`,
          `Today's session differs from the saved program:\n\n• ${differences.join('\n• ')}\n\nUpdate the program to match today's session?`,
          ui.ButtonSet.YES_NO
        );
        if (response === ui.Button.YES) {
          updateProgram(ss, program.meso, sessionType, rowsToSave);
        }
      }
    }
  } catch (err) {
    Logger.log('Program-update dialog skipped (no UI context?): %s', err);
  }
}

// ── UPDATE SCHEMA (run on existing sheet to apply v3 changes) ─────────────────
// Before running: manually insert a blank column at F in the Log tab if needed,
// then type "Type" in F1.

function updateSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = ss.getSheetByName('Today');
  const ref   = ss.getSheetByName('Ref');

  if (!today || !ref) {
    SpreadsheetApp.getUi().alert('Today or Ref tab not found.');
    return;
  }

  const typeValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['W', 'D', 'WU', 'RP'], true)
    .build();

  // ── Today tab ──────────────────────────────────────────────────────────────
  today.clear();

  const sessionValidation = _sessionValidationRule(ss);
  const firstSession = _firstSessionType(ss);

  today.getRange('A1:B1').setValues([['Meso', '']]);
  today.getRange('A2:B2').setValues([['Session', firstSession]]);
  today.getRange('B2').setDataValidation(sessionValidation);
  today.getRange('A3:B3').setValues([['Week', '']]);
  today.getRange('A4:B4').setValues([['Date', '']]);
  today.getRange('B4').setFormula('=TODAY()').setNumberFormat('yyyy-mm-dd');
  today.getRange('D4').insertCheckboxes();
  today.getRange('D4').setNote('Tick to save session to Log');
  today.getRange('A1:B4').setFontSize(12).setFontWeight('bold');

  today.getRange('A5:G5').merge()
    .setValue('↓  LOG YOUR SETS BELOW  |  tick D4 when done to save')
    .setBackground('#1a73e8').setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(12).setHorizontalAlignment('center');

  today.getRange('A6:H6')
    .setValues([['Exercise', 'Set', 'Type', 'Weight (kg)', 'Reps', 'RIR', 'Notes', 'Swap']])
    .setBackground('#e8f0fe').setFontWeight('bold').setFontSize(12);

  today.getRange('C7:C200').setDataValidation(typeValidation);
  today.getRange('A7:H200').setFontSize(13);

  today.setColumnWidth(1, 170);
  today.setColumnWidth(2, 50);
  today.setColumnWidth(3, 60);
  today.setColumnWidth(4, 95);
  today.setColumnWidth(5, 60);
  today.setColumnWidth(6, 50);
  today.setColumnWidth(7, 180);
  today.setColumnWidth(8, 150); // Swap
  today.setFrozenRows(6);

  // ── Ref tab ────────────────────────────────────────────────────────────────
  ref.getRange('A5:F5')
    .setValues([['Exercise', 'Set', 'Type', 'Weight (kg)', 'Reps', 'RIR']])
    .setBackground('#cccccc').setFontWeight('bold').setFontSize(12);

  ref.getRange('A4:F4').merge()
    .setValue('LAST SESSION — REFERENCE ONLY')
    .setBackground('#444444').setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(12).setHorizontalAlignment('center');

  ref.getRange('A6:F60').clearContent();
  ref.getRange('A6').setFormula(
    "=IFERROR(" +
      "FILTER(Log!D:I," +
        "Log!B:B='Today'!B2," +
        "Log!A:A=MAXIFS(Log!A:A,Log!B:B,'Today'!B2)" +
      ")," +
      "\"No previous session - add data to Log first\"" +
    ")"
  );

  ref.setColumnWidth(1, 180);
  ref.setColumnWidth(2, 50);
  ref.setColumnWidth(3, 60);
  ref.setColumnWidth(4, 95);
  ref.setColumnWidth(5, 60);
  ref.setColumnWidth(6, 50);
  ref.setFrozenRows(5);

  SpreadsheetApp.getUi().alert(
    'Today & Ref tabs rebuilt.\n\n' +
    'Reminder: make sure Log column F is labelled "Type".\n\n' +
    'Today: Meso / Session / Week / Date at top (rows 1–4), then Exercise / Set / Type / Weight / Reps / RIR / Notes (row 7+).'
  );
}

// ── FIX REF ───────────────────────────────────────────────────────────────────

function fixRef() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const ref = ss.getSheetByName('Ref');
  if (!ref) { SpreadsheetApp.getUi().alert('Ref tab not found.'); return; }

  ref.getRange('A6:F60').clearContent();
  ref.getRange('A6').setFormula(
    "=IFERROR(" +
      "FILTER(Log!D:I," +
        "Log!B:B='Today'!B2," +
        "Log!A:A=MAXIFS(Log!A:A,Log!B:B,'Today'!B2)" +
      ")," +
      "\"No previous session - add data to Log first\"" +
    ")"
  );
  SpreadsheetApp.getUi().alert('Ref formula updated.');
}

// ── SETUP PROGRAMS TAB (run this on your existing sheet instead of updateSchema) ──

function setupProgramsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _setupProgramsTab(ss);
  SpreadsheetApp.getUi().alert('Programs tab ready — dropdowns applied to Session and Type columns.');
}

// ── PROGRAMS TAB SETUP (shared by setupWorkoutTracker + updateSchema) ─────────

function _setupProgramsTab(ss) {
  const sessionValidation = _sessionValidationRule(ss);
  const typeValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['W', 'D', 'WU', 'RP'], true).build();

  let programs = ss.getSheetByName('Programs');
  if (!programs) programs = ss.insertSheet('Programs');

  if (programs.getLastRow() === 0) {
    programs.getRange('A1:E1')
      .setValues([['Meso', 'Session', 'Exercise', 'Set', 'Type']])
      .setBackground('#1a1a2e').setFontColor('#ffffff')
      .setFontWeight('bold').setFontSize(11);
    programs.setFrozenRows(1);
  }

  programs.getRange('B2:B5000').setDataValidation(sessionValidation);
  programs.getRange('E2:E5000').setDataValidation(typeValidation);

  programs.setColumnWidth(1, 110); // Meso
  programs.setColumnWidth(2, 65);  // Session
  programs.setColumnWidth(3, 220); // Exercise
  programs.setColumnWidth(4, 45);  // Set
  programs.setColumnWidth(5, 55);  // Type

  return programs;
}

// ── SETUP (fresh sheet only) ──────────────────────────────────────────────────

function setupWorkoutTracker() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Settings first — the Session dropdowns read their list from it.
  const settings = setupSettingsTab(ss);
  const sessionValidation = _sessionValidationRule(ss);
  const typeValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['W', 'D', 'WU', 'RP'], true).build();

  // ── Today ──────────────────────────────────────────────────────────────────
  let today = ss.getSheetByName('Today');
  if (!today) today = ss.insertSheet('Today');
  else today.clear();

  today.getRange('A1:B1').setValues([['Meso', '']]);
  today.getRange('A2:B2').setValues([['Session', _firstSessionType(ss)]]);
  today.getRange('B2').setDataValidation(sessionValidation);
  today.getRange('A3:B3').setValues([['Week', '']]);
  today.getRange('A4:B4').setValues([['Date', '']]);
  today.getRange('B4').setFormula('=TODAY()').setNumberFormat('yyyy-mm-dd');
  today.getRange('D4').insertCheckboxes();
  today.getRange('D4').setNote('Tick to save session to Log');
  today.getRange('A1:B4').setFontSize(12).setFontWeight('bold');

  today.getRange('A5:G5').merge()
    .setValue('↓  LOG YOUR SETS BELOW  |  tick D4 when done to save')
    .setBackground('#1a73e8').setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(12).setHorizontalAlignment('center');

  today.getRange('A6:H6')
    .setValues([['Exercise', 'Set', 'Type', 'Weight (kg)', 'Reps', 'RIR', 'Notes', 'Swap']])
    .setBackground('#e8f0fe').setFontWeight('bold').setFontSize(12);

  today.getRange('C7:C200').setDataValidation(typeValidation);
  today.getRange('A7:H200').setFontSize(13);

  today.setColumnWidth(1, 170);
  today.setColumnWidth(2, 50);
  today.setColumnWidth(3, 60);
  today.setColumnWidth(4, 95);
  today.setColumnWidth(5, 60);
  today.setColumnWidth(6, 50);
  today.setColumnWidth(7, 180);
  today.setColumnWidth(8, 150); // Swap
  today.setFrozenRows(6);

  // ── Ref ────────────────────────────────────────────────────────────────────
  let ref = ss.getSheetByName('Ref');
  if (!ref) ref = ss.insertSheet('Ref');
  else ref.clear();

  ref.getRange('A1:B1').setValues([['Session', '']]);
  ref.getRange('B1').setFormula("='Today'!B2").setFontSize(12).setFontWeight('bold');
  ref.getRange('A1').setFontSize(12).setFontWeight('bold');

  ref.getRange('A2:B2').setValues([['Last session', '']]);
  ref.getRange('B2').setFormula(
    "=IFERROR(TEXT(MAXIFS(Log!A:A,Log!B:B,'Today'!B2),\"d mmm yyyy\"),\"None yet\")"
  );
  ref.getRange('A2:B2').setFontSize(11);

  ref.getRange('A4:F4').merge()
    .setValue('LAST SESSION — REFERENCE ONLY')
    .setBackground('#444444').setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(12).setHorizontalAlignment('center');

  ref.getRange('A5:F5')
    .setValues([['Exercise', 'Set', 'Type', 'Weight (kg)', 'Reps', 'RIR']])
    .setBackground('#cccccc').setFontWeight('bold').setFontSize(12);

  ref.getRange('A6').setFormula(
    "=IFERROR(" +
      "FILTER(Log!D:I," +
        "Log!B:B='Today'!B2," +
        "Log!A:A=MAXIFS(Log!A:A,Log!B:B,'Today'!B2)" +
      ")," +
      "\"No previous session - add data to Log first\"" +
    ")"
  );
  ref.getRange('A6:F60').setFontSize(13);

  ref.setColumnWidth(1, 180);
  ref.setColumnWidth(2, 50);
  ref.setColumnWidth(3, 60);
  ref.setColumnWidth(4, 95);
  ref.setColumnWidth(5, 60);
  ref.setColumnWidth(6, 50);
  ref.setFrozenRows(5);

  // ── Log ────────────────────────────────────────────────────────────────────
  let log = ss.getSheetByName('Log');
  if (!log) log = ss.insertSheet('Log');

  if (log.getLastRow() === 0) {
    log.getRange('A1:J1')
      .setValues([['Date', 'Session', 'Week', 'Exercise', 'Set', 'Type', 'Weight (kg)', 'Reps', 'RIR', 'Notes']])
      .setBackground('#1a1a2e').setFontColor('#ffffff')
      .setFontWeight('bold').setFontSize(11);
    log.setFrozenRows(1);
  }

  log.getRange('A2:A5000').setNumberFormat('ddd d MMM yyyy');
  log.getRange('B2:B5000').setDataValidation(sessionValidation);
  log.getRange('F2:F5000').setDataValidation(typeValidation);

  log.setColumnWidth(1, 100);
  log.setColumnWidth(2, 65);
  log.setColumnWidth(3, 55);
  log.setColumnWidth(4, 170);
  log.setColumnWidth(5, 45);
  log.setColumnWidth(6, 55);
  log.setColumnWidth(7, 90);
  log.setColumnWidth(8, 55);
  log.setColumnWidth(9, 45);
  log.setColumnWidth(10, 200);

  // ── Programs ───────────────────────────────────────────────────────────────
  const programs = _setupProgramsTab(ss);

  // ── Reference + analysis tabs ──────────────────────────────────────────────
  // Order matters: Exercises before Best Lifts (its dropdown reads Exercises),
  // and Mesos before Set Volume (its meso selector reads Mesos).
  const exercises   = setupExercisesTab(ss);
  const mesos       = setupMesosTab(ss);
  const setVolume   = setupSetVolumeTab(ss);
  const volumeGuide = setupVolumeGuideTab(ss);
  const bestLifts   = setupBestLiftsTab(ss);

  // ── Tab order ──────────────────────────────────────────────────────────────
  ss.setActiveSheet(today);       ss.moveActiveSheet(1);
  ss.setActiveSheet(ref);         ss.moveActiveSheet(2);
  ss.setActiveSheet(log);         ss.moveActiveSheet(3);
  ss.setActiveSheet(programs);    ss.moveActiveSheet(4);
  ss.setActiveSheet(exercises);   ss.moveActiveSheet(5);
  ss.setActiveSheet(mesos);       ss.moveActiveSheet(6);
  ss.setActiveSheet(setVolume);   ss.moveActiveSheet(7);
  ss.setActiveSheet(volumeGuide); ss.moveActiveSheet(8);
  ss.setActiveSheet(bestLifts);   ss.moveActiveSheet(9);
  ss.setActiveSheet(settings);    ss.moveActiveSheet(10);

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);

  ss.setActiveSheet(today);
  SpreadsheetApp.getUi().alert(
    'Setup complete! All 10 tabs are ready:\n\n' +
    'Today · Ref · Log · Programs · Exercises · Mesos · Set Volume · Volume Guide · Best Lifts · Settings\n\n' +
    'Next steps:\n' +
    '1. On the Settings tab, replace the example session types (Push/Pull/Legs) with your own.\n' +
    '2. Reload the sheet, then run Workout > "Set up triggers (run once)".'
  );
}

// ── SET VOLUME ────────────────────────────────────────────────────────────────
// Calculates working sets per muscle group per week from the Log.
// Set count per exercise = MAX(set number) for that exercise in that session/week.
// This correctly handles RP sets (which share a set number with their preceding W set)
// and excludes warmups (WU).

function refreshSetVolume() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const volSh  = ss.getSheetByName('Set Volume');
  const logSh  = ss.getSheetByName('Log');
  const exSh   = ss.getSheetByName('Exercises');
  const mesoSh = ss.getSheetByName('Mesos');

  Logger.log('Tabs found — Set Volume: %s, Log: %s, Exercises: %s, Mesos: %s', !!volSh, !!logSh, !!exSh, !!mesoSh);
  if (!volSh || !logSh || !exSh) {
    Logger.log('Missing tab — aborting. Tab names in sheet: %s',
      ss.getSheets().map(s => s.getName()).join(', '));
    return;
  }

  // ── Mesos tab: get date range for the current meso ────────────────────────
  const mesoName = String(volSh.getRange('B1').getValue()).trim();
  let mesoStart = null, mesoEnd = null;
  if (mesoSh) {
    const mesoData = mesoSh.getDataRange().getValues();
    // Cols: 0=Meso, 1=Start Date, 2=Weeks, 3=End Date (auto)
    for (let i = 1; i < mesoData.length; i++) {
      if (String(mesoData[i][0]).trim() === mesoName) {
        mesoStart = new Date(mesoData[i][1]);
        mesoEnd   = new Date(mesoData[i][3]);
        break;
      }
    }
  }
  Logger.log('Meso: %s | Start: %s | End: %s', mesoName, mesoStart, mesoEnd);

  // ── Exercises tab: build name → fractional allocations map ───────────────
  const exData    = exSh.getDataRange().getValues();
  const exHeaders = exData[0].slice(2).map(h => String(h).trim());
  const exMap     = {};
  for (let i = 1; i < exData.length; i++) {
    const name = String(exData[i][0]).trim();
    if (!name) continue;
    exMap[name] = exData[i].slice(2).map(v => Number(v) || 0);
  }
  Logger.log('Exercises tab: %s exercises loaded', Object.keys(exMap).length);

  // ── Set Volume tab: read structure ────────────────────────────────────────
  // Col B = Meso Target (manual, never touched here). Week data starts at col C.
  const lastCol    = volSh.getLastColumn();
  const weekCount  = volSh.getRange(4, 3, 1, Math.max(0, lastCol - 2)).getValues()[0]
                          .filter(h => h !== '').length;
  const muscleCount = volSh.getLastRow() - 4;
  const muscleRows  = volSh.getRange(5, 1, muscleCount, 1).getValues()
                           .flat().map(v => String(v).trim());
  Logger.log('Set Volume tab: %s weeks, %s muscle groups', weekCount, muscleRows.length);

  // ── Log: filter by meso date range, then group by (week, session, exercise)
  // and find MAX set number per group (excludes WU; RP shares set# with W)
  const logData   = logSh.getDataRange().getValues();
  const maxSetMap = {};
  let skippedMeso = 0;

  for (let i = 1; i < logData.length; i++) {
    const row = logData[i];
    if (!row[0]) continue;

    // Filter to current meso by date
    if (mesoStart && mesoEnd) {
      const rowDate = new Date(row[0]);
      if (rowDate < mesoStart || rowDate > mesoEnd) { skippedMeso++; continue; }
    }

    const type = String(row[5]).trim().toUpperCase();
    if (type === 'WU') continue;

    const week    = Number(row[2]);
    const session = String(row[1]).trim();
    const exName  = String(row[3]).trim();
    const setNum  = Number(row[4]);
    if (!week || !exName || isNaN(setNum)) continue;

    const key = `${week}|||${session}|||${exName}`;
    if (!(key in maxSetMap) || setNum > maxSetMap[key]) {
      maxSetMap[key] = setNum;
    }
  }
  Logger.log('Log rows skipped (other mesos): %s', skippedMeso);
  Logger.log('Log: %s unique (week, session, exercise) combinations for this meso', Object.keys(maxSetMap).length);
  Logger.log('Sample keys: %s', Object.keys(maxSetMap).slice(0, 3).join(' | '));

  // ── Sum fractional volume per muscle group per week ───────────────────────
  const weekVol = {};
  for (let w = 1; w <= weekCount; w++) weekVol[w] = {};

  const unmatchedExercises = new Set();
  for (const [key, maxSet] of Object.entries(maxSetMap)) {
    const parts  = key.split('|||');
    const week   = Number(parts[0]);
    const exName = parts[2];
    if (!weekVol[week]) continue;
    const fracs  = exMap[exName];
    if (!fracs) { unmatchedExercises.add(exName); continue; }

    exHeaders.forEach((muscle, idx) => {
      if (!fracs[idx]) return;
      weekVol[week][muscle] = (weekVol[week][muscle] || 0) + maxSet * fracs[idx];
    });
  }
  if (unmatchedExercises.size > 0) {
    Logger.log('Exercises in Log not found in Exercises tab (no volume counted): %s', [...unmatchedExercises].join(', '));
  }
  Logger.log('Week 1 volume sample: %s', JSON.stringify(weekVol[1]));

  // ── Write to Set Volume tab (rows 5+, columns C+) ─────────────────────────
  const output = muscleRows.map(muscle => {
    const row = [];
    for (let w = 1; w <= weekCount; w++) {
      const val = weekVol[w] && weekVol[w][muscle] ? weekVol[w][muscle] : 0;
      row.push(Math.round(val * 10) / 10);
    }
    return row;
  });

  volSh.getRange(5, 3, output.length, weekCount).setValues(output);
  Logger.log('Done — wrote %s rows x %s week columns', output.length, weekCount);
  ss.toast('Set Volume refreshed', 'Done', 3);
}

// ── SETUP SET VOLUME TARGETS ─────────────────────────────────────────────────
// Idempotent. Configures col B of Set Volume as the Meso Target column with a
// dropdown (Build / Maintenance / Not targeted). Handles three states:
//   1. Already set up (B4 === 'Meso Target')           → no-op
//   2. Week headers currently sit in col B             → shift rows 4+ right by
//                                                        one column, then write
//                                                        header + dropdown to B
//      (B1 meso selector and B2 refresh checkbox stay put — only rows 4+ move)
//   3. Fresh sheet, col B at row 4+ is empty           → just write header +
//                                                        dropdown to B
function setupSetVolumeTargets() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const volSh = ss.getSheetByName('Set Volume');
  if (!volSh) {
    SpreadsheetApp.getUi().alert('Set Volume tab not found.');
    return;
  }

  const TARGET_HEADER  = 'Meso Target';
  const TARGET_OPTIONS = ['Build', 'Maintenance', 'Not targeted'];
  const b4 = String(volSh.getRange(4, 2).getValue()).trim();

  // State 1: already configured
  if (b4 === TARGET_HEADER) {
    ss.toast('Meso Target column already set up', 'No changes', 3);
    return;
  }

  const lastCol = volSh.getLastColumn();
  const lastRow = volSh.getLastRow();
  const looksLikeWeekHeader = /^Wk\s+\d+/i.test(b4);

  // State 2: existing week data in col B — shift rows 4+ right by one column.
  // We can't use insertColumnBefore(2) because it would also move B1 (meso)
  // and B2 (refresh checkbox), breaking the onEdit handler.
  if (looksLikeWeekHeader && lastCol >= 2 && lastRow >= 4) {
    const rowsToShift = lastRow - 3;          // rows 4..lastRow
    const colsToShift = lastCol - 1;          // cols B..lastCol
    const src   = volSh.getRange(4, 2, rowsToShift, colsToShift);
    const dest  = volSh.getRange(4, 3, rowsToShift, colsToShift);
    // Make sure we have room to shift into.
    if (volSh.getMaxColumns() < lastCol + 1) {
      volSh.insertColumnsAfter(volSh.getMaxColumns(), 1);
    }
    src.copyTo(dest, { contentsOnly: false });  // values + formats + validation
    src.clear({ contentsOnly: true });
  }

  // Write the Meso Target header to B4.
  volSh.getRange(4, 2).setValue(TARGET_HEADER);

  // Apply the dropdown validation to B5:B (down to current last row, min 50 rows
  // so there's room as muscle groups are added).
  const validationRows = Math.max(50, volSh.getLastRow() - 4);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(TARGET_OPTIONS, true)
    .setAllowInvalid(false)
    .build();
  volSh.getRange(5, 2, validationRows, 1).setDataValidation(rule);

  ss.toast('Meso Target column configured', 'Done', 3);
}

// ── BEST LIFTS ───────────────────────────────────────────────────────────────
// For each exercise the user has put in Best Lifts col A (dropdown, user-curated),
// looks up PRs in the Log and stamps results into cols B–H. Only working sets
// (Type = W) count. See prds/spec_best-lifts.md for the full design.
//
// Best Weight (B) = max weight ever lifted on a W set for this exercise.
//   Reps (C)      = reps at that weight; tiebreak = most reps, then most recent.
//   Date (D)      = date of that row.
//   ×BW   (E)     = B / Bodyweight (B2).
// Est. 1RM (F)    = max of Epley-adjusted 1RM across all W sets for this exercise.
//                   formula: weight × (1 + (reps + RIR) / 30); blank RIR → 0.
//   Date (G)      = date of that row.
// 1RM×BW (H)      = F / Bodyweight (B2).
//
// Refresh trigger: D2 checkbox (handled in handleEdit) or menu item.
// Timestamp written to G2: "Last updated: dd MMM yyyy HH:mm".

function refreshBestLifts() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const blSh   = ss.getSheetByName('Best Lifts');
  const logSh  = ss.getSheetByName('Log');
  if (!blSh || !logSh) {
    Logger.log('Missing tab — Best Lifts: %s, Log: %s', !!blSh, !!logSh);
    return;
  }

  const bodyweight = Number(blSh.getRange('B2').getValue()) || 0;
  Logger.log('Bodyweight: %s', bodyweight);

  // ── Build per-exercise PR data from Log ───────────────────────────────────
  // Log cols: 0=Date, 1=Session, 2=Week, 3=Exercise, 4=Set, 5=Type,
  //           6=Weight, 7=Reps, 8=RIR, 9=Notes
  const logData = logSh.getDataRange().getValues();
  const tz      = Session.getScriptTimeZone();

  // For each exercise, track:
  //   bestWeight: { weight, reps, date }  — highest weight; tiebreak most reps, then most recent
  //   best1RM:    { est, date }           — highest Epley × RIR estimate
  const prs = {};

  for (let i = 1; i < logData.length; i++) {
    const row = logData[i];
    if (!row[0]) continue;
    if (String(row[5]).trim().toUpperCase() !== 'W') continue;

    const exName = String(row[3]).trim();
    // Guard against Date values (e.g. Sheets parsed "3/2" in RIR as March 2 → Date object)
    // and any other non-numeric junk by treating them as invalid.
    const toNum = v => (v === '' || v === null || v instanceof Date) ? NaN : Number(v);
    const weight = toNum(row[6]);
    const reps   = toNum(row[7]);
    const rirRaw = toNum(row[8]);
    const rir    = isFinite(rirRaw) ? rirRaw : 0;   // blank / bad RIR → 0
    const date   = new Date(row[0]);
    if (!exName || !isFinite(weight) || !isFinite(reps)) continue;

    if (!prs[exName]) prs[exName] = { bestWeight: null, best1RM: null };
    const ex = prs[exName];

    // Best weight tiebreak: higher weight > more reps > more recent date
    const bw = ex.bestWeight;
    const beatsBest =
      !bw ||
      weight > bw.weight ||
      (weight === bw.weight && reps > bw.reps) ||
      (weight === bw.weight && reps === bw.reps && date > bw.date);
    if (beatsBest) ex.bestWeight = { weight, reps, date };

    // Est. 1RM via Epley adjusted for RIR
    const est = weight * (1 + (reps + rir) / 30);
    if (!ex.best1RM || est > ex.best1RM.est) {
      ex.best1RM = { est, date };
    }
  }
  Logger.log('PRs computed for %s exercises', Object.keys(prs).length);

  // ── Walk Best Lifts col A (rows 5+) and write B–H ─────────────────────────
  const lastRow = blSh.getLastRow();
  if (lastRow < 5) {
    blSh.getRange('G2').setValue('Last updated: ' + Utilities.formatDate(new Date(), tz, 'dd MMM yyyy HH:mm'));
    ss.toast('Best Lifts refreshed (no exercises selected)', 'Done', 3);
    return;
  }

  const numRows = lastRow - 4;
  const colA    = blSh.getRange(5, 1, numRows, 1).getValues().flat();
  const output  = colA.map(rawName => {
    const name = String(rawName).trim();
    if (!name) return ['', '', '', '', '', '', ''];  // clear B–H for empty rows

    const ex = prs[name];
    if (!ex || !ex.bestWeight) return ['', '', '', '', '', '', ''];  // no W sets yet

    const bw       = ex.bestWeight;
    const bwRatio  = bodyweight > 0 ? bw.weight / bodyweight : '';
    const est      = ex.best1RM.est;
    const estRatio = bodyweight > 0 ? est / bodyweight : '';
    const dateStr  = Utilities.formatDate(bw.date,         tz, 'd MMM yyyy');
    const estDate  = Utilities.formatDate(ex.best1RM.date, tz, 'd MMM yyyy');

    return [
      bw.weight,
      bw.reps,
      dateStr,
      bwRatio === '' ? '' : Math.round(bwRatio * 100) / 100,
      Math.round(est * 10) / 10,
      estDate,
      estRatio === '' ? '' : Math.round(estRatio * 100) / 100,
    ];
  });

  blSh.getRange(5, 2, numRows, 7).setValues(output);
  blSh.getRange('G2').setValue('Last updated: ' + Utilities.formatDate(new Date(), tz, 'dd MMM yyyy HH:mm'));
  Logger.log('Wrote %s rows to Best Lifts', numRows);
  ss.toast('Best Lifts refreshed', 'Done', 3);
}

// ── SETUP: EXERCISES TAB ──────────────────────────────────────────────────────
// Builds the exercise library (name, primary muscle, 22 fractional muscle
// allocations, source) and pre-fills it from EXERCISE_LIBRARY_CSV.
// Schema matches what refreshSetVolume() (reads from col C onward) and
// applySwapDropdowns() (cols A/B) expect — do not change those readers.

function setupExercisesTab(ss) {
  let sh = ss.getSheetByName('Exercises');
  if (!sh) sh = ss.insertSheet('Exercises');
  else sh.clear();

  const header = ['Exercise', 'Primary Muscle'].concat(MUSCLE_GROUPS).concat(['Source']);
  sh.getRange(1, 1, 1, header.length)
    .setValues([header])
    .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);

  const rows = _parseExerciseLibrary();
  if (rows.length > 0) sh.getRange(2, 1, rows.length, header.length).setValues(rows);

  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.setColumnWidth(1, 280);   // Exercise
  sh.setColumnWidth(2, 110);   // Primary Muscle
  for (let c = 3; c <= 2 + MUSCLE_GROUPS.length; c++) sh.setColumnWidth(c, 58);
  sh.setColumnWidth(header.length, 70); // Source
  return sh;
}

// ── SETUP: MESOS TAB ──────────────────────────────────────────────────────────
// Date range per training block. End Date auto-computes from Start + Weeks.
// refreshSetVolume() matches the meso in Set Volume B1 against col A and filters
// the Log to the [Start Date (B), End Date (D)] range.

function setupMesosTab(ss) {
  let sh = ss.getSheetByName('Mesos');
  if (!sh) sh = ss.insertSheet('Mesos');
  else sh.clear();

  sh.getRange('A1:E1')
    .setValues([['Meso', 'Start Date', 'Weeks', 'End Date (auto)', 'Notes']])
    .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);
  sh.setFrozenRows(1);

  // Auto End Date for rows 2..200: Start + Weeks*7 - 1 (inclusive last day).
  const endFormulas = [];
  for (let r = 2; r <= 200; r++) {
    endFormulas.push(['=IF(OR($A' + r + '="",$B' + r + '="",$C' + r + '=""),"",$B' + r + '+$C' + r + '*7-1)']);
  }
  sh.getRange(2, 4, endFormulas.length, 1).setFormulas(endFormulas);

  sh.getRange('B2:B200').setNumberFormat('yyyy-mm-dd');
  sh.getRange('D2:D200').setNumberFormat('yyyy-mm-dd');

  // One clearly-labelled example row — overwrite with your real first meso.
  sh.getRange('A2:C2').setValues([['Example meso', new Date(), 4]]);
  sh.getRange('E2').setValue('← overwrite this row with your first training block');

  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(2, 100);
  sh.setColumnWidth(3, 60);
  sh.setColumnWidth(4, 120);
  sh.setColumnWidth(5, 280);
  return sh;
}

// ── SETUP: SET VOLUME TAB ─────────────────────────────────────────────────────
// B1 = meso selector (dropdown of Mesos names). B2 = refresh checkbox (handled in
// handleEdit). Row 4 = headers (Muscle Group | Meso Target | Wk 1 …). Rows 5+ =
// one row per muscle group. refreshSetVolume() derives the week count from row 4
// and the muscle list from rows 5+, then writes results into C5 onward.

function setupSetVolumeTab(ss) {
  let sh = ss.getSheetByName('Set Volume');
  if (!sh) sh = ss.insertSheet('Set Volume');
  else sh.clear();

  // Row 1: meso selector
  sh.getRange('A1').setValue('Meso').setFontWeight('bold');
  const mesos = ss.getSheetByName('Mesos');
  if (mesos) {
    sh.getRange('B1').setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(mesos.getRange('A2:A200'), true)
        .setAllowInvalid(true).build()
    );
  }
  sh.getRange('B1').setNote('Pick the meso to calculate volume for (must match a row in the Mesos tab)');

  // Row 2: refresh checkbox
  sh.getRange('A2').setValue('↻ Refresh').setFontWeight('bold');
  sh.getRange('B2').insertCheckboxes();
  sh.getRange('B2').setNote('Tick to recalculate volume from the Log for the meso in B1');

  // Row 3: title banner
  sh.getRange('A3:H3').merge()
    .setValue('SET VOLUME — working sets per muscle group per week  |  excludes warmups (WU)')
    .setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center');

  // Row 4: headers (Muscle Group | Meso Target | Wk 1 … Wk 6)
  sh.getRange('A4').setValue('Muscle Group');
  sh.getRange('B4').setValue('Meso Target');
  const weekHeaders = [];
  for (let w = 1; w <= 6; w++) weekHeaders.push('Wk ' + w);
  sh.getRange(4, 3, 1, weekHeaders.length).setValues([weekHeaders]);
  sh.getRange(4, 1, 1, 2 + weekHeaders.length).setBackground('#cccccc').setFontWeight('bold');
  sh.setFrozenRows(4);
  sh.setFrozenColumns(2);

  // Rows 5+: muscle groups
  const muscleRows = MUSCLE_GROUPS.map(m => [m]);
  sh.getRange(5, 1, muscleRows.length, 1).setValues(muscleRows);

  // Meso Target dropdown on the muscle rows
  sh.getRange(5, 2, MUSCLE_GROUPS.length, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Build', 'Maintenance', 'Not targeted'], true)
      .setAllowInvalid(false).build()
  );

  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(2, 110);
  for (let c = 3; c < 3 + weekHeaders.length; c++) sh.setColumnWidth(c, 60);
  return sh;
}

// ── SETUP: VOLUME GUIDE TAB ───────────────────────────────────────────────────
// Static MEV/MAV/MRV reference, pre-filled from VOLUME_GUIDE_DATA. Read-only.

function setupVolumeGuideTab(ss) {
  let sh = ss.getSheetByName('Volume Guide');
  if (!sh) sh = ss.insertSheet('Volume Guide');
  else sh.clear();

  sh.getRange('A1:I1').merge()
    .setValue('WEEKLY VOLUME GUIDE — sets per muscle group per week')
    .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center');

  sh.getRange('A2:I2').merge()
    .setValue('Per-session cap: ~10 sets per muscle group regardless of training level  |  MRV is highly individual — treat as a starting point, not a hard ceiling')
    .setFontStyle('italic');

  const header = ['Muscle Group', 'Recovery', 'Beginner\nMEV → MAV', 'Intermediate\nMEV → MAV',
                  'Advanced\nMEV → MAV', 'MRV\n(approx.)', 'Focus Meso\nTarget',
                  'Indirect volume from', 'Notes'];
  sh.getRange(3, 1, 1, header.length).setValues([header])
    .setBackground('#cccccc').setFontWeight('bold').setVerticalAlignment('middle');
  sh.setFrozenRows(3);

  sh.getRange(4, 1, VOLUME_GUIDE_DATA.length, header.length).setValues(VOLUME_GUIDE_DATA);

  // Sources footer (one line per row, starting two rows below the table)
  let r = 4 + VOLUME_GUIDE_DATA.length + 1;
  VOLUME_GUIDE_SOURCES.forEach((line, i) => {
    const cell = sh.getRange(r, 1);
    cell.setValue(line);
    if (i === 0) cell.setFontWeight('bold');
    else cell.setFontStyle('italic').setWrap(false);
    r++;
  });
  // Recovery key
  sh.getRange(r + 1, 1, 1, 4).setValues([['Recovery key:', 'Fast', 'Moderate', 'Slow']]);

  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(2, 80);
  for (let c = 3; c <= 7; c++) sh.setColumnWidth(c, 90);
  sh.setColumnWidth(8, 180);
  sh.setColumnWidth(9, 340);
  return sh;
}

// ── SETUP: BEST LIFTS TAB ─────────────────────────────────────────────────────
// B2 = bodyweight (manual, blank to start). E2 = refresh checkbox (handleEdit).
// G2 = timestamp (written by refreshBestLifts). Row 4 = headers. Col A rows 5+ =
// user-picked exercises (dropdown from Exercises); refreshBestLifts fills B–H.

function setupBestLiftsTab(ss) {
  let sh = ss.getSheetByName('Best Lifts');
  if (!sh) sh = ss.insertSheet('Best Lifts');
  else sh.clear();

  sh.getRange('A1:H1').merge()
    .setValue('BEST LIFTS — all-time personal records (working sets only)')
    .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center');

  sh.getRange('A2').setValue('Bodyweight (kg)').setFontWeight('bold');
  sh.getRange('B2').setNote('Enter your bodyweight (kg) — used for the ×BW ratios');
  sh.getRange('D2').setValue('↻ Refresh').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('E2').insertCheckboxes();
  sh.getRange('E2').setNote('Tick to recompute PRs from the Log');

  sh.getRange('A3:H3').merge()
    .setValue('Best Weight and Est. 1RM may come from different sessions — a lighter set with more reps can produce a higher 1RM estimate than a heavier single.   |   Est. 1RM formula: weight × (1 + (reps + RIR) / 30) — Epley, adjusted for proximity to failure via your logged RIR.')
    .setFontStyle('italic').setWrap(true);

  const header = ['Exercise', 'Best Weight (kg)', 'Reps', 'Date', '×BW', 'Est. 1RM (kg)', 'Date', '1RM ×BW'];
  sh.getRange(4, 1, 1, header.length).setValues([header])
    .setBackground('#cccccc').setFontWeight('bold');
  sh.setFrozenRows(4);

  // Col A dropdown of exercises (rows 5+) so users pick what to track.
  const exSh = ss.getSheetByName('Exercises');
  if (exSh) {
    sh.getRange(5, 1, 200, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(exSh.getRange('A2:A500'), true)
        .setAllowInvalid(true).build()
    );
  }

  sh.setColumnWidth(1, 280);
  for (let c = 2; c <= 8; c++) sh.setColumnWidth(c, 95);
  return sh;
}

// ── SETTINGS TAB + SESSION TYPES ──────────────────────────────────────────────
// Your training split lives here, not in code. List one session per row in
// column A (e.g. Push / Pull / Legs, or Upper / Lower, or whatever you call your
// days). The Session dropdowns on Today, Log and Programs read this list live, so
// adding or renaming a session updates them automatically. If a dropdown ever
// looks stale, run Workout > "Apply Session Types (from Settings)".
//
// Existing session values keep working regardless — the engine groups history by
// whatever text is in the Session column, so the count and names are entirely
// yours.

function setupSettingsTab(ss) {
  let sh = ss.getSheetByName('Settings');
  const isNew = !sh;
  if (!sh) sh = ss.insertSheet('Settings');

  sh.getRange('A1').setValue('Session Types')
    .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);
  sh.getRange('C1').setValue(
    'List your training sessions below, one per row (e.g. Push / Pull / Legs, or ' +
    'Upper / Lower). These fill the Session dropdowns on Today, Log and Programs. ' +
    'Edit any time — the dropdowns update automatically; if not, run ' +
    'Workout > "Apply Session Types (from Settings)".'
  ).setFontStyle('italic');
  sh.setFrozenRows(1);

  // Only seed example values on first creation — never overwrite a user's list.
  if (isNew) {
    sh.getRange('A2:A4').setValues([['Push'], ['Pull'], ['Legs']]);
  }

  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 20);
  sh.setColumnWidth(3, 520);
  return sh;
}

// Data-validation rule for Session cells: a live dropdown reading the Settings
// session list. Creates the Settings tab if it's somehow missing. allowInvalid is
// true so you can still type a brand-new session before adding it to Settings.
function _sessionValidationRule(ss) {
  let settings = ss.getSheetByName('Settings');
  if (!settings) settings = setupSettingsTab(ss);
  return SpreadsheetApp.newDataValidation()
    .requireValueInRange(settings.getRange('A2:A50'), true)
    .setAllowInvalid(true)
    .build();
}

// First session type from Settings (used as the Today default). '' if none yet.
function _firstSessionType(ss) {
  const settings = ss.getSheetByName('Settings');
  if (!settings) return '';
  return String(settings.getRange('A2').getValue()).trim();
}

// Re-apply the Session dropdown to Today / Log / Programs from the Settings list.
// The dropdowns are live, so this is rarely needed — it's a "fix it" button in
// case validation gets cleared or a tab was rebuilt.
function applySessionTypes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rule = _sessionValidationRule(ss);
  const today    = ss.getSheetByName('Today');
  const log      = ss.getSheetByName('Log');
  const programs = ss.getSheetByName('Programs');
  if (today)    today.getRange('B2').setDataValidation(rule);
  if (log)      log.getRange('B2:B5000').setDataValidation(rule);
  if (programs) programs.getRange('B2:B5000').setDataValidation(rule);
  ss.toast('Session dropdowns updated from the Settings tab.', 'Done', 3);
}
