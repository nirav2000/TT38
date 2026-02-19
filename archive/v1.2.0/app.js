const VERSION = '1.2.0';
const VERSIONS = [
  { version: '1.0.0', date: '2026-02-19', notes: 'Initial TT38+ release with 1x–20x, fractions page, and analytics.', path: 'archive/v1.0.0/index.html' },
  { version: '1.0.1', date: '2026-02-19', notes: 'Polish update with improved version navigation and release archival.', path: 'archive/v1.0.1/index.html' },
  { version: '1.0.2', date: '2026-02-19', notes: 'New pink challenge look, 38-method content page, and practice module modes.', path: 'archive/v1.0.2/index.html' },
  { version: '1.0.3', date: '2026-02-19', notes: 'Semantic versioning patch update for release history consistency.', path: 'archive/v1.0.3/index.html' },
  { version: '1.0.4', date: '2026-02-19', notes: 'Focus-lock input, common error tracking, and habit-capsule improvement metrics.', path: 'archive/v1.0.4/index.html' },
  { version: '1.0.5', date: '2026-02-19', notes: 'Auto-select next incomplete easiest table and clickable labeled grid table selection.', path: 'archive/v1.0.5/index.html' },
  { version: '1.0.6', date: '2026-02-19', notes: 'iPhone/iPad-friendly visibility improvements with larger sum and answer input plus numeric keyboard hints.', path: 'archive/v1.0.6/index.html' },
  { version: '1.0.7', date: '2026-02-19', notes: 'Reduced iOS autofill prompts and tuned keyboard submit behavior.', path: 'archive/v1.0.7/index.html' },
  { version: '1.2.0', date: '2026-02-19', notes: 'Milestone release marker update to 1.2.0.', path: 'archive/v1.2.0/index.html' },
  { version: '1.3.0', date: 'Planned', notes: 'Future: printable worksheets and teacher mode.', path: 'versions/1.3.0.html' }
];

const tableSelect = document.getElementById('tableSelect');
const roundSize = document.getElementById('roundSize');
const startBtn = document.getElementById('startBtn');
const challengeArea = document.getElementById('challengeArea');
const scoreEl = document.getElementById('score');
const streakEl = document.getElementById('streak');
const avgTimeEl = document.getElementById('avgTime');
const bestTableEl = document.getElementById('bestTable');
const studentName = document.getElementById('studentName');
const recordsBody = document.getElementById('recordsBody');
const strengths = document.getElementById('strengths');
const weaknesses = document.getElementById('weaknesses');
const chart = document.getElementById('accuracyChart');
const challengeGrid = document.getElementById('challengeGrid');
const practiceSummary = document.getElementById('practiceSummary');
const overallAccuracy = document.getElementById('overallAccuracy');
const overallSpeed = document.getElementById('overallSpeed');
const trendAccuracy = document.getElementById('trendAccuracy');
const trendSpeed = document.getElementById('trendSpeed');
const capsuleScore = document.getElementById('capsuleScore');
const capsuleStreak = document.getElementById('capsuleStreak');
const commonErrors = document.getElementById('commonErrors');
const sumProgress = document.getElementById('sumProgress');

const PRACTICE_MAP = {
  square: { label: 'Square numbers', pairs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => [n, n]), table: 12 },
  easy: { label: 'Easy(ish)', pairs: [[2, 3], [2, 4], [2, 6], [3, 4], [4, 5], [5, 6], [3, 10], [4, 10]], table: 10 },
  tricky: { label: 'Tricky', pairs: [[6, 7], [7, 8], [7, 9], [8, 9], [8, 12], [9, 12], [7, 11]], table: 12 },
  '11and12': { label: '11s & 12s', pairs: [[11, 3], [11, 4], [11, 6], [12, 4], [12, 6], [12, 7], [12, 8]], table: 12 },
  nasty: { label: 'Nasty tables', pairs: [[7, 8], [8, 9], [12, 12], [9, 11], [6, 12], [7, 12], [11, 12]], table: 12 }
};

let mode = 'challenge';
let modePairs = [];
let selectedGridTable = null;
let state = {
  running: false,
  asked: 0,
  correct: 0,
  streak: 0,
  timings: [],
  startAt: 0,
  roundTotal: 20,
  current: null
};

const options = [38, ...Array.from({ length: 20 }, (_, i) => i + 1)];
options.forEach((value) => {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = `${value}× table`;
  tableSelect.append(option);
});

function keepAnswerFocus() {
  const answerInput = document.getElementById('answerInput');
  if (answerInput && state.running) {
    answerInput.focus();
    answerInput.select();
  }
}

function ensureQuestionVisibility() {
  const answerInput = document.getElementById('answerInput');
  if (!answerInput) return;
  answerInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem('tt38Records') || '[]');
  } catch {
    return [];
  }
}

function saveRecord(record) {
  const now = new Date();
  const payload = {
    ...record,
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    dayKey: now.toISOString().slice(0, 10)
  };
  const records = loadRecords();
  records.unshift(payload);
  localStorage.setItem('tt38Records', JSON.stringify(records.slice(0, 2000)));
}

function getTableStats(records = loadRecords()) {
  const summary = {};
  records.forEach((r) => {
    if (!summary[r.table]) summary[r.table] = { total: 0, ok: 0, speedSum: 0 };
    summary[r.table].total += 1;
    summary[r.table].ok += r.correct ? 1 : 0;
    summary[r.table].speedSum += r.elapsed;
  });
  return summary;
}

function isTableCompleted(table, summary) {
  const stat = summary[table];
  if (!stat || stat.total < 12) return false;
  const accuracy = stat.ok / stat.total;
  const avgSpeed = stat.speedSum / stat.total;
  return accuracy >= 0.9 && avgSpeed <= 4;
}

function setGridSelection(table) {
  selectedGridTable = table;
  tableSelect.value = table;

  challengeGrid.querySelectorAll('.grid-cell.selected').forEach((el) => el.classList.remove('selected'));

  challengeGrid.querySelectorAll(`[data-select-table="${table}"]`).forEach((el) => {
    el.classList.add('selected');
  });
}

function chooseNextIncompleteTable() {
  const summary = getTableStats();
  const candidates = Array.from({ length: 20 }, (_, i) => i + 1);
  const next = candidates.find((t) => !isTableCompleted(t, summary));
  setGridSelection(next || 38);
}

function makeHeaderCell(value, isCorner = false) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = `grid-cell grid-label${isCorner ? ' corner' : ''}`;
  cell.textContent = isCorner ? '×' : value;
  if (!isCorner) {
    cell.dataset.selectTable = String(value);
    cell.title = `Select ${value}× table`;
    cell.addEventListener('click', () => setGridSelection(value));
  }
  return cell;
}

function drawGrid() {
  challengeGrid.innerHTML = '';

  challengeGrid.append(makeHeaderCell('', true));
  for (let c = 1; c <= 12; c += 1) {
    challengeGrid.append(makeHeaderCell(c));
  }

  for (let r = 1; r <= 12; r += 1) {
    challengeGrid.append(makeHeaderCell(r));
    for (let c = 1; c <= 12; c += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'grid-cell';
      const important = r === c || r >= 7 || c >= 11;
      if (important) cell.classList.add('important');
      cell.textContent = `${r}×${c}`;
      cell.dataset.selectTable = String(Math.min(r, c));
      cell.title = `Select ${Math.min(r, c)}× table`;
      cell.addEventListener('click', () => setGridSelection(Math.min(r, c)));
      challengeGrid.append(cell);
    }
  }

  setGridSelection(Number(tableSelect.value));
}

function pickQuestion() {
  if (modePairs.length) {
    const pair = modePairs[Math.floor(Math.random() * modePairs.length)];
    return { a: pair[0], b: pair[1] };
  }
  const table = Number(tableSelect.value);
  const b = Math.floor(Math.random() * 12) + 1;
  return { a: table, b };
}

function nextQuestion() {
  if (!state.running) return;
  if (state.asked >= state.roundTotal) {
    challengeArea.innerHTML = '<p class="prompt">Round complete! Open Tracking for strengths, weaknesses, error patterns, and progress trends.</p>';
    state.running = false;
    refreshAnalytics();
    chooseNextIncompleteTable();
    return;
  }

  state.current = pickQuestion();
  state.startAt = performance.now();

  challengeArea.innerHTML = `
    <p class="mode-pill">${mode === 'challenge' ? 'Challenge mode' : `Practice mode · ${practiceSummary.textContent}`}</p>
    <p class="sum">${state.current.a} × ${state.current.b} = ?</p>
    <form id="answerForm" autocomplete="off">
      <input id="answerInput" name="tt38-answer" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" required />
      <button class="lime" type="submit">Submit</button>
    </form>
    <p class="feedback" id="feedback"></p>
  `;

  const form = document.getElementById('answerForm');
  const answerInput = document.getElementById('answerInput');
  const feedback = document.getElementById('feedback');

  keepAnswerFocus();
  ensureQuestionVisibility();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const elapsed = (performance.now() - state.startAt) / 1000;
    const expected = state.current.a * state.current.b;
    const answer = Number(answerInput.value.trim());
    const ok = answer === expected;

    state.asked += 1;
    if (ok) {
      state.correct += 1;
      state.streak += 1;
      feedback.textContent = 'Correct!';
      feedback.className = 'feedback good';
    } else {
      state.streak = 0;
      feedback.textContent = `Not this time. Correct answer: ${expected}`;
      feedback.className = 'feedback bad';
    }

    state.timings.push(elapsed);
    saveRecord({
      user: studentName.value.trim() || 'Anonymous',
      table: state.current.a,
      sum: `${state.current.a} × ${state.current.b}`,
      answer,
      expected,
      correct: ok,
      elapsed,
      mode
    });

    updateStats();
    setTimeout(() => {
      nextQuestion();
      keepAnswerFocus();
    }, 450);
  });

  answerInput.addEventListener('blur', () => {
    setTimeout(() => {
      keepAnswerFocus();
      ensureQuestionVisibility();
    }, 0);
  });
}

function updateStats() {
  scoreEl.textContent = `${state.correct} / ${state.asked}`;
  streakEl.textContent = state.streak;
  const avg = state.timings.length ? state.timings.reduce((a, b) => a + b, 0) / state.timings.length : 0;
  avgTimeEl.textContent = `${avg.toFixed(2)}s`;
}

function trendDelta(records, metricGetter) {
  if (records.length < 10) return null;
  const recent = records.slice(0, 20);
  const older = records.slice(20, 40);
  if (!older.length) return null;
  return metricGetter(recent) - metricGetter(older);
}

function refreshAnalytics() {
  const records = loadRecords();
  recordsBody.innerHTML = records.slice(0, 50).map((r) => `
    <tr>
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${r.user}</td>
      <td>${r.mode || 'challenge'}</td>
      <td>${r.sum}</td>
      <td>${r.answer}</td>
      <td>${r.correct ? '✅' : `❌ (${r.expected})`}</td>
      <td>${r.elapsed.toFixed(2)}s</td>
    </tr>
  `).join('');

  const summary = getTableStats(records);
  const perSum = {};
  const errorMap = {};

  records.forEach((r) => {
    if (!perSum[r.sum]) perSum[r.sum] = [];
    perSum[r.sum].push(r);
    if (!r.correct) {
      const key = `${r.sum} → ${r.answer}`;
      errorMap[key] = (errorMap[key] || 0) + 1;
    }
  });

  const ranked = Object.entries(summary)
    .map(([table, r]) => ({
      table: Number(table),
      total: r.total,
      ok: r.ok,
      accuracy: r.total ? r.ok / r.total : 0,
      speed: r.total ? r.speedSum / r.total : 0
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  bestTableEl.textContent = ranked[0] ? `${ranked[0].table}× (${Math.round(ranked[0].accuracy * 100)}%)` : '—';
  strengths.innerHTML = ranked.slice(0, 3).map((r) => `<li>${r.table}× — ${Math.round(r.accuracy * 100)}% · ${r.speed.toFixed(2)}s avg</li>`).join('') || '<li>Not enough data yet.</li>';
  weaknesses.innerHTML = ranked.slice(-3).reverse().map((r) => `<li>${r.table}× — ${Math.round(r.accuracy * 100)}% · ${r.speed.toFixed(2)}s avg</li>`).join('') || '<li>Not enough data yet.</li>';

  const accuracyAll = records.length ? (records.filter((r) => r.correct).length / records.length) * 100 : 0;
  const speedAll = records.length ? records.reduce((a, r) => a + r.elapsed, 0) / records.length : 0;
  overallAccuracy.textContent = `${accuracyAll.toFixed(1)}%`;
  overallSpeed.textContent = `${speedAll.toFixed(2)}s`;

  const accuracyChange = trendDelta(records, (chunk) => (chunk.filter((r) => r.correct).length / chunk.length) * 100);
  const speedChange = trendDelta(records, (chunk) => chunk.reduce((a, r) => a + r.elapsed, 0) / chunk.length);

  trendAccuracy.textContent = accuracyChange === null
    ? 'Need 40 answers'
    : `${accuracyChange >= 0 ? '▲' : '▼'} ${Math.abs(accuracyChange).toFixed(1)} pts vs prior 20`;
  trendSpeed.textContent = speedChange === null
    ? 'Need 40 answers'
    : `${speedChange <= 0 ? '▲ faster' : '▼ slower'} ${Math.abs(speedChange).toFixed(2)}s`;

  const topErrors = Object.entries(errorMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  commonErrors.innerHTML = topErrors.map(([err, count]) => `<li>${err} (${count}x)</li>`).join('') || '<li>No common errors yet. Great!</li>';

  const sumImprovements = Object.entries(perSum)
    .map(([sum, attempts]) => {
      const recent = attempts.slice(0, 5);
      const older = attempts.slice(5, 10);
      if (!older.length) return null;
      const recentAcc = recent.filter((r) => r.correct).length / recent.length;
      const olderAcc = older.filter((r) => r.correct).length / older.length;
      const recentSpeed = recent.reduce((a, r) => a + r.elapsed, 0) / recent.length;
      const olderSpeed = older.reduce((a, r) => a + r.elapsed, 0) / older.length;
      return { sum, accGain: recentAcc - olderAcc, speedGain: olderSpeed - recentSpeed };
    })
    .filter(Boolean)
    .sort((a, b) => (b.accGain + b.speedGain / 10) - (a.accGain + a.speedGain / 10))
    .slice(0, 5);

  sumProgress.innerHTML = sumImprovements.map((item) =>
    `<li>${item.sum} — accuracy ${item.accGain >= 0 ? '+' : ''}${(item.accGain * 100).toFixed(0)} pts, speed ${item.speedGain >= 0 ? '-' : '+'}${Math.abs(item.speedGain).toFixed(2)}s</li>`
  ).join('') || '<li>Need more repeated sums to calculate per-sum improvement.</li>';

  const dayMap = {};
  records.forEach((r) => {
    dayMap[r.dayKey] = (dayMap[r.dayKey] || 0) + 1;
  });
  const activeDays = Object.keys(dayMap).sort();
  let streak = 0;
  if (activeDays.length) {
    streak = 1;
    for (let i = activeDays.length - 1; i > 0; i -= 1) {
      const current = new Date(activeDays[i]);
      const prev = new Date(activeDays[i - 1]);
      const diffDays = (current - prev) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) streak += 1;
      else break;
    }
  }
  const capsulePoints = Object.values(dayMap).reduce((acc, n) => acc + Math.min(3, Math.floor(n / 10) + 1), 0);
  capsuleScore.textContent = `${capsulePoints} pts`;
  capsuleStreak.textContent = `${streak} day streak`;

  drawChart(ranked);
  if (!selectedGridTable) chooseNextIncompleteTable();
}

function drawChart(ranked) {
  const ctx = chart.getContext('2d');
  ctx.clearRect(0, 0, chart.width, chart.height);
  ctx.fillStyle = '#fff9fb';
  ctx.fillRect(0, 0, chart.width, chart.height);

  const barW = Math.max(18, Math.floor((chart.width - 50) / Math.max(1, ranked.length)) - 8);
  ranked.forEach((r, i) => {
    const x = 30 + i * (barW + 8);
    const h = r.accuracy * 170;
    ctx.fillStyle = r.accuracy > 0.8 ? '#70cb3f' : r.accuracy > 0.6 ? '#f8b725' : '#d1396a';
    ctx.fillRect(x, 200 - h, barW, h);
    ctx.fillStyle = '#4e1630';
    ctx.font = '12px Arial';
    ctx.fillText(`${r.table}×`, x, 220);
  });
  ctx.fillStyle = '#4e1630';
  ctx.fillText('Accuracy by Table', 16, 16);
}

function setPracticeMode(modeKey) {
  mode = 'practice';
  if (modeKey === 'weak') {
    const records = loadRecords();
    const perTable = getTableStats(records);
    const weak = Object.entries(perTable)
      .map(([table, m]) => ({ table: Number(table), acc: m.total ? m.ok / m.total : 1 }))
      .sort((a, b) => a.acc - b.acc)[0];

    const weakTable = weak?.table || 7;
    setGridSelection(weakTable);
    modePairs = [];
    practiceSummary.textContent = `Weak Spot selected: table ${weakTable}×.`;
  } else {
    const selected = PRACTICE_MAP[modeKey];
    setGridSelection(selected.table);
    modePairs = selected.pairs;
    practiceSummary.textContent = `${selected.label} selected.`;
  }

  roundSize.value = '10';
  activateTab('challenge');
  startBtn.click();
}

function activateTab(tabId) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === tabId));
  if (tabId === 'analytics') refreshAnalytics();
  setTimeout(keepAnswerFocus, 0);
}

startBtn.addEventListener('click', () => {
  if (mode !== 'practice') modePairs = [];
  state = { running: true, asked: 0, correct: 0, streak: 0, timings: [], startAt: 0, roundTotal: Number(roundSize.value), current: null };
  updateStats();
  nextQuestion();
});

tableSelect.addEventListener('change', () => {
  selectedGridTable = Number(tableSelect.value);
  setGridSelection(selectedGridTable);
});

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.tab === 'challenge' ? 'challenge' : mode;
    activateTab(button.dataset.tab);
  });
});

document.querySelectorAll('[data-tab-jump]').forEach((button) => {
  button.addEventListener('click', () => activateTab(button.dataset.tabJump));
});

document.querySelectorAll('.practice-btn').forEach((button) => {
  button.addEventListener('click', () => setPracticeMode(button.dataset.mode));
});

document.addEventListener('click', () => setTimeout(keepAnswerFocus, 0));

const versionBtn = document.getElementById('versionBtn');
versionBtn.textContent = VERSION;
const versionDialog = document.getElementById('versionDialog');
const versionList = document.getElementById('versionList');
versionBtn.addEventListener('click', () => {
  versionList.innerHTML = `<li><a href="versions/history.html">Open full version history page</a></li>${VERSIONS.map((v) => `<li><strong>${v.version}</strong> (${v.date}) — ${v.notes} <a href="${v.path}">Open</a></li>`).join('')}`;
  versionDialog.showModal();
});
document.getElementById('closeVersions').addEventListener('click', () => versionDialog.close());

drawGrid();
refreshAnalytics();
chooseNextIncompleteTable();
