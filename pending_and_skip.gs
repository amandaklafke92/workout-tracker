// ─────────────────────────────────────────────────────────────────────────────
// PENDING + SKIP  —  do-later / skip dispositions for exercises
// Spec: workout-tracker (private) prds/spec_skip-and-pending.md
//
// Self-contained feature file. All new logic lives here. The core
// workout_tracker.gs carries only small, greppable hooks tagged "// [pending]":
//   1. onOpen          → _pendingOnOpen()                (lapse + indicator + toast)
//   2. handleEdit      → G3 checkbox branch → addPendingExercises()
//   3. saveToLog       → _refreshPendingIndicator(ss)    (fulfil + lapse + count)
//   4. refreshSetVolume→ exclude PENDING/SKIP from the set count
//   (+ two menu items in onOpen)
// To remove the feature: delete this file and the "// [pending]" lines.
//
// Model (per spec): a disposition is one Log row with Type = PENDING or SKIP and
// blank weight/reps, keyed by Exercise + Session + Week ("home" session/week).
//   • PENDING = do-later. Temporary marker; auto-deleted once a real W row exists
//     for its key, and auto-converted to SKIP once the program moves on — i.e. a
//     real session is logged in a *different program-week* after it (keyed on the
//     Week number, not session name).
//   • SKIP    = not this week. Terminal record. Excluded from volume.
// Set structure is never stored on the placeholder — when pulled back in it is
// rebuilt from the Programs tab (set count) + last W session in the Log (loads),
// exactly like loadLastSession.
// ─────────────────────────────────────────────────────────────────────────────

const PENDING_TYPE        = 'PENDING';
const SKIP_TYPE           = 'SKIP';
const PENDING_IND_RANGE   = 'C3:F3';    // Today: indicator label (merged)
const PENDING_BOX_CELL    = 'G3';       // Today: "add pending" checkbox

// Midnight timestamp for a date — so fulfilment compares whole days, not instants.
function _dayTs(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// ── Log normalisation: fulfil + dedup + lapse, in one pass ───────────────────
// Returns the count of OPEN pendings (current program-week, unfulfilled, unique).
// Generalised fulfilment: any PENDING whose key has *any* W row is removed — so
// it self-heals whether the make-up was logged via "add pending" or by hand.
function _normalizePendings(ss) {
  const log = ss.getSheetByName('Log');
  if (!log) return 0;
  const data = log.getDataRange().getValues();

  // Real working sets: latest day per key (for fulfilment) + (date, week) for lapse.
  // wLastDay must be date-aware: Week numbers repeat across mesos, so the same
  // (exercise, session, week) key recurs — only a W *on or after* the deferral
  // day fulfils a pending, never an old meso's matching key.
  const wLastDay = {};   // key -> latest W day-timestamp
  const wWeeks   = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][5]).trim().toUpperCase() !== 'W') continue;
    const wd = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][0]);
    if (isNaN(wd)) continue;
    const key = `${data[i][3]}|||${data[i][1]}|||${data[i][2]}`;
    const day = _dayTs(wd);
    if (!(key in wLastDay) || day > wLastDay[key]) wLastDay[key] = day;
    const ww = Number(data[i][2]);
    if (!isNaN(ww)) wWeeks.push({ date: wd, week: ww });
  }

  const seen = new Set();
  const toDelete = [];
  let openCount = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][5]).trim().toUpperCase() !== PENDING_TYPE) continue;
    const key   = `${data[i][3]}|||${data[i][1]}|||${data[i][2]}`;
    const dp    = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][0]);
    const dpDay = isNaN(dp) ? null : _dayTs(dp);

    // Fulfilled: a real W set for this key exists ON OR AFTER the deferral day.
    if (dpDay !== null && key in wLastDay && wLastDay[key] >= dpDay) { toDelete.push(i + 1); continue; }
    if (seen.has(key)) { toDelete.push(i + 1); continue; }   // duplicate → collapse
    seen.add(key);
    // Lapse: a real session logged AFTER this, in a different program-week — keyed
    // on the Week number, NOT session name (names change meso-to-meso); a meso
    // reset reads as a lower week and still counts as "moved on".
    const np = Number(data[i][2]);
    const movedOn = dpDay !== null && !isNaN(np) && wWeeks.some(w => w.date > dp && w.week !== np);
    if (movedOn) {
      log.getRange(i + 1, 6).setValue(SKIP_TYPE);             // lapsed → SKIP (col F=Type)
      continue;
    }
    openCount++;
  }
  toDelete.sort((a, b) => b - a).forEach(r => log.deleteRow(r));
  return openCount;
}

// List of current open pendings (after normalising). One entry per exercise.
function _openPendings(ss) {
  const log = ss.getSheetByName('Log');
  if (!log) return [];
  const data = log.getDataRange().getValues();
  const wLastDay = {};   // key -> latest W day-timestamp (date-gated, like _normalizePendings)
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][5]).trim().toUpperCase() !== 'W') continue;
    const wd = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][0]);
    if (isNaN(wd)) continue;
    const key = `${data[i][3]}|||${data[i][1]}|||${data[i][2]}`;
    const day = _dayTs(wd);
    if (!(key in wLastDay) || day > wLastDay[key]) wLastDay[key] = day;
  }
  const seen = new Set(), out = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][5]).trim().toUpperCase() !== PENDING_TYPE) continue;
    const key   = `${data[i][3]}|||${data[i][1]}|||${data[i][2]}`;
    const dp    = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][0]);
    const dpDay = isNaN(dp) ? null : _dayTs(dp);
    if (dpDay !== null && key in wLastDay && wLastDay[key] >= dpDay) continue;  // fulfilled (on/after deferral)
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ exercise: data[i][3], session: data[i][1], week: data[i][2], date: data[i][0] });
  }
  return out;
}

// ── Today indicator + on-open nudge ──────────────────────────────────────────
function _refreshPendingIndicator(ss) {
  const today = ss.getSheetByName('Today');
  if (!today) return 0;
  const n = _normalizePendings(ss);
  today.getRange(PENDING_IND_RANGE).setValue(n > 0 ? `⏳ ${n} pending — tick to add →` : '');
  return n;
}

function _pendingOnOpen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const n = _refreshPendingIndicator(ss);
  if (n > 0) ss.toast(`You have ${n} pending exercise${n === 1 ? '' : 's'} to do.`, '⏳ Pending', 6);
}

// ── Add pending → load into a fresh session batch (Model A) ──────────────────
function addPendingExercises() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const today = ss.getSheetByName('Today');
  const ui    = SpreadsheetApp.getUi();
  if (!today) { ui.alert('Today tab not found.'); return; }

  _refreshPendingIndicator(ss);          // normalise first (fulfil / dedup / lapse)
  const pend = _openPendings(ss);
  if (!pend.length) { ss.toast('No pending exercises.', 'Pending', 4); return; }

  // Don't clobber an in-progress session.
  const existing = today.getRange('A7:A200').getValues().flat().filter(v => v !== '');
  if (existing.length > 0) {
    ui.alert('Today already has exercises loaded',
      'Save or clear the current session first, then add pending exercises into a fresh grid.',
      ui.ButtonSet.OK);
    return;
  }

  // Group by home session; if more than one, let the user pick (per spec §8.2).
  const bySession = {};
  pend.forEach(p => { (bySession[p.session] = bySession[p.session] || []).push(p); });
  const sessions = Object.keys(bySession);
  let chosen = sessions[0];
  if (sessions.length > 1) {
    const menu = sessions.map((s, i) => `${i + 1} = ${s}  (${bySession[s].length})`).join('\n');
    const resp = ui.prompt('Add pending exercises',
      `Pending work spans several sessions:\n\n${menu}\n\nType the number to load:`,
      ui.ButtonSet.OK_CANCEL);
    if (resp.getSelectedButton() !== ui.Button.OK) return;
    const idx = parseInt(resp.getResponseText().trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= sessions.length) { ui.alert('Invalid choice.'); return; }
    chosen = sessions[idx];
  }

  const group = bySession[chosen];
  const week  = group[0].week;        // keep the pendings' original week
  _setTodayMeta(today, chosen, week); // programmatic — does NOT re-trigger load

  const rows = _buildPendingRows(ss, chosen, group);
  if (rows.length) {
    today.getRange(7, 1, rows.length, 7).setValues(rows);
    today.getRange('H7:H200').clearContent();
    if (typeof applySwapDropdowns === 'function') applySwapDropdowns(today);
  }
  ss.toast(`Loaded ${group.length} pending from ${chosen} (week ${week}). Log them and tick D4 to save.`,
           'Pending', 6);
}

// Write Session + Week into the Today meta block (label-scanned, like getTodayMeta).
function _setTodayMeta(today, session, week) {
  const meta = today.getRange('A1:B5').getValues();
  for (let i = 0; i < meta.length; i++) {
    const label = String(meta[i][0]).trim().toLowerCase();
    if (label === 'session') today.getRange(i + 1, 2).setValue(session);
    if (label === 'week')    today.getRange(i + 1, 2).setValue(week);
  }
}

// Rebuild rows for the pending exercises: set structure from Programs, last W
// performance (weight/reps/RIR) from the Log — mirrors loadLastSession.
function _buildPendingRows(ss, sessionType, group) {
  const logSheet = ss.getSheetByName('Log');
  const wanted   = new Set(group.map(p => String(p.exercise)));
  const logData  = logSheet.getDataRange().getValues();

  // Last W performance per exercise|||set|||type for this session.
  const perfMap = {};
  for (const row of logData.slice(1)) {
    if (row[1] !== sessionType || !row[0]) continue;
    if (String(row[5]).trim().toUpperCase() !== 'W') continue;
    const key = `${row[3]}|||${row[4]}|||${row[5]}`;
    if (!perfMap[key] || new Date(row[0]) > new Date(perfMap[key].date)) {
      perfMap[key] = { date: row[0], weight: row[6], reps: row[7], rir: row[8], notes: row[9] };
    }
  }

  const rows = [];
  const program = (typeof getProgramForSession === 'function') ? getProgramForSession(ss, sessionType) : null;
  if (program) {
    for (const pr of program.rows) {          // cols: …,2 exercise,3 set,4 type
      if (pr[2] === 'Exercise' || !wanted.has(String(pr[2]))) continue;
      const perf = perfMap[`${pr[2]}|||${pr[3]}|||${pr[4]}`] || {};
      rows.push([pr[2], pr[3], pr[4], perf.weight ?? '', perf.reps ?? '', perf.rir ?? '', perf.notes ?? '']);
    }
  }
  // Any pending not covered by a program → one W row from its last performance.
  for (const p of group) {
    if (rows.some(r => String(r[0]) === String(p.exercise))) continue;
    let last = null;
    for (const row of logData.slice(1)) {
      if (row[1] !== sessionType || String(row[3]) !== String(p.exercise)) continue;
      if (String(row[5]).trim().toUpperCase() !== 'W') continue;
      if (!last || new Date(row[0]) > new Date(last.date)) {
        last = { date: row[0], weight: row[6], reps: row[7], rir: row[8] };
      }
    }
    rows.push([p.exercise, 1, 'W', last ? last.weight : '', last ? last.reps : '', last ? last.rir : '', '']);
  }
  return rows;
}

// ── One-time migration: add the feature to an existing sheet (no rebuild) ─────
function setupPendingFeature() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const today = ss.getSheetByName('Today');
  if (!today) { SpreadsheetApp.getUi().alert('Today tab not found.'); return; }

  // 1. Extend the Today Type dropdown with PENDING / SKIP.
  const typeValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['W', 'D', 'WU', 'RP', PENDING_TYPE, SKIP_TYPE], true)
    .build();
  today.getRange('C7:C200').setDataValidation(typeValidation);

  // 2. Indicator (C3:F3) + add-pending checkbox (G3) in the free row-3 header slot.
  today.getRange(PENDING_IND_RANGE).breakApart();
  today.getRange(PENDING_IND_RANGE).merge()
    .setHorizontalAlignment('right').setFontWeight('bold').setFontSize(11)
    .setFontColor('#b06000');
  today.getRange(PENDING_BOX_CELL).insertCheckboxes();
  today.getRange(PENDING_BOX_CELL).setNote('Tick to add your pending exercises into a fresh session');

  _refreshPendingIndicator(ss);
  SpreadsheetApp.getUi().alert(
    'Pending + Skip added.\n\n' +
    '• Type cell (C7+) now offers PENDING (do later) and SKIP (not this week) — leave weight/reps blank.\n' +
    '• Today row 3 shows "⏳ N pending" with a checkbox (G3) to load them back.\n\n' +
    'Mark an exercise PENDING/SKIP and tick D4 to save as usual. When pending work is owed, ' +
    'tick G3 to load it into a fresh session (its original session + week), log it, and save. ' +
    'Unfinished pendings auto-convert to SKIP once you log a session in a later program-week.'
  );
}
