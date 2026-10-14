(() => {
  'use strict';

  const STORAGE_KEY = 'creatine-tracker:v1';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // ---------- Storage ----------
  // state = { taken: { 'YYYY-MM-DD': true }, reminderTime: 'HH:MM', notifEnabled: bool, lastNotified: 'YYYY-MM-DD' }
  function load() {
    const fallback = { taken: {}, reminderTime: '09:00', notifEnabled: false, lastNotified: null };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
      return fallback;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable (private mode); app still works for this session.
    }
  }

  let state = load();

  // ---------- Date helpers (all in local time) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = () => keyOf(new Date());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

  // ---------- Streaks ----------
  // The current streak stays alive until the end of today: if you haven't
  // taken it yet today, it counts back from yesterday.
  function currentStreak() {
    let day = new Date();
    if (!state.taken[keyOf(day)]) day = addDays(day, -1);
    let count = 0;
    while (state.taken[keyOf(day)]) {
      count++;
      day = addDays(day, -1);
    }
    return count;
  }

  function longestStreak() {
    const keys = Object.keys(state.taken).filter((k) => state.taken[k]).sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const k of keys) {
      const d = parseKey(k);
      run = prev && keyOf(addDays(prev, 1)) === k ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    return best;
  }

  function monthRate(year, month) {
    const now = new Date();
    const isCurrent = year === now.getFullYear() && month === now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysSoFar = isCurrent ? now.getDate() : daysInMonth;
    let taken = 0;
    for (let d = 1; d <= daysSoFar; d++) {
      if (state.taken[keyOf(new Date(year, month, d))]) taken++;
    }
    return daysSoFar ? Math.round((taken / daysSoFar) * 100) : 0;
  }

  // ---------- Rendering ----------
  const $ = (id) => document.getElementById(id);
  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();

  function renderToday() {
    const takenToday = !!state.taken[todayKey()];
    $('todayLabel').textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    $('takeBtn').classList.toggle('done', takenToday);
    $('takeText').textContent = takenToday ? 'Taken today ✓ (tap to undo)' : 'I took my creatine';

    const streak = currentStreak();
    if (takenToday) {
      $('takeStatus').textContent = 'Nice. See you tomorrow.';
    } else if (streak > 0) {
      $('takeStatus').textContent = `Don't break your ${streak}-day streak!`;
    } else {
      $('takeStatus').textContent = 'Not taken yet today.';
    }
  }

  function renderStats() {
    $('currentStreak').textContent = currentStreak();
    $('longestStreak').textContent = longestStreak();
    const n = new Date();
    $('monthRate').textContent = `${monthRate(n.getFullYear(), n.getMonth())}%`;
  }

  function renderCalendar() {
    $('monthLabel').textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    const grid = $('calendar');
    grid.innerHTML = '';

    const first = new Date(viewYear, viewMonth, 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const tKey = todayKey();
    const firstLogged = Object.keys(state.taken).sort()[0];

    for (let i = 0; i < offset; i++) {
      const blank = document.createElement('span');
      blank.className = 'day empty';
      grid.appendChild(blank);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const key = keyOf(date);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day';
      btn.textContent = d;
      btn.dataset.key = key;

      if (key > tKey) {
        btn.classList.add('future');
        btn.disabled = true;
      } else if (state.taken[key]) {
        btn.classList.add('taken');
      } else if (key < tKey && firstLogged && key >= firstLogged) {
        btn.classList.add('missed');
      }
      if (key === tKey) btn.classList.add('today');

      btn.setAttribute('aria-label',
        `${date.toDateString()}: ${state.taken[key] ? 'taken' : 'not taken'}`);
      grid.appendChild(btn);
    }

    const n = new Date();
    $('nextMonth').disabled = viewYear === n.getFullYear() && viewMonth === n.getMonth();
  }

  function renderAll() {
    renderToday();
    renderStats();
    renderCalendar();
    $('gcalLink').href = googleCalendarUrl();
  }

  function toggleDay(key) {
    if (state.taken[key]) delete state.taken[key];
    else state.taken[key] = true;
    save();
    renderAll();
  }

  // ---------- Notifications ----------
  let swReg = null;

  async function showNotification(title, body) {
    const options = { body, icon: 'icon.svg', badge: 'icon.svg', tag: 'creatine-reminder' };
    // Android Chrome only allows notifications through a service worker.
    if (swReg) return swReg.showNotification(title, options);
    return new Notification(title, options);
  }

  function renderNotifStatus() {
    const el = $('notifStatus');
    if (!('Notification' in window)) {
      el.textContent = 'This browser does not support notifications. Use the calendar option below.';
      $('enableNotif').disabled = true;
      return;
    }
    const perm = Notification.permission;
    if (perm === 'denied') {
      el.textContent = 'Notifications are blocked in your browser settings.';
    } else if (perm === 'granted' && state.notifEnabled) {
      el.textContent = `On. You'll be reminded at ${state.reminderTime} if you haven't logged it yet.`;
      $('enableNotif').textContent = 'Disable notifications';
    } else {
      el.textContent = 'Off.';
      $('enableNotif').textContent = 'Enable notifications';
    }
  }

  async function toggleNotifications() {
    if (state.notifEnabled) {
      state.notifEnabled = false;
    } else {
      const perm = await Notification.requestPermission();
      state.notifEnabled = perm === 'granted';
    }
    save();
    renderNotifStatus();
    checkReminder();
  }

  // Fires once per day, after the chosen time, only if not taken yet.
  function checkReminder() {
    if (!state.notifEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const tKey = todayKey();
    if (state.taken[tKey] || state.lastNotified === tKey) return;

    const [h, m] = state.reminderTime.split(':').map(Number);
    const n = new Date();
    if (n.getHours() * 60 + n.getMinutes() < h * 60 + m) return;

    state.lastNotified = tKey;
    save();
    const streak = currentStreak();
    showNotification('Time for your creatine 💊',
      streak > 0 ? `Keep your ${streak}-day streak alive.` : 'Take it now and start a streak.');
  }

  // ---------- Calendar reminders (reliable on any phone) ----------
  function reminderStamp() {
    const [h, m] = state.reminderTime.split(':');
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${h}${m}00`;
  }

  function endStamp() {
    const [h, m] = state.reminderTime.split(':').map(Number);
    const end = new Date();
    end.setHours(h, m + 5, 0, 0);
    return `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
  }

  function googleCalendarUrl() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: 'Take creatine 💊',
      details: 'Daily creatine reminder. Log it in your Creatine Tracker.',
      dates: `${reminderStamp()}/${endStamp()}`,
      recur: 'RRULE:FREQ=DAILY',
      ctz: tz,
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  }

  function downloadIcs() {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Creatine Tracker//EN',
      'BEGIN:VEVENT',
      `UID:creatine-${Date.now()}@creatine-tracker`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${reminderStamp()}`,
      `DTEND:${endStamp()}`,
      'RRULE:FREQ=DAILY',
      'SUMMARY:Take creatine 💊',
      'DESCRIPTION:Daily creatine reminder. Log it in your Creatine Tracker.',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Take creatine',
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    downloadFile('creatine-reminder.ics', ics, 'text/calendar');
  }

  // ---------- Export / import ----------
  function downloadFile(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data.taken !== 'object') throw new Error('bad file');
        state = { ...state, ...data };
        save();
        renderAll();
        renderNotifStatus();
        alert('Data imported.');
      } catch {
        alert('That file does not look like a Creatine Tracker export.');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Wire up ----------
  $('takeBtn').addEventListener('click', () => toggleDay(todayKey()));

  $('calendar').addEventListener('click', (e) => {
    const btn = e.target.closest('.day');
    if (!btn || btn.disabled || !btn.dataset.key) return;
    toggleDay(btn.dataset.key);
  });

  $('prevMonth').addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderCalendar();
  });
  $('nextMonth').addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCalendar();
  });

  $('reminderTime').value = state.reminderTime;
  $('reminderTime').addEventListener('change', (e) => {
    state.reminderTime = e.target.value || '09:00';
    state.lastNotified = null;
    save();
    renderNotifStatus();
    $('gcalLink').href = googleCalendarUrl();
  });

  $('enableNotif').addEventListener('click', toggleNotifications);
  $('testNotif').addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') await Notification.requestPermission();
    if (Notification.permission === 'granted') {
      showNotification('Creatine Tracker', 'Notifications are working 👍');
    }
    renderNotifStatus();
  });

  $('downloadIcs').addEventListener('click', downloadIcs);
  $('exportBtn').addEventListener('click', () =>
    downloadFile(`creatine-backup-${todayKey()}.json`, JSON.stringify(state, null, 2), 'application/json'));
  $('importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  $('resetBtn').addEventListener('click', () => {
    if (confirm('Delete your whole history? This cannot be undone.')) {
      state.taken = {};
      state.lastNotified = null;
      save();
      renderAll();
    }
  });

  // Re-render when the day rolls over or the app comes back to the foreground.
  let lastRenderedDay = todayKey();
  function tick() {
    if (todayKey() !== lastRenderedDay) {
      lastRenderedDay = todayKey();
      renderAll();
    }
    checkReminder();
  }
  setInterval(tick, 30 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => { swReg = reg; checkReminder(); })
      .catch(() => { /* runs fine without offline support */ });
  }

  renderAll();
  renderNotifStatus();
  checkReminder();
})();
