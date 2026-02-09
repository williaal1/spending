// ==========================================================================
// Configuration
// ==========================================================================

const CONFIG = {
  owner: 'williaal1',
  repo: 'spending',
  csvPath: 'spending_log.csv',
  dailyTarget: 80.00,
  discretionaryCategories: [
    'GROCERIES', 'RESTAURANTS', 'SHOPPING',
    'BOOKS_RECORDS', 'TRAVEL', 'STIPEND'
  ]
};

// ==========================================================================
// State
// ==========================================================================

let state = {
  amount: '',
  category: null,
  token: null,
  submitting: false,
  todayEntries: [],  // actually holds ALL entries, name kept for compat
  walletStartDate: null
};

// ==========================================================================
// GitHub API
// ==========================================================================

async function githubGet(path) {
  const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${encodeURIComponent(path)}`, {
    headers: {
      'Authorization': `Bearer ${state.token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

async function githubPut(path, content, sha, message) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${state.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `GitHub API error: ${res.status}`);
  }
  return res.json();
}

// ==========================================================================
// CSV helpers
// ==========================================================================

const CSV_HEADER = 'timestamp,amount,category,note';

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length <= 1) return [];
  return lines.slice(1).map(line => {
    // Handle commas inside quoted fields
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { fields.push(current); current = ''; }
      else { current += ch; }
    }
    fields.push(current);
    return {
      timestamp: fields[0] || '',
      amount: parseFloat(fields[1]) || 0,
      category: fields[2] || '',
      note: fields[3] || ''
    };
  });
}

function entryToCSVRow(entry) {
  const note = entry.note.includes(',') || entry.note.includes('"')
    ? `"${entry.note.replace(/"/g, '""')}"`
    : entry.note;
  return `${entry.timestamp},${entry.amount.toFixed(2)},${entry.category},${note}`;
}

// ==========================================================================
// Date/time helpers
// ==========================================================================

function localISO() {
  const now = new Date();
  const off = now.getTimezoneOffset();
  const sign = off <= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  // Build local ISO string
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${hh}:${mm}`;
}

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatTime(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate() {
  const now = new Date();
  return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ==========================================================================
// UI updates
// ==========================================================================

function updateAmountDisplay() {
  const el = document.getElementById('amount-display');
  if (!state.amount || state.amount === '') {
    el.textContent = '$0.00';
  } else {
    const val = parseFloat(state.amount);
    if (isNaN(val)) {
      el.textContent = '$' + state.amount;
    } else {
      el.textContent = '$' + state.amount;
    }
  }
  updateSubmitButton();
}

function updateSubmitButton() {
  const btn = document.getElementById('submit-btn');
  const hasAmount = state.amount && parseFloat(state.amount) > 0;
  const hasCat = state.category !== null;
  btn.disabled = !hasAmount || !hasCat || state.submitting;
}

function getWalletStartDate() {
  // Use stored start date, or the date of the first entry, or today
  let stored = localStorage.getItem('wallet_start_date');
  if (stored) return stored;

  if (state.todayEntries.length > 0) {
    // Find earliest entry
    const earliest = state.todayEntries
      .map(e => e.timestamp.slice(0, 10))
      .sort()[0];
    localStorage.setItem('wallet_start_date', earliest);
    return earliest;
  }

  const today = todayStr();
  localStorage.setItem('wallet_start_date', today);
  return today;
}

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00');
  const d2 = new Date(dateStr2 + 'T00:00:00');
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

function updateWalletBalance() {
  const startDate = getWalletStartDate();
  const today = todayStr();
  const daysElapsed = daysBetween(startDate, today) + 1; // include today

  const totalAllowance = daysElapsed * CONFIG.dailyTarget;

  const totalSpent = state.todayEntries
    .filter(e => CONFIG.discretionaryCategories.includes(e.category))
    .reduce((sum, e) => sum + e.amount, 0);

  const balance = totalAllowance - totalSpent;

  const amountEl = document.getElementById('wallet-amount');
  const recoveryEl = document.getElementById('wallet-recovery');

  if (balance >= 0) {
    amountEl.textContent = '$' + balance.toFixed(2);
    amountEl.classList.remove('negative', 'low');
    if (balance < CONFIG.dailyTarget) {
      amountEl.classList.add('low');
    }
    recoveryEl.classList.add('hidden');
  } else {
    amountEl.textContent = '-$' + Math.abs(balance).toFixed(2);
    amountEl.classList.remove('low');
    amountEl.classList.add('negative');

    // Calculate recovery date: days until balance hits 0 with $80/day added and no spending
    const daysToRecover = Math.ceil(Math.abs(balance) / CONFIG.dailyTarget);
    const recoveryDate = new Date();
    recoveryDate.setDate(recoveryDate.getDate() + daysToRecover);
    const recoveryStr = recoveryDate.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });
    recoveryEl.textContent = `Back positive ${recoveryStr} (${daysToRecover}d)`;
    recoveryEl.classList.remove('hidden');
  }
}

function updateDailyStatus() {
  const today = todayStr();
  const todayDiscretionary = state.todayEntries
    .filter(e => e.timestamp.startsWith(today) && CONFIG.discretionaryCategories.includes(e.category))
    .reduce((sum, e) => sum + e.amount, 0);

  const totalEl = document.getElementById('daily-total');
  totalEl.textContent = '$' + todayDiscretionary.toFixed(2);
  totalEl.classList.remove('over', 'warning');
  if (todayDiscretionary > CONFIG.dailyTarget) {
    totalEl.classList.add('over');
  } else if (todayDiscretionary > CONFIG.dailyTarget * 0.75) {
    totalEl.classList.add('warning');
  }

  updateWalletBalance();
}

function renderEntries() {
  const list = document.getElementById('entries-list');
  const today = todayStr();
  const todayEntries = state.todayEntries
    .filter(e => e.timestamp.startsWith(today))
    .reverse();

  if (todayEntries.length === 0) {
    list.innerHTML = '<p class="empty-state">No entries today</p>';
    return;
  }

  list.innerHTML = todayEntries.map(e => `
    <div class="entry">
      <div class="entry-left">
        <span class="entry-cat">${e.category}</span>
        ${e.note ? `<span class="entry-note">${escapeHtml(e.note)}</span>` : ''}
        <span class="entry-time">${formatTime(e.timestamp)}</span>
      </div>
      <span class="entry-amount">$${e.amount.toFixed(2)}</span>
    </div>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showStatus(msg, type) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = type;
  el.classList.remove('hidden');
  setTimeout(() => { el.classList.add('hidden'); }, 3000);
}

// ==========================================================================
// Data loading
// ==========================================================================

async function loadTodayEntries() {
  try {
    const file = await githubGet(CONFIG.csvPath);
    if (!file) {
      state.todayEntries = [];
    } else {
      const content = decodeURIComponent(escape(atob(file.content)));
      state.todayEntries = parseCSV(content);
    }
  } catch (err) {
    console.error('Failed to load entries:', err);
    state.todayEntries = [];
  }
  updateDailyStatus();
  renderEntries();
}

// ==========================================================================
// Submit entry
// ==========================================================================

async function submitEntry() {
  if (state.submitting) return;

  const amount = parseFloat(state.amount);
  if (isNaN(amount) || amount <= 0 || !state.category) return;

  state.submitting = true;
  const btn = document.getElementById('submit-btn');
  btn.innerHTML = '<span class="spinner"></span>Logging...';
  btn.disabled = true;

  const entry = {
    timestamp: localISO(),
    amount: amount,
    category: state.category,
    note: document.getElementById('note-input').value.trim()
  };

  try {
    // Fetch current file
    const file = await githubGet(CONFIG.csvPath);
    let newContent;
    let sha = null;

    if (!file) {
      // Create new file
      newContent = CSV_HEADER + '\n' + entryToCSVRow(entry) + '\n';
    } else {
      // Append to existing
      sha = file.sha;
      const existing = decodeURIComponent(escape(atob(file.content)));
      const trimmed = existing.endsWith('\n') ? existing : existing + '\n';
      newContent = trimmed + entryToCSVRow(entry) + '\n';
    }

    const commitMsg = `spending: $${amount.toFixed(2)} ${entry.category}`;
    await githubPut(CONFIG.csvPath, newContent, sha, commitMsg);

    // Success
    state.todayEntries.push(entry);
    showStatus(`$${amount.toFixed(2)} ${entry.category} logged`, 'success');

    // Reset form
    state.amount = '';
    state.category = null;
    document.getElementById('note-input').value = '';
    document.querySelectorAll('.cat').forEach(b => b.classList.remove('selected'));
    updateAmountDisplay();
    updateDailyStatus();
    renderEntries();
  } catch (err) {
    console.error('Submit failed:', err);
    showStatus('Failed: ' + err.message, 'error');
  } finally {
    state.submitting = false;
    btn.innerHTML = 'Log';
    updateSubmitButton();
  }
}

// ==========================================================================
// Event handlers
// ==========================================================================

function initNumpad() {
  document.querySelectorAll('.num').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      if (val === 'del') {
        state.amount = state.amount.slice(0, -1);
      } else if (val === '.') {
        if (!state.amount.includes('.')) {
          state.amount += state.amount === '' ? '0.' : '.';
        }
      } else {
        // Limit to 2 decimal places
        if (state.amount.includes('.')) {
          const decimals = state.amount.split('.')[1];
          if (decimals && decimals.length >= 2) return;
        }
        // Prevent leading zeros (except "0.")
        if (state.amount === '0' && val !== '.') {
          state.amount = val;
        } else {
          state.amount += val;
        }
      }
      updateAmountDisplay();
    });
  });
}

function initCategories() {
  document.querySelectorAll('.cat').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.category = btn.dataset.cat;
      updateSubmitButton();
    });
  });
}

function initSubmit() {
  document.getElementById('submit-btn').addEventListener('click', submitEntry);
}

function initTokenSetup() {
  document.getElementById('save-token').addEventListener('click', () => {
    const token = document.getElementById('token-input').value.trim();
    if (!token) return;
    localStorage.setItem('gh_spending_token', token);
    state.token = token;
    document.getElementById('setup-modal').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    loadTodayEntries();
  });

  document.getElementById('reset-token').addEventListener('click', () => {
    if (confirm('Clear saved token?')) {
      localStorage.removeItem('gh_spending_token');
      state.token = null;
      document.getElementById('app').classList.add('hidden');
      document.getElementById('setup-modal').classList.remove('hidden');
      document.getElementById('token-input').value = '';
    }
  });

  document.getElementById('reset-wallet').addEventListener('click', () => {
    const newDate = prompt('Wallet start date (YYYY-MM-DD):', todayStr());
    if (newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      localStorage.setItem('wallet_start_date', newDate);
      state.walletStartDate = newDate;
      updateWalletBalance();
    }
  });
}

// ==========================================================================
// Init
// ==========================================================================

function init() {
  // Set date display
  document.getElementById('date-display').textContent = formatDate();

  // Check for saved token
  state.token = localStorage.getItem('gh_spending_token');

  if (state.token) {
    document.getElementById('app').classList.remove('hidden');
    loadTodayEntries();
  } else {
    document.getElementById('setup-modal').classList.remove('hidden');
  }

  initNumpad();
  initCategories();
  initSubmit();
  initTokenSetup();
}

document.addEventListener('DOMContentLoaded', init);
