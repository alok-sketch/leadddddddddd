let allCategories = [];
let activeCategory = 'all';
let allLeads = [];
let activeFilter = 'all';
let pollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  loadPresetCategories();
  loadResults();
  checkStatus();
  
  document.getElementById('scrapeForm').addEventListener('submit', handleScrapeSubmit);
  
  // Start polling status
  pollInterval = setInterval(checkStatus, 1500);
});

// Fetch Preset Categories ("Whom to Search")
async function loadPresetCategories() {
  try {
    const res = await fetch('/api/preset-categories');
    const data = await res.json();
    allCategories = data.categories || [];
    renderCategoryTabs();
    renderTargetsGrid();
  } catch (err) {
    console.error('Failed loading preset categories', err);
  }
}

function renderCategoryTabs() {
  const container = document.getElementById('categoryTabs');
  if (!container) return;

  let html = `<button class="category-tab active" onclick="selectCategory('all', this)">All Categories</button>`;
  allCategories.forEach(cat => {
    html += `<button class="category-tab" onclick="selectCategory('${cat.id}', this)"><i class="fa-solid ${cat.icon}"></i> ${cat.category}</button>`;
  });
  container.innerHTML = html;
}

function selectCategory(catId, btn) {
  activeCategory = catId;
  document.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTargetsGrid();
}

function renderTargetsGrid() {
  const container = document.getElementById('targetsGrid');
  if (!container) return;

  let targetsToDisplay = [];
  allCategories.forEach(cat => {
    if (activeCategory === 'all' || activeCategory === cat.id) {
      cat.targets.forEach(t => {
        targetsToDisplay.push({ ...t, categoryName: cat.category, catIcon: cat.icon });
      });
    }
  });

  let html = '';
  targetsToDisplay.forEach(t => {
    html += `
      <div class="target-card">
        <div>
          <div class="target-header">
            <span class="target-title">${t.title}</span>
            <span class="badge badge-accent">${t.badge}</span>
          </div>
          <p class="target-desc">${t.desc}</p>
        </div>
        <div class="target-meta">
          <span>Est. Value: <strong class="value-tag">${t.lead_value}</strong></span>
          <button type="button" class="target-select-btn" onclick="applyTarget('${t.query}', '${t.sample_location}')">
            <i class="fa-solid fa-crosshairs"></i> Select Target
          </button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function applyTarget(query, location) {
  document.getElementById('queryInput').value = query;
  document.getElementById('locationInput').value = location;
  showToast(`Selected Target: "${query}" in "${location}"`);
  document.getElementById('scrapeForm').scrollIntoView({ behavior: 'smooth' });
}

function setQuery(q) {
  document.getElementById('queryInput').value = q;
}

function setLocation(loc) {
  document.getElementById('locationInput').value = loc;
}

function syncMaxResults(val) {
  document.getElementById('maxResultsInput').value = val;
}

function syncMaxResultsRange(val) {
  document.getElementById('maxResultsRange').value = val;
}

// Scrape Submission
async function handleScrapeSubmit(e) {
  e.preventDefault();

  const query = document.getElementById('queryInput').value.trim();
  const location = document.getElementById('locationInput').value.trim();
  const max_results = parseInt(document.getElementById('maxResultsInput').value) || 30;
  const delay = parseFloat(document.getElementById('delayInput').value) || 1.5;
  const enrich = document.getElementById('enrichToggle').checked;

  if (!query || !location) {
    showToast('Please enter both Query and Location!', 'warning');
    return;
  }

  const btn = document.getElementById('startScrapeBtn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Launching Engine...`;

  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, location, max_results, enrich, delay })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Scraping job launched! Monitoring progress...', 'success');
    } else {
      showToast(data.detail || 'Failed to start scraping', 'error');
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-rocket"></i> Launch Lead Scraper`;
    }
  } catch (err) {
    showToast('Server connection error', 'error');
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-rocket"></i> Launch Lead Scraper`;
  }
}

// Status Polling
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const data = await res.json();

    const pill = document.getElementById('globalStatusPill');
    const statusText = document.getElementById('globalStatusText');
    const phaseBadge = document.getElementById('phaseBadge');
    const statusMsg = document.getElementById('currentStatusMessage');
    const counter = document.getElementById('progressCounter');
    const progressFill = document.getElementById('progressBarFill');
    const btn = document.getElementById('startScrapeBtn');

    if (data.is_running) {
      pill.className = 'status-pill running';
      statusText.innerText = 'Scraping Active';
      phaseBadge.innerText = data.phase.toUpperCase();
      phaseBadge.className = 'badge badge-amber';
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Scraping in Progress...`;

      statusMsg.innerText = data.current_status;
      counter.innerText = `${data.progress} / ${data.total}`;
      const pct = data.total > 0 ? Math.min(100, Math.round((data.progress / data.total) * 100)) : 0;
      progressFill.style.width = `${pct}%`;
    } else {
      pill.className = 'status-pill';
      statusText.innerText = data.phase === 'completed' ? 'Done' : 'Ready';
      phaseBadge.innerText = data.phase.toUpperCase();
      phaseBadge.className = data.phase === 'completed' ? 'badge badge-green' : 'badge badge-accent';
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-rocket"></i> Launch Lead Scraper`;

      if (data.phase === 'completed') {
        statusMsg.innerText = `Completed! ${data.results_count} leads extracted.`;
        progressFill.style.width = '100%';
        counter.innerText = `${data.results_count} / ${data.results_count}`;
        loadResults(); // Refresh table
      }
    }

    // Update Console Logs
    if (data.logs && data.logs.length > 0) {
      const consoleBox = document.getElementById('consoleLogs');
      consoleBox.innerHTML = data.logs.map(log => `<div class="log-entry">${escapeHtml(log)}</div>`).join('');
      consoleBox.scrollTop = consoleBox.scrollHeight;
    }
  } catch (err) {
    console.error('Status check error', err);
  }
}

// Load Results
async function loadResults() {
  try {
    const res = await fetch('/api/results');
    const data = await res.json();
    allLeads = data.results || [];
    renderKPIs();
    renderLeadsTable();
  } catch (err) {
    console.error('Failed loading results', err);
  }
}

function renderKPIs() {
  const total = allLeads.length;
  document.getElementById('kpiTotalCount').innerText = total;

  if (total === 0) {
    document.getElementById('kpiPhonePct').innerText = '0%';
    document.getElementById('kpiWebPct').innerText = '0%';
    document.getElementById('kpiNoWebCount').innerText = '0';
    return;
  }

  const withPhone = allLeads.filter(l => l.phone && l.phone.trim().length > 3).length;
  const withWeb = allLeads.filter(l => l.website && l.website.trim().length > 5).length;
  const noWeb = total - withWeb;

  const phonePct = Math.round((withPhone / total) * 100);
  const webPct = Math.round((withWeb / total) * 100);
  const noWebPct = Math.round((noWeb / total) * 100);

  document.getElementById('kpiPhonePct').innerText = `${phonePct}%`;
  document.getElementById('kpiWebPct').innerText = `${webPct}%`;
  document.getElementById('kpiNoWebCount').innerText = `${noWeb} (${noWebPct}%)`;
}

function setFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLeadsTable();
}

function filterTable() {
  renderLeadsTable();
}

function renderLeadsTable() {
  const tbody = document.getElementById('leadsTableBody');
  const search = document.getElementById('tableSearchInput').value.toLowerCase().trim();

  let filtered = allLeads.filter(lead => {
    // Category filter
    if (activeFilter === 'phone' && (!lead.phone || lead.phone.trim().length < 3)) return false;
    if (activeFilter === 'website' && (!lead.website || lead.website.trim().length < 5)) return false;
    if (activeFilter === 'no_website' && (lead.website && lead.website.trim().length >= 5)) return false;

    // Search input
    if (search) {
      const name = (lead.name || '').toLowerCase();
      const phone = (lead.phone || '').toLowerCase();
      const web = (lead.website || '').toLowerCase();
      const addr = (lead.address || '').toLowerCase();
      return name.includes(search) || phone.includes(search) || web.includes(search) || addr.includes(search);
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <i class="fa-solid fa-folder-open empty-icon"></i>
          <p>No matching leads found for this filter.</p>
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  filtered.forEach((lead, i) => {
    const name = escapeHtml(lead.name || 'N/A');
    const phone = lead.phone ? escapeHtml(lead.phone) : '';
    const website = lead.website ? escapeHtml(lead.website) : '';
    const address = lead.address ? escapeHtml(lead.address) : 'N/A';
    const rating = lead.rating_raw ? escapeHtml(lead.rating_raw) : 'N/A';
    const mapsUrl = lead.place_url ? escapeHtml(lead.place_url) : '#';
    const hasNoWeb = !website || website.trim().length < 5;

    html += `
      <tr>
        <td>${i + 1}</td>
        <td class="business-name">${name}</td>
        <td class="star-rating"><i class="fa-solid fa-star"></i> ${rating}</td>
        <td>
          ${phone ? `
            <a href="tel:${phone}" class="phone-link"><i class="fa-solid fa-phone"></i> ${phone}</a>
            <button class="copy-btn" onclick="copyText('${phone}')" title="Copy Phone"><i class="fa-solid fa-copy"></i></button>
          ` : '<span class="text-dim">N/A</span>'}
        </td>
        <td>
          ${!hasNoWeb ? `
            <a href="${website}" target="_blank" rel="noopener" class="web-link" title="${website}"><i class="fa-solid fa-arrow-up-right-from-square"></i> Visit Site</a>
          ` : `
            <span class="badge-noweb"><i class="fa-solid fa-triangle-exclamation"></i> No Website</span>
          `}
        </td>
        <td style="max-width: 220px; font-size: 0.8rem; color: var(--text-muted);">${address}</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${hasNoWeb ? `
              <button class="pitch-btn" onclick="pitchWebsite('${escapeHtml(lead.name || '')}')" title="Copy Website Offer Pitch">
                <i class="fa-solid fa-paper-plane"></i> Pitch
              </button>
            ` : ''}
            <a href="${mapsUrl}" target="_blank" class="btn btn-outline" style="padding: 4px 10px; font-size: 0.76rem;">
              <i class="fa-solid fa-map-location-dot"></i> Maps
            </a>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function copyText(text) {
  navigator.clipboard.writeText(text);
  showToast(`Copied: ${text}`, 'info');
}

function copyAllPhones() {
  const phones = allLeads.map(l => l.phone).filter(p => p && p.trim().length > 3);
  if (phones.length === 0) {
    showToast('No phone numbers available to copy!', 'warning');
    return;
  }
  navigator.clipboard.writeText(phones.join('\n'));
  showToast(`Copied ${phones.length} phone numbers to clipboard!`, 'success');
}

function copyNoWebsitePhones() {
  const noWebLeads = allLeads.filter(l => !l.website || l.website.trim().length < 5);
  const phones = noWebLeads.map(l => l.phone).filter(p => p && p.trim().length > 3);
  
  if (phones.length === 0) {
    showToast('No phone numbers found for businesses without a website!', 'warning');
    return;
  }
  navigator.clipboard.writeText(phones.join('\n'));
  showToast(`🔥 Copied ${phones.length} pitch target phone numbers (No Website)!`, 'success');
}

function pitchWebsite(businessName) {
  const pitchText = `Hi ${businessName} team,\n\nI noticed your business doesn't have an official website listed on Google Maps. We specialize in building fast, modern websites for local businesses that turn search visitors into paying customers.\n\nWould you be open to a quick 2-minute demo preview of a custom website for ${businessName}?`;
  navigator.clipboard.writeText(pitchText);
  showToast(`📋 Copied custom Web Design Pitch for "${businessName}" to clipboard!`, 'success');
}

function clearLogs() {
  document.getElementById('consoleLogs').innerHTML = '<div class="log-entry system">[Logs Cleared]</div>';
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'warning') icon = 'fa-triangle-exclamation';
  if (type === 'error') icon = 'fa-circle-xmark';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
