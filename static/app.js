/* 
  LEADFORGE MAPS · B2B Lead Scraping & Discovery Engine
  Application Logic & 3D Micro-Interactions
*/

let allCategories = [];
let activeCategory = 'all';
let allLeads = [];
let activeTableFilter = 'all';
let pollInterval = null;

// 3D Graphic State
let isAutoRotating = false;
let isExploded = false;
let rotateAngle = 0;
let animationFrameId = null;

document.addEventListener('DOMContentLoaded', () => {
  init3DGraphic();
  initDropzone();
  initWorkflowTerminal();
  loadPresetCategories();
  loadResults();
  checkStatus();

  document.getElementById('scrapeForm').addEventListener('submit', handleScrapeSubmit);
  pollInterval = setInterval(checkStatus, 1500);
});

/* ==========================================================================
   1. 3D HERO GRAPHIC CONTROLLER (3D B2B PIPELINE BLOCK MODEL)
   ========================================================================== */
function init3DGraphic() {
  const container = document.getElementById('hero3DContainer');
  const cluster = document.getElementById('blocksCluster');
  if (!container || !cluster) return;

  // Mousemove perspective rotation calculation
  container.addEventListener('mousemove', (e) => {
    if (isAutoRotating) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateY = ((x - centerX) / centerX) * 25; // max 25deg
    const rotateX = -((y - centerY) / centerY) * 20; // max 20deg

    cluster.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });

  container.addEventListener('mouseleave', () => {
    if (!isAutoRotating) {
      cluster.style.transform = `rotateX(10deg) rotateY(-15deg)`;
    }
  });

  // Default initial perspective angle
  cluster.style.transform = `rotateX(10deg) rotateY(-15deg)`;
}

function toggleAutoRotate() {
  isAutoRotating = !isAutoRotating;
  const btn = document.getElementById('btnRotate3D');
  const cluster = document.getElementById('blocksCluster');
  
  if (isAutoRotating) {
    btn.classList.add('active');
    btn.innerHTML = `<i class="fa-solid fa-pause"></i> PAUSE ROTATE`;
    animate3DRotation();
  } else {
    btn.classList.remove('active');
    btn.innerHTML = `<i class="fa-solid fa-rotate"></i> AUTO ROTATE`;
    cancelAnimationFrame(animationFrameId);
    cluster.style.transform = `rotateX(10deg) rotateY(-15deg)`;
  }
}

function animate3DRotation() {
  if (!isAutoRotating) return;
  rotateAngle += 0.8;
  const cluster = document.getElementById('blocksCluster');
  if (cluster) {
    cluster.style.transform = `rotateX(12deg) rotateY(${rotateAngle}deg)`;
  }
  animationFrameId = requestAnimationFrame(animate3DRotation);
}

function toggleExplodeView() {
  isExploded = !isExploded;
  const btn = document.getElementById('btnExplode3D');
  const cluster = document.getElementById('blocksCluster');
  const blocks = document.querySelectorAll('.cad-num-block');

  if (isExploded) {
    btn.classList.add('active');
    cluster.style.gap = '40px';
    blocks.forEach((b, i) => {
      const zOffset = (i % 2 === 0 ? 30 : -20);
      b.style.transform = `translateZ(${zOffset}px) scale(1.08)`;
    });
  } else {
    btn.classList.remove('active');
    cluster.style.gap = '16px';
    blocks.forEach(b => {
      b.style.transform = 'none';
    });
  }
}

function reset3DView() {
  isAutoRotating = false;
  isExploded = false;
  cancelAnimationFrame(animationFrameId);
  
  document.getElementById('btnRotate3D').classList.remove('active');
  document.getElementById('btnRotate3D').innerHTML = `<i class="fa-solid fa-rotate"></i> AUTO ROTATE`;
  document.getElementById('btnExplode3D').classList.remove('active');

  const cluster = document.getElementById('blocksCluster');
  if (cluster) {
    cluster.style.gap = '16px';
    cluster.style.transform = `rotateX(10deg) rotateY(-15deg)`;
  }
  
  document.querySelectorAll('.cad-num-block').forEach(b => {
    b.style.transform = 'none';
  });
  showToast('3D B2B model perspective view reset', 'info');
}

/* ==========================================================================
   2. DRAG-AND-DROP TARGET LIST DROPZONE
   ========================================================================== */
function initDropzone() {
  const dropzone = document.getElementById('cadDropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
  });

  dropzone.addEventListener('drop', handleDrop, false);
}

function triggerFileUpload() {
  document.getElementById('cadFileInput').click();
}

async function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length > 0) {
    processTargetFile(files[0]);
  }
}

function handleFileSelected(e) {
  const files = e.target.files;
  if (files.length > 0) {
    processTargetFile(files[0]);
  }
}

async function processTargetFile(file) {
  showToast(`Uploading & Parsing Target List: "${file.name}"...`, 'info');
  
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload-targets', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      document.getElementById('cadFileName').innerText = data.filename;
      document.getElementById('cadDims').innerText = `${data.targets_count} Search Queries`;
      document.getElementById('cadVol').innerText = `${data.estimated_leads} Est. Leads`;
      document.getElementById('cadStock').innerText = data.suggested_query;
      document.getElementById('cadNiche').innerText = data.suggested_location || 'Austin, TX';
      
      document.getElementById('cadAnalysisResult').classList.add('active');
      showToast(data.message, 'success');
      
      // Auto-set suggested query & location
      if (data.suggested_query) {
        document.getElementById('queryInput').value = data.suggested_query;
        document.getElementById('locationInput').value = data.suggested_location || 'Austin, TX';
      }
    }
  } catch (err) {
    showToast('Failed to parse Target file', 'error');
  }
}

function applyCadSuggestedQuery() {
  const query = document.getElementById('cadStock').innerText || 'Dentists';
  const location = document.getElementById('cadNiche').innerText || 'Austin, TX';
  document.getElementById('queryInput').value = query;
  document.getElementById('locationInput').value = location;
  showToast(`Applied Search Target: "${query}" in "${location}" to search form!`, 'success');
  scrollToControl();
}

function scrollToControl() {
  document.getElementById('scrapeForm').scrollIntoView({ behavior: 'smooth' });
}

/* ==========================================================================
   3. STEP-BY-STEP WORKFLOW TERMINAL SIMULATION
   ========================================================================== */
function initWorkflowTerminal() {
  const terminalContent = document.getElementById('terminalGCodeContent');
  if (!terminalContent) return;

  const sampleLogs = [
    "[SYSTEM] INITIALIZING LEADFORGE MAPS SCRAPING ENGINE V3.6...",
    "[STEALTH] LOADING PLAYWRIGHT STEALTHY FETCHER AGENT",
    "[01 TARGET DISCOVERY] NICHE CRITERIA VERIFIED",
    "[02 MAPS FEED] SEARCHING GOOGLE MAPS FOR TARGET...",
    "[FEED] PARSING BUSINESS CARDS FROM FEED CONTAINER",
    "FOUND 30 BUSINESS NODES IN SEARCH FEED",
    "[03 ENRICHMENT] VISITING PLACE URLS FOR DIRECT PHONES...",
    "[EXTRACT] PHONE EXTRACTED: +1 (512) 555-0192",
    "[EXTRACT] WEBSITE EXTRACTED: https://austindentalarts.com",
    "[04 EXPORT] CLEAN CSV DATASET GENERATED",
    "[READY] 30 B2B LEADS EXTRACTED AND LOADED"
  ];

  let lineIdx = 6;
  setInterval(() => {
    if (lineIdx < sampleLogs.length) {
      const lineText = sampleLogs[lineIdx];
      const ln = (lineIdx + 1).toString().padStart(2, '0');
      const div = document.createElement('div');
      div.className = 'terminal-line';
      div.innerHTML = `<span class="terminal-ln">${ln}</span>${escapeHtml(lineText)}`;
      terminalContent.appendChild(div);
      terminalContent.scrollTop = terminalContent.scrollHeight;
      lineIdx++;
    }
  }, 3000);
}

/* ==========================================================================
   4. PRESET CATEGORIES & DISCOVERY HUB
   ========================================================================== */
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
            <span class="badge badge-green">${t.badge}</span>
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
  showToast(`Selected Target: "${query}" in "${location}"`, 'success');
  scrollToControl();
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

/* ==========================================================================
   5. SCRAPE SUBMISSION & STATUS POLLING
   ========================================================================== */
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
      btn.innerHTML = `<i class="fa-solid fa-rocket"></i> Launch Lead Scraper →`;
    }
  } catch (err) {
    showToast('Server connection error', 'error');
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-rocket"></i> Launch Lead Scraper →`;
  }
}

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

      updateWorkflowActiveStep(data.phase);
    } else {
      pill.className = 'status-pill';
      statusText.innerText = data.phase === 'completed' ? 'Done' : 'Ready to Scrape';
      phaseBadge.innerText = data.phase.toUpperCase();
      phaseBadge.className = data.phase === 'completed' ? 'badge badge-green' : 'badge badge-dark';
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-rocket"></i> Launch Lead Scraper →`;

      if (data.phase === 'completed') {
        statusMsg.innerText = `Completed! ${data.results_count} leads extracted.`;
        progressFill.style.width = '100%';
        counter.innerText = `${data.results_count} / ${data.results_count}`;
        updateWorkflowActiveStep('completed');
        loadResults();
      }
    }

    if (data.logs && data.logs.length > 0) {
      const consoleBox = document.getElementById('consoleLogs');
      consoleBox.innerHTML = data.logs.map(log => `<div class="log-entry">${escapeHtml(log)}</div>`).join('');
      consoleBox.scrollTop = consoleBox.scrollHeight;
    }
  } catch (err) {
    console.error('Status check error', err);
  }
}

function updateWorkflowActiveStep(phase) {
  const cards = document.querySelectorAll('.workflow-card');
  cards.forEach(c => c.classList.remove('active'));

  if (phase === 'searching') {
    cards[0].classList.add('active');
    cards[1].classList.add('active');
  } else if (phase === 'enriching') {
    cards[0].classList.add('active');
    cards[1].classList.add('active');
    cards[2].classList.add('active');
  } else if (phase === 'completed') {
    cards.forEach(c => c.classList.add('active'));
  } else {
    cards[0].classList.add('active');
  }
}

/* ==========================================================================
   6. RESULTS TABLE & KPI METRICS
   ========================================================================== */
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
    document.getElementById('kpiNoWebCount').innerText = '0';
    document.getElementById('kpiAvgRating').innerText = '0.0';
    return;
  }

  const withPhone = allLeads.filter(l => l.phone && l.phone.trim().length > 3).length;
  const withWeb = allLeads.filter(l => l.website && l.website.trim().length > 5).length;
  const noWeb = total - withWeb;
  
  let totalRating = 0;
  let ratingCount = 0;
  allLeads.forEach(l => {
    if (l.rating_raw) {
      const match = l.rating_raw.match(/([\d.]+)/);
      if (match) {
        totalRating += parseFloat(match[1]);
        ratingCount++;
      }
    }
  });
  const avgRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : '4.6';

  const phonePct = Math.round((withPhone / total) * 100);

  document.getElementById('kpiPhonePct').innerText = `${phonePct}%`;
  document.getElementById('kpiNoWebCount').innerText = `${noWeb}`;
  document.getElementById('kpiAvgRating').innerText = avgRating;
}

function filterLeads(filter, btn) {
  activeTableFilter = filter;
  const buttons = document.querySelectorAll('#tableFilters .category-tab');
  buttons.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLeadsTable();
}

function renderLeadsTable() {
  const tbody = document.getElementById('leadsTableBody');

  let filtered = allLeads.filter(lead => {
    if (activeTableFilter === 'phone' && (!lead.phone || lead.phone.trim().length < 3)) return false;
    if (activeTableFilter === 'nowebsite' && (lead.website && lead.website.trim().length >= 5)) return false;
    if (activeTableFilter === 'highrating') {
      const match = (lead.rating_raw || '').match(/([\d.]+)/);
      if (!match || parseFloat(match[1]) < 4.5) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">
          No leads matching the selected filter. Select "All Leads" or launch a new scrape job above.
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
        <td style="font-family: var(--font-mono); font-weight: 600;">${i + 1}</td>
        <td style="font-weight: 700;">${name}</td>
        <td class="table-phone">
          ${phone ? `
            <a href="tel:${phone}" style="color: var(--text-main); text-decoration: none;"><i class="fa-solid fa-phone"></i> ${phone}</a>
            <button class="btn-text" onclick="copyText('${phone}')" title="Copy Phone" style="margin-left: 6px;"><i class="fa-solid fa-copy"></i></button>
          ` : '<span style="color: var(--text-muted);">N/A</span>'}
        </td>
        <td class="table-website">
          ${!hasNoWeb ? `
            <a href="${website}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${website.replace(/^https?:\/\//, '').split('/')[0]}</a>
          ` : `
            <span class="badge-noweb"><i class="fa-solid fa-triangle-exclamation"></i> Pitch Target</span>
          `}
        </td>
        <td style="max-width: 220px; font-size: 0.8rem; color: var(--text-muted);">${address}</td>
        <td style="font-family: var(--font-mono); color: #b45309;"><i class="fa-solid fa-star"></i> ${rating}</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${hasNoWeb ? `
              <button class="btn btn-primary" onclick="pitchWebsite('${escapeHtml(lead.name || '')}')" style="padding: 4px 10px; font-size: 0.75rem;">
                <i class="fa-solid fa-paper-plane"></i> Pitch
              </button>
            ` : ''}
            <a href="${mapsUrl}" target="_blank" class="btn btn-outline" style="padding: 4px 10px; font-size: 0.75rem;">
              <i class="fa-solid fa-map-location-dot"></i> Maps
            </a>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

/* ==========================================================================
   7. UTILITY & HELPER FUNCTIONS
   ========================================================================== */
function copyText(text) {
  navigator.clipboard.writeText(text);
  showToast(`Copied: ${text}`, 'success');
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

function copyLogs() {
  const logs = document.getElementById('consoleLogs').innerText;
  navigator.clipboard.writeText(logs);
  showToast('Copied terminal logs to clipboard!', 'success');
}

function clearLogs() {
  document.getElementById('consoleLogs').innerHTML = '<div class="log-entry system">[Logs Cleared]</div>';
}

function pitchWebsite(businessName) {
  const pitchText = `Hi ${businessName} team,\n\nI noticed your business doesn't have an official website listed on Google Maps. We specialize in building fast, modern websites for local businesses that turn search visitors into paying customers.\n\nWould you be open to a quick 2-minute demo preview of a custom website for ${businessName}?`;
  navigator.clipboard.writeText(pitchText);
  showToast(`📋 Copied custom Web Pitch for "${businessName}" to clipboard!`, 'success');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
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
