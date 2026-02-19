const VERSION = '1.0.1';
const VERSIONS = [
  { version: '1.0.0', date: '2026-02-19', notes: 'Initial TT38+ release with 1x–20x, fractions page, and analytics.', path: 'archive/v1.0.0/index.html' },
  { version: '1.0.1', date: '2026-02-19', notes: 'Polish update with improved version navigation and release archival.', path: 'archive/v1.0.1/index.html' },
  { version: '1.0.1-current', date: '2026-02-19', notes: 'Current live app.', path: 'index.html' },
  { version: '1.1.0', date: 'Planned', notes: 'Future: printable worksheets and teacher mode.', path: 'versions/1.1.0.html' }
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
tableSelect.value = '38';

function nextQuestion() {
  if (state.asked >= state.roundTotal) {
    state.running = false;
    challengeArea.innerHTML = `<h2>Round complete!</h2><p>You scored ${state.correct}/${state.roundTotal}.</p>`;
    refreshAnalytics();
    return;
  }
  const table = Number(tableSelect.value);
  const rhs = Math.ceil(Math.random() * 20);
  state.current = { table, rhs, answer: table * rhs };
  state.startAt = performance.now();
  challengeArea.innerHTML = `
    <p class="sum">${table} × ${rhs} = ?</p>
    <input id="answerInput" type="number" placeholder="Type answer" />
    <button id="submitAnswer">Submit</button>
    <p class="feedback" id="feedback"></p>
  `;
  document.getElementById('submitAnswer').addEventListener('click', submitAnswer);
  document.getElementById('answerInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitAnswer();
  });
  document.getElementById('answerInput').focus();
}

function submitAnswer() {
  if (!state.running) return;
  const input = Number(document.getElementById('answerInput').value);
  const elapsed = (performance.now() - state.startAt) / 1000;
  const correct = input === state.current.answer;
  state.asked += 1;
  state.correct += correct ? 1 : 0;
  state.streak = correct ? state.streak + 1 : 0;
  state.timings.push(elapsed);

  const now = new Date();
  const record = {
    ts: now.toISOString(),
    user: studentName.value.trim() || 'Anonymous',
    table: state.current.table,
    rhs: state.current.rhs,
    expected: state.current.answer,
    actual: input,
    correct,
    elapsed: Number(elapsed.toFixed(2))
  };
  const data = JSON.parse(localStorage.getItem('tt38_records') || '[]');
  data.push(record);
  localStorage.setItem('tt38_records', JSON.stringify(data));

  document.getElementById('feedback').className = `feedback ${correct ? 'good' : 'bad'}`;
  document.getElementById('feedback').textContent = correct
    ? `Correct in ${elapsed.toFixed(2)}s`
    : `Not quite — correct answer is ${state.current.answer}`;

  updateStats();
  setTimeout(nextQuestion, 550);
}

function updateStats() {
  scoreEl.textContent = `${state.correct} / ${state.asked}`;
  streakEl.textContent = `${state.streak}`;
  const avg = state.timings.length ? state.timings.reduce((a, b) => a + b, 0) / state.timings.length : 0;
  avgTimeEl.textContent = `${avg.toFixed(2)}s`;

  const data = JSON.parse(localStorage.getItem('tt38_records') || '[]');
  const byTable = {};
  data.forEach((r) => {
    byTable[r.table] ??= { c: 0, t: 0 };
    byTable[r.table].t += 1;
    if (r.correct) byTable[r.table].c += 1;
  });
  const top = Object.entries(byTable)
    .map(([t, v]) => ({ table: t, rate: v.c / v.t }))
    .sort((a, b) => b.rate - a.rate)[0];
  bestTableEl.textContent = top ? `${top.table}× (${Math.round(top.rate * 100)}%)` : '—';
}

function refreshAnalytics() {
  const data = JSON.parse(localStorage.getItem('tt38_records') || '[]').slice(-250);
  recordsBody.innerHTML = data.slice(-40).reverse().map((r) => {
    const d = new Date(r.ts);
    return `<tr>
      <td>${d.toLocaleDateString()}</td>
      <td>${d.toLocaleTimeString()}</td>
      <td>${r.user}</td>
      <td>${r.table}×${r.rhs}</td>
      <td>${r.actual}</td>
      <td>${r.correct ? '✅' : '❌'}</td>
      <td>${r.elapsed}s</td>
    </tr>`;
  }).join('');

  const summary = {};
  data.forEach((r) => {
    summary[r.table] ??= { correct: 0, total: 0, avg: 0 };
    const s = summary[r.table];
    s.total += 1;
    if (r.correct) s.correct += 1;
    s.avg += r.elapsed;
  });
  const ranked = Object.entries(summary).map(([table, s]) => ({
    table,
    accuracy: s.correct / s.total,
    avg: s.avg / s.total,
    total: s.total
  })).sort((a, b) => b.accuracy - a.accuracy);

  strengths.innerHTML = ranked.slice(0, 4).map((r) => `<li>${r.table}× — ${Math.round(r.accuracy * 100)}% (${r.total} questions)</li>`).join('') || '<li>Not enough data yet.</li>';
  weaknesses.innerHTML = ranked.slice(-4).reverse().map((r) => `<li>${r.table}× — ${Math.round(r.accuracy * 100)}% (${r.total} questions)</li>`).join('') || '<li>Not enough data yet.</li>';

  drawChart(ranked);
}

function drawChart(ranked) {
  const ctx = chart.getContext('2d');
  ctx.clearRect(0, 0, chart.width, chart.height);
  ctx.fillStyle = '#f5f8ff';
  ctx.fillRect(0, 0, chart.width, chart.height);

  const barW = Math.max(18, Math.floor((chart.width - 50) / Math.max(1, ranked.length)) - 8);
  ranked.forEach((r, i) => {
    const x = 30 + i * (barW + 8);
    const h = r.accuracy * 170;
    ctx.fillStyle = r.accuracy > 0.8 ? '#17914a' : r.accuracy > 0.6 ? '#ff9d00' : '#cc2a2a';
    ctx.fillRect(x, 200 - h, barW, h);
    ctx.fillStyle = '#234';
    ctx.font = '12px Arial';
    ctx.fillText(`${r.table}×`, x, 220);
  });
  ctx.fillStyle = '#234';
  ctx.fillText('Accuracy by Table', 16, 16);
}

startBtn.addEventListener('click', () => {
  state = { running: true, asked: 0, correct: 0, streak: 0, timings: [], startAt: 0, roundTotal: Number(roundSize.value), current: null };
  updateStats();
  nextQuestion();
});

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(button.dataset.tab).classList.add('active');
    if (button.dataset.tab === 'analytics') refreshAnalytics();
  });
});

const versionBtn = document.getElementById('versionBtn');
versionBtn.textContent = VERSION;
const versionDialog = document.getElementById('versionDialog');
const versionList = document.getElementById('versionList');
versionBtn.addEventListener('click', () => {
  versionList.innerHTML = `<li><a href="versions/history.html">Open full version history page</a></li>` +
    VERSIONS.map((v) => `<li><strong>${v.version}</strong> (${v.date}) — ${v.notes} <a href="${v.path}">Open</a></li>`).join('');
  versionDialog.showModal();
});
document.getElementById('closeVersions').addEventListener('click', () => versionDialog.close());

refreshAnalytics();
