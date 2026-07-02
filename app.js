// Web Audio context — created on first user gesture to satisfy browser policy
let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function beep(freq, dur, vol = 0.4) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + dur);
}

const tick    = () => beep(550,  0.04, 0.05);
const pip     = () => beep(880,  0.14, 0.05);
const longPip = () => beep(1100, 0.75, 0.05);

// ── Wake Lock ─────────────────────────────────────────────────────────────────
// Keeps the screen from auto-locking (e.g. iPhone's 5-min timeout) while a rep is running.

let wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (err) {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release();
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && intervalId !== null) {
    acquireWakeLock();
  }
});

// ── State ────────────────────────────────────────────────────────────────────

let totalDuration = 30;
let totalReps     = 1;
let currentRep    = 0;
let remaining     = 0;
let paused        = false;
let intervalId    = null;

const CIRCUMFERENCE = 2 * Math.PI * 90; // ≈ 565.49  (matches SVG r="90")

// ── Elements ─────────────────────────────────────────────────────────────────

const setupPanel   = document.getElementById('setupPanel');
const timerPanel   = document.getElementById('timerPanel');
const durationEl   = document.getElementById('duration');
const repsEl       = document.getElementById('reps');
const startBtn     = document.getElementById('startBtn');
const pauseBtn     = document.getElementById('pauseBtn');
const stopBtn      = document.getElementById('stopBtn');
const display      = document.getElementById('timerDisplay');
const statusMsg    = document.getElementById('statusMsg');
const ringProgress = document.getElementById('ringProgress');
const repBadge     = document.getElementById('repBadge');
const currentRepEl = document.getElementById('currentRep');
const totalRepsEl  = document.getElementById('totalReps');

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(s) {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function setProgress(s) {
  const offset = CIRCUMFERENCE * (1 - s / totalDuration);
  ringProgress.style.strokeDashoffset = offset;
}

function applyWarning() {
  display.className      = 'warning';
  ringProgress.className = 'ring-progress warning';
}

function applyNormal() {
  display.className      = '';
  ringProgress.className = 'ring-progress';
}

function applyDone() {
  display.className      = 'done';
  ringProgress.className = 'ring-progress done';
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function tickStep() {
  if (paused) return;

  remaining--;
  display.textContent = fmt(remaining);
  setProgress(remaining);

  if (remaining <= 0) {
    clearInterval(intervalId);
    intervalId = null;
    longPip();
    applyDone();

    if (currentRep < totalReps) {
      statusMsg.textContent = 'Rest…';
      statusMsg.className   = '';
      setTimeout(beginRep, 2500);
    } else {
      statusMsg.textContent = 'Done!';
      statusMsg.className   = 'highlight';
      setTimeout(reset, 3500);
    }
    return;
  }

  if (remaining <= 5) {
    pip();
    applyWarning();
    statusMsg.textContent = remaining + '…';
  } else {
    tick();
    applyNormal();
    statusMsg.textContent = '';
  }
}

function beginRep() {
  currentRep++;
  remaining = totalDuration;

  display.textContent = fmt(remaining);
  applyNormal();
  setProgress(remaining);
  statusMsg.textContent = '';
  statusMsg.className   = '';
  currentRepEl.textContent = currentRep;

  intervalId = setInterval(tickStep, 1000);
}

// ── Controls ──────────────────────────────────────────────────────────────────

function startTimer() {
  totalDuration = Math.max(1, parseInt(durationEl.value, 10) || 30);
  totalReps     = Math.max(1, parseInt(repsEl.value,      10) || 1);
  currentRep    = 0;
  paused        = false;
  pauseBtn.textContent = 'Pause';

  totalRepsEl.textContent = totalReps;
  repBadge.classList.toggle('hidden', totalReps === 1);

  setupPanel.classList.add('hidden');
  timerPanel.classList.remove('hidden');

  // Resume audio context if suspended (some browsers require this)
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  acquireWakeLock();
  beginRep();
}

function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  if (!paused && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function reset() {
  clearInterval(intervalId);
  intervalId = null;
  paused     = false;
  pauseBtn.textContent = 'Pause';
  releaseWakeLock();

  timerPanel.classList.add('hidden');
  setupPanel.classList.remove('hidden');

  display.textContent       = fmt(parseInt(durationEl.value, 10) || 30);
  display.className         = '';
  ringProgress.className    = 'ring-progress';
  ringProgress.style.strokeDashoffset = 0;
  statusMsg.textContent     = '';
  statusMsg.className       = '';
}

// ── Persistence ───────────────────────────────────────────────────────────────

function savePrefs() {
  localStorage.setItem('timeit-duration', durationEl.value);
  localStorage.setItem('timeit-reps',     repsEl.value);
}

function loadPrefs() {
  const d = localStorage.getItem('timeit-duration');
  const r = localStorage.getItem('timeit-reps');
  if (d) durationEl.value = d;
  if (r) repsEl.value     = r;
  display.textContent = fmt(Math.max(1, parseInt(durationEl.value, 10) || 30));
}

loadPrefs();

// ── Events ────────────────────────────────────────────────────────────────────

startBtn.addEventListener('click', () => { savePrefs(); startTimer(); });
pauseBtn.addEventListener('click', togglePause);
stopBtn.addEventListener('click',  reset);

durationEl.addEventListener('input', () => {
  if (!timerPanel.classList.contains('hidden')) return;
  display.textContent = fmt(Math.max(1, parseInt(durationEl.value, 10) || 0));
});

// ── Service Worker ────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
