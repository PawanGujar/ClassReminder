const STORAGE_KEY = 'class_reminder_data_v1';
let data = { classes: [] };
const $ = id => document.getElementById(id);

let snoozeUntil = null;
let doneClassesToday = [];

// Storage helpers
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  render();
}

function load() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) {
      data = JSON.parse(v);
    }
  } catch (e) {
    console.error(e);
  }
}

// Time helpers
function now() {
  return new Date();
}

function parseTimeToDate(t) {
  const [hh, mm] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d;
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Render timetable
function render() {
  const role = $('roleSelect').value;
  const list = data.classes.slice().sort((a, b) => a.start.localeCompare(b.start));
  const filtered = list.filter(c => c.visibility === 'both' || c.visibility === role);
  $('classesList').innerHTML = '';
  filtered.forEach((c, idx) => {
    const el = document.createElement('div');
    el.className = 'class-item';
    el.innerHTML = `
      <div>
        <div style="font-weight:700">${c.title}</div>
        <div class="small muted">${c.start} — ${c.end} ${c.location ? '• ' + c.location : ''}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="small muted">${c.notifyMins ?? 5}m</div>
        <button data-idx="${idx}" class="editBtn">✏️</button>
        <button data-idx="${idx}" class="delBtn">🗑</button>
      </div>
    `;
    $('classesList').appendChild(el);
  });
  $('upcomingCount').innerText =
    filtered.length + (filtered.length === 1 ? ' class' : ' classes');
  updateNext();
}

let editingIndex = null;
$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('title').value.trim();
  const s = $('startTime').value;
  const en = $('endTime').value;
  const vis = $('visibility').value;
  const notifyMins =
    Number($('notifyMins').value) ||
    Number($('defaultReminder').value) ||
    5;
  const loc = $('location').value.trim();
  const days = Array.from(document.querySelectorAll('#daySelect input:checked')).map(cb =>
    Number(cb.value)
  );
  if (!t || !s || !en) return alert('Please fill title, start and end');
  const item = { title: t, start: s, end: en, visibility: vis, notifyMins, location: loc, days };
  if (editingIndex == null) {
    data.classes.push(item);
  } else {
    data.classes[editingIndex] = item;
    editingIndex = null;
  }
  save();
  $('addForm').reset();
});

$('classesList').addEventListener('click', e => {
  if (e.target.classList.contains('delBtn')) {
    const idx = Number(e.target.dataset.idx);
    const role = $('roleSelect').value;
    const list = data.classes.slice().sort((a, b) => a.start.localeCompare(b.start));
    const filtered = list.filter(c => c.visibility === 'both' || c.visibility === role);
    const item = filtered[idx];
    if (!item) return;
    const realIdx = data.classes.findIndex(
      x => x.title === item.title && x.start === item.start && x.end === item.end
    );
    if (realIdx > -1) {
      data.classes.splice(realIdx, 1);
      save();
    }
  }
  if (e.target.classList.contains('editBtn')) {
    const idx = Number(e.target.dataset.idx);
    const role = $('roleSelect').value;
    const list = data.classes.slice().sort((a, b) => a.start.localeCompare(b.start));
    const filtered = list.filter(c => c.visibility === 'both' || c.visibility === role);
    const item = filtered[idx];
    if (!item) return;
    $('title').value = item.title;
    $('startTime').value = item.start;
    $('endTime').value = item.end;
    $('visibility').value = item.visibility;
    $('notifyMins').value = item.notifyMins;
    $('location').value = item.location || '';
    document
      .querySelectorAll('#daySelect input')
      .forEach(cb => (cb.checked = item.days.includes(Number(cb.value))));
    editingIndex = data.classes.findIndex(
      x => x.title === item.title && x.start === item.start && x.end === item.end
    );
  }
});

$('clearAll').addEventListener('click', () => {
  if (confirm('Clear all saved classes?')) {
    data.classes = [];
    save();
  }
});

$('btnLoadSample').addEventListener('click', () => {
  const nowD = new Date();
  function tplus(mins) {
    const d = new Date(nowD.getTime() + mins * 60000);
    return d.toTimeString().slice(0, 5);
  }
  data.classes.push({
    title: 'Math — Grade 8',
    start: tplus(10),
    end: tplus(55),
    visibility: 'both',
    notifyMins: 5,
    location: 'Room 12',
    days: [1, 2, 3, 4, 5]
  });
  data.classes.push({
    title: 'Physics — Lab',
    start: tplus(70),
    end: tplus(120),
    visibility: 'student',
    notifyMins: 10,
    location: 'Lab A',
    days: [1, 3, 5]
  });
  data.classes.push({
    title: 'Staff meeting',
    start: tplus(130),
    end: tplus(170),
    visibility: 'teacher',
    notifyMins: 15,
    location: 'Staff Room',
    days: [2, 4]
  });
  save();
});

async function requestNotif() {
  if (!('Notification' in window)) return alert('Notifications not supported.');
  if (Notification.permission === 'granted') return;
  const p = await Notification.requestPermission();
  if (p === 'granted') {
    $('btnRequestNotif').style.display = 'none';
    alert('Notifications enabled');
  }
}
$('btnRequestNotif').addEventListener('click', requestNotif);

// Update upcoming
function updateNext() {
  const role = $('roleSelect').value;
  const list = data.classes.slice().sort((a, b) => a.start.localeCompare(b.start));
  const filtered = list.filter(c => c.visibility === 'both' || c.visibility === role);
  const nowTime = new Date();
  let next = null;
  for (const c of filtered) {
    if (!c.days.includes(nowTime.getDay())) continue;
    if (doneClassesToday.includes(c.title + c.start)) continue;
    const s = parseTimeToDate(c.start);
    if (s.getTime() >= nowTime.getTime()) {
      next = c;
      break;
    }
  }
  if (!next) {
    $('nextInfo').innerText = 'No upcoming class';
    $('countdown').innerText = '—';
    return;
  }
  const sDate = parseTimeToDate(next.start);
  const diffMs = sDate - nowTime;
  if (snoozeUntil && nowTime < snoozeUntil) {
    $('nextInfo').innerText = `Snoozed until ${formatTime(snoozeUntil)}`;
    $('countdown').innerText = '';
    return;
  }
  $('nextInfo').innerText = `${next.title} — ${next.start} (${next.location || '—'})`;
  if (diffMs <= 0) {
    $('countdown').innerText = 'Class started';
  } else {
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    $('countdown').innerText = `${mins}m ${secs}s to start`;
  }
}

// Check notifications loop
async function checkLoop() {
  const role = $('roleSelect').value;
  const nowT = new Date();
  for (const c of data.classes) {
    if (!(c.visibility === 'both' || c.visibility === role)) continue;
    if (!c.days.includes(nowT.getDay())) continue;
    if (doneClassesToday.includes(c.title + c.start)) continue;
    const startD = parseTimeToDate(c.start);
    const notifyTime = new Date(startD.getTime() - c.notifyMins * 60000);

    // Snooze check
    if (snoozeUntil && nowT < snoozeUntil) continue;

    if (nowT >= notifyTime && nowT < startD) {
      if (Notification.permission === 'granted') {
        new Notification('Upcoming Class', {
          body: `${c.title} at ${c.start} (${c.location || 'No location'})`,
          icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135755.png'
        });
      }
    }
  }
  updateNext();
}

// Snooze button
$('snoozeBtn').addEventListener('click', () => {
  snoozeUntil = new Date(Date.now() + 5 * 60000); // Snooze 5 mins
  updateNext();
});

// Go to class button
$('goNowBtn').addEventListener('click', () => {
  const role = $('roleSelect').value;
  const nowTime = new Date();
  const list = data.classes.slice().sort((a, b) => a.start.localeCompare(b.start));
  const filtered = list.filter(c => c.visibility === 'both' || c.visibility === role);
  const next = filtered.find(c => {
    if (!c.days.includes(nowTime.getDay())) return false;
    if (doneClassesToday.includes(c.title + c.start)) return false;
    const s = parseTimeToDate(c.start);
    return s.getTime() >= nowTime.getTime();
  });
  if (next) {
    doneClassesToday.push(next.title + next.start);
    alert(`Going to: ${next.title} at ${next.location || '—'}`);
    updateNext();
  } else {
    alert('No upcoming class to go to.');
  }
});

// Clock updater
function updateClock() {
  $('clock').innerText = now().toLocaleTimeString();
}

// Main loop
function startLoop() {
  const intervalSec = Number($('intervalInput').value) || 15;
  setInterval(checkLoop, intervalSec * 1000);
  setInterval(updateClock, 1000);
  setInterval(updateNext, 1000); // real-time countdown update
}

// Init
window.addEventListener('load', () => {
  load();
  render();
  startLoop();
});

// Role change re-renders list
$('roleSelect').addEventListener('change', render);
