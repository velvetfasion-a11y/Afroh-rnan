import { requireFrisorAdmin, signOut, getFirebaseAuth } from './firebase-auth.js?v=22';

const DAYS_SV = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
const DAYS_SV_FULL = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
const MONTHS_SV = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_FULL = ['JANUARI', 'FEBRUARI', 'MARS', 'APRIL', 'MAJ', 'JUNI', 'JULI', 'AUGUSTI', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DECEMBER'];

let currentWeekOffset = 0;
let selectedCell = null;
let repeatMode = 'once';

const bookings = [
  { date: offsetDateStr(0), time: '10:00', duration: 70, client: 'Sara Lindqvist', service: 'Flätning & Extensions', price: 890, status: 'confirmed' },
  { date: offsetDateStr(1), time: '11:20', duration: 45, client: 'Maria Ek', service: 'Herrklippning / Fade', price: 750, status: 'confirmed' },
  { date: offsetDateStr(1), time: '13:00', duration: 30, client: 'Johan Berglund', service: 'Herrklippning / Fade', price: 750, status: 'pending' },
  { date: offsetDateStr(2), time: '14:30', duration: 70, client: 'Amina Hassan', service: 'Flätning & Extensions', price: 890, status: 'confirmed' },
  { date: offsetDateStr(3), time: '16:00', duration: 45, client: 'Klara Nilsson', service: 'Herrklippning / Fade', price: 750, status: 'cancelled' },
];

let slots = buildSlotsFromBookings(bookings);

function offsetDateStr(dayOffset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return dateStr(d);
}

function buildSlotsFromBookings(list) {
  const map = {};
  list.forEach((b) => {
    if (b.status === 'cancelled') return;
    const [h, m] = b.time.split(':').map(Number);
    const endMins = h * 60 + m + b.duration;
    const endH = Math.floor(endMins / 60);
    const endMin = endMins % 60;
    const slot = {
      title: b.service,
      start: b.time,
      end: `${String(endH).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
      booked: b.status === 'confirmed',
      pending: b.status === 'pending',
      client: b.client.split(' ')[0] + ' ' + (b.client.split(' ')[1]?.[0] || '') + '.',
    };
    if (!map[b.date]) map[b.date] = [];
    map[b.date].push(slot);
  });
  return map;
}

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekDates(offset) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function initialsFromUser(user) {
  const name = user.displayName || user.email || 'AF';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function renderStats(dates) {
  const todayStr = dateStr(new Date());
  const weekSet = new Set(dates.map(dateStr));
  const weekBookings = bookings.filter((b) => weekSet.has(b.date) && b.status !== 'cancelled');
  const todayBookings = weekBookings.filter((b) => b.date === todayStr);
  const revenue = weekBookings.reduce((sum, b) => sum + b.price, 0);

  document.getElementById('stat-today').textContent = String(todayBookings.length);
  document.getElementById('stat-week').textContent = String(weekBookings.length);
  document.getElementById('stat-revenue').textContent = revenue.toLocaleString('sv-SE');
}

function renderBookingsList(dates) {
  const weekSet = new Set(dates.map(dateStr));
  const list = document.getElementById('booking-list');
  const items = bookings
    .filter((b) => weekSet.has(b.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  if (!items.length) {
    list.innerHTML = '<p style="padding:24px;text-align:center;color:#8892a4;font-size:14px;">Inga bokningar denna vecka.</p>';
    return;
  }

  list.innerHTML = items.map((b) => {
    const dotClass = b.status === 'confirmed' ? 'dot-confirmed' : b.status === 'pending' ? 'dot-pending' : 'dot-cancelled';
    const badgeClass = b.status === 'confirmed' ? 'badge-confirmed' : b.status === 'pending' ? 'badge-pending' : 'badge-cancelled';
    const badgeLabel = b.status === 'confirmed' ? 'Bekräftad' : b.status === 'pending' ? 'Väntar' : 'Avbokad';
    return `
      <div class="frisor-booking-item">
        <div class="frisor-booking-time-col">
          <div class="frisor-booking-time">${b.time}</div>
          <div class="frisor-booking-duration">${b.duration} min</div>
        </div>
        <div class="frisor-booking-dot ${dotClass}"></div>
        <div class="frisor-booking-info">
          <div class="frisor-booking-client">${b.client}</div>
          <div class="frisor-booking-service">${b.service}</div>
          <div class="frisor-booking-price">${b.price} kr</div>
        </div>
        <span class="frisor-badge ${badgeClass}">${badgeLabel}</span>
      </div>
    `;
  }).join('');
}

function renderCalendar() {
  const dates = getWeekDates(currentWeekOffset);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const first = dates[0];
  const last = dates[6];
  const sameMonth = first.getMonth() === last.getMonth();
  const rangeLabel = sameMonth
    ? `${first.getDate()} – ${last.getDate()} ${MONTHS_FULL[last.getMonth()]}`
    : `${first.getDate()} ${MONTHS_FULL[first.getMonth()].slice(0, 3)} – ${last.getDate()} ${MONTHS_FULL[last.getMonth()].slice(0, 3)}`;

  document.getElementById('week-range').textContent = rangeLabel;
  document.getElementById('week-num').textContent = `VECKA ${getWeekNumber(first)}`;
  document.getElementById('bookings-week-label').textContent = `${rangeLabel.replace(/[A-ZÅÄÖ]+/g, (m) => m.toLowerCase())}`;

  renderStats(dates);
  renderBookingsList(dates);

  const headers = document.getElementById('day-headers');
  headers.innerHTML = '<div class="frisor-time-col"></div>';
  dates.forEach((d) => {
    const isToday = d.getTime() === today.getTime();
    const el = document.createElement('div');
    el.className = `frisor-week-day-header${isToday ? ' today' : ''}`;
    const dayName = DAYS_SV[d.getDay()];
    if (isToday) {
      el.innerHTML = `${dayName}<span class="frisor-week-day-num">${d.getDate()}</span>`;
    } else {
      el.innerHTML = `${dayName}<span class="frisor-week-day-num" style="display:block;font-size:17px;font-weight:700;">${d.getDate()}</span>`;
    }
    headers.appendChild(el);
  });

  const timeRows = document.getElementById('time-rows');
  timeRows.innerHTML = '';

  for (let h = 8; h <= 20; h += 1) {
    const label = document.createElement('div');
    label.className = 'frisor-time-label';
    label.textContent = `${h}:00`;
    timeRows.appendChild(label);

    dates.forEach((d) => {
      const ds = dateStr(d);
      const cell = document.createElement('div');
      cell.className = 'frisor-day-cell';
      cell.dataset.date = ds;
      cell.dataset.hour = String(h);
      cell.addEventListener('click', () => openModal(ds, h));

      (slots[ds] || []).forEach((slot) => {
        const slotH = parseInt(slot.start.split(':')[0], 10);
        const slotM = parseInt(slot.start.split(':')[1], 10);
        const endH = parseInt(slot.end.split(':')[0], 10);
        const endM = parseInt(slot.end.split(':')[1], 10);

        if (slotH === h) {
          const totalMins = (endH * 60 + endM) - (slotH * 60 + slotM);
          const heightPx = (totalMins / 60) * 44;
          const topOffset = (slotM / 60) * 44;

          const block = document.createElement('div');
          let cls = 'frisor-slot-block';
          if (slot.booked) cls += ' booked';
          else if (slot.pending) cls += ' pending';
          block.className = cls;
          block.style.top = `${topOffset}px`;
          block.style.height = `${heightPx}px`;
          block.innerHTML = `<span>${slot.start}</span>${slot.client ? `<br><span style="font-weight:400;opacity:.85">${slot.client}</span>` : ''}`;
          block.addEventListener('click', (e) => e.stopPropagation());
          cell.appendChild(block);
        }
      });

      timeRows.appendChild(cell);
    });
  }
}

function openModal(ds, hour) {
  selectedCell = { date: ds, hour };
  const d = new Date(`${ds}T12:00:00`);
  document.getElementById('modal-date-label').textContent = `${DAYS_SV_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_SV[d.getMonth()]}`;
  const startH = String(hour).padStart(2, '0');
  document.getElementById('slot-start').value = `${startH}:00`;
  document.getElementById('slot-end').value = `${String(hour + 1).padStart(2, '0')}:00`;
  document.getElementById('slot-title').value = '';
  selectRepeat('once');
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function selectRepeat(mode) {
  repeatMode = mode;
  document.querySelectorAll('.frisor-repeat-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.repeat === mode);
  });
}

function addSlot() {
  if (!selectedCell) return;
  const title = document.getElementById('slot-title').value.trim() || 'Ledig tid';
  const start = document.getElementById('slot-start').value;
  const end = document.getElementById('slot-end').value;
  const newSlot = { title, start, end, booked: false };

  if (repeatMode === 'once') {
    if (!slots[selectedCell.date]) slots[selectedCell.date] = [];
    slots[selectedCell.date].push(newSlot);
  } else if (repeatMode === 'daily') {
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(`${selectedCell.date}T12:00:00`);
      d.setDate(d.getDate() + i);
      const ds = dateStr(d);
      if (!slots[ds]) slots[ds] = [];
      slots[ds].push({ ...newSlot });
    }
  } else if (repeatMode === 'weekly') {
    for (let w = 0; w < 4; w += 1) {
      const d = new Date(`${selectedCell.date}T12:00:00`);
      d.setDate(d.getDate() + w * 7);
      const ds = dateStr(d);
      if (!slots[ds]) slots[ds] = [];
      slots[ds].push({ ...newSlot });
    }
  }

  closeModal();
  renderCalendar();
}

function setTab(view) {
  document.querySelectorAll('.frisor-admin-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  ['calendar', 'bookings', 'settings'].forEach((name) => {
    document.getElementById(`view-${name}`).hidden = name !== view;
  });
}

function bindUi() {
  document.getElementById('week-prev').addEventListener('click', () => {
    currentWeekOffset -= 1;
    renderCalendar();
  });
  document.getElementById('week-next').addEventListener('click', () => {
    currentWeekOffset += 1;
    renderCalendar();
  });

  document.querySelectorAll('.frisor-admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => setTab(tab.dataset.view));
  });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', addSlot);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  document.querySelectorAll('.frisor-repeat-btn').forEach((btn) => {
    btn.addEventListener('click', () => selectRepeat(btn.dataset.repeat));
  });

  document.getElementById('settings-save').addEventListener('click', () => {
    const btn = document.getElementById('settings-save');
    const original = btn.textContent;
    btn.textContent = 'Sparat!';
    window.setTimeout(() => { btn.textContent = original; }, 1600);
  });

  document.getElementById('frisorAdminLogout').addEventListener('click', async () => {
    await signOut(getFirebaseAuth());
    window.location.href = 'index.html';
  });
}

function revealApp(user) {
  document.getElementById('frisorAdminLoading').hidden = true;
  document.getElementById('frisorAdminApp').hidden = false;
  document.getElementById('frisorAdminName').textContent = user.displayName || user.email || 'Frisör admin';
  document.getElementById('frisorAdminAvatar').textContent = initialsFromUser(user);
  bindUi();
  renderCalendar();
}

requireFrisorAdmin(revealApp);
