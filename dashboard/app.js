// ============================================================
// DASHBOARD APP — Frontend Logic
// ============================================================

const API_BASE = '';

// ---- State ----
let currentSection = 'dashboard';
let reports = {};
let agentStatuses = {};

// ---- Navigation ----

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    if (section) navigateTo(section);
  });
});

function navigateTo(section) {
  currentSection = section;

  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = document.querySelector(`[data-section="${section}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Update sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const activeSection = document.getElementById(`section-${section}`);
  if (activeSection) activeSection.classList.add('active');

  // Update title
  const titles = {
    dashboard: 'Dashboard',
    agents: 'Agent Control Panel',
    reports: 'Reports',
    evolution: 'Evolution Feed',
    knowledge: 'Knowledge Base'
  };
  document.getElementById('page-title').textContent = titles[section] || section;

  // Load data for section
  loadSectionData(section);

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

// ---- Sidebar Toggle ----

document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ---- Top Bar Actions ----

document.getElementById('btn-evolve')?.addEventListener('click', runEvolution);
document.getElementById('btn-fullstack-run')?.addEventListener('click', runFullstack);

// ---- Data Loading ----

async function loadSectionData(section) {
  switch (section) {
    case 'dashboard': await loadDashboard(); break;
    case 'reports': await loadReports(); break;
    case 'evolution': await loadEvolution(); break;
    case 'knowledge': await loadKnowledge(); break;
  }
}

async function loadDashboard() {
  try {
    // Load agent statuses
    const agentsRes = await fetch(`${API_BASE}/api/agents`);
    if (agentsRes.ok) {
      agentStatuses = await agentsRes.json();
      updateAgentCards(agentStatuses);
    }

    // Load reports for stats
    const reportsRes = await fetch(`${API_BASE}/api/reports`);
    if (reportsRes.ok) {
      reports = await reportsRes.json();
      updateStats(reports);
    }

    // Load evolution data
    const evolRes = await fetch(`${API_BASE}/api/evolution`);
    if (evolRes.ok) {
      const evolData = await evolRes.json();
      updateEvolutionStat(evolData);
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

function updateAgentCards(statuses) {
  for (const [name, data] of Object.entries(statuses)) {
    const memEl = document.getElementById(`mem-${name}`);
    const lastEl = document.getElementById(`last-${name}`);

    if (memEl) {
      const totalEntries = Object.values(data.memory || {}).reduce((sum, m) => sum + (m.entries || 0), 0);
      memEl.textContent = `${totalEntries} entries`;
    }

    if (lastEl) {
      lastEl.textContent = data.lastActivity === 'never' ? 'Never' : formatDate(data.lastActivity);
    }
  }
}

function updateStats(reports) {
  // Parse final report for stats
  const finalReport = reports['final-report.md'];
  if (finalReport) {
    const content = finalReport.content;

    // Health
    const healthMatch = content.match(/Overall Health.*?(HEALTHY|FAIR|POOR|CRITICAL)/i);
    if (healthMatch) {
      document.getElementById('val-health').textContent = healthMatch[1];
    }

    // Security
    const riskMatch = content.match(/Risk Level.*?(LOW|MEDIUM|HIGH|CRITICAL|SAFE)/i);
    if (riskMatch) {
      document.getElementById('val-security').textContent = riskMatch[1];
    }
  }

  // Bugs from locator report
  const locatorReport = reports['locator-report.md'];
  if (locatorReport) {
    const bugsMatch = locatorReport.content.match(/Total Issues \| (\d+)/);
    if (bugsMatch) {
      document.getElementById('val-bugs').textContent = bugsMatch[1];
    }
  }
}

function updateEvolutionStat(evolData) {
  const changelog = evolData.changelog || [];
  if (changelog.length > 0) {
    const last = changelog[changelog.length - 1];
    document.getElementById('val-evolution').textContent = formatDate(last.timestamp);
  }
}

// ---- Reports Section ----

async function loadReports() {
  try {
    const res = await fetch(`${API_BASE}/api/reports`);
    if (!res.ok) return;

    reports = await res.json();
    const container = document.getElementById('reports-list');

    if (Object.keys(reports).length === 0) {
      container.innerHTML = '<p class="empty-state">No reports yet. Run agents to generate reports.</p>';
      return;
    }

    const icons = {
      'locator-report.md': '🔍',
      'errormax-report.md': '🐛',
      'securemax-report.md': '🛡️',
      'final-report.md': '🧠',
      'evolution-report.md': '🧬'
    };

    container.innerHTML = Object.entries(reports).map(([name, data]) => `
      <div class="report-card" onclick="viewReport('${name}')">
        <div class="report-card-title">${icons[name] || '📄'} ${name}</div>
        <div class="report-card-meta">
          ${(data.size / 1024).toFixed(1)} KB • ${formatDate(data.modified)}
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Failed to load reports:', err);
  }
}

function viewReport(name) {
  const report = reports[name];
  if (!report) return;

  document.getElementById('report-viewer-title').textContent = name;
  document.getElementById('report-viewer-content').innerHTML = markdownToHtml(report.content);
  document.getElementById('report-viewer').style.display = 'block';
}

function closeReportViewer() {
  document.getElementById('report-viewer').style.display = 'none';
}

// ---- Evolution Section ----

async function loadEvolution() {
  try {
    const res = await fetch(`${API_BASE}/api/evolution`);
    if (!res.ok) return;

    const data = await res.json();
    const timeline = document.getElementById('evolution-timeline');

    const changelog = data.changelog || [];
    if (changelog.length === 0) {
      timeline.innerHTML = '<p class="empty-state">No evolution data yet. Click "Evolve Now" to fetch latest trends and CVEs.</p>';
      return;
    }

    timeline.innerHTML = changelog.reverse().map(entry => `
      <div class="evolution-entry">
        <div class="evolution-entry-header">
          <span class="evolution-entry-title">🧬 Evolution Cycle</span>
          <span class="evolution-entry-date">${formatDate(entry.timestamp)}</span>
        </div>
        <div class="evolution-entry-body">
          ${entry.knowledge?.summary || entry.summary || `Trends: ${entry.knowledge?.trendsCount || entry.trendsCount || 0} | CVEs: ${entry.knowledge?.cvesCount || entry.cvesCount || 0} | Agents Updated: ${(entry.knowledge?.agentsUpdated || entry.agentsUpdated || []).length}`}
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Failed to load evolution:', err);
  }
}

// ---- Knowledge Base Section ----

async function loadKnowledge() {
  try {
    const agents = ['locator', 'errormax', 'securemax', 'fullmax', 'evolution'];
    const grid = document.getElementById('knowledge-grid');

    const icons = {
      locator: '🔍', errormax: '🐛', securemax: '🛡️', fullmax: '🧠', evolution: '🧬'
    };

    let html = '';
    let hasData = false;

    for (const agent of agents) {
      const res = await fetch(`${API_BASE}/api/memory/${agent}`);
      if (!res.ok) continue;

      const summary = await res.json();
      const categories = Object.keys(summary);
      if (categories.length === 0) continue;

      hasData = true;
      const totalEntries = categories.reduce((sum, cat) => sum + (summary[cat].entries || 0), 0);

      html += `
        <div class="knowledge-card">
          <div class="knowledge-card-header">
            <span class="knowledge-card-icon">${icons[agent] || '📦'}</span>
            <span class="knowledge-card-title">${agent.charAt(0).toUpperCase() + agent.slice(1)}</span>
          </div>
          <div class="knowledge-card-stats">
            <div class="knowledge-stat">
              <span class="knowledge-stat-label">Total Entries</span>
              <span class="knowledge-stat-value">${totalEntries}</span>
            </div>
            ${categories.map(cat => `
              <div class="knowledge-stat">
                <span class="knowledge-stat-label">${cat}</span>
                <span class="knowledge-stat-value">${summary[cat].entries} (v${summary[cat].version})</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    grid.innerHTML = hasData ? html : '<p class="empty-state">Knowledge base is empty. Run agents or evolution to populate.</p>';

  } catch (err) {
    console.error('Failed to load knowledge:', err);
  }
}

// ---- Agent Actions ----

async function runAgent(agentName) {
  const target = document.getElementById('target-dir')?.value || './projects';
  showLoading(`Running ${agentName}...`);

  try {
    const res = await fetch(`${API_BASE}/api/run/${agentName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target })
    });

    const data = await res.json();

    if (data.success) {
      showToast(`${agentName} completed successfully!`, 'success');
      await loadDashboard();
    } else {
      showToast(`${agentName} failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }

  hideLoading();
}

async function runFullstack() {
  const target = document.getElementById('target-dir')?.value || './projects';
  showLoading('Running full-stack agent pipeline...');

  try {
    const res = await fetch(`${API_BASE}/api/run/fullstack-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target })
    });

    const data = await res.json();

    if (data.success) {
      showToast('Full-stack run completed!', 'success');
      await loadDashboard();
    } else {
      showToast(`Full-stack run failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }

  hideLoading();
}

async function runEvolution() {
  showLoading('Running evolution cycle — fetching trends & CVEs...');

  try {
    const res = await fetch(`${API_BASE}/api/evolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();

    if (data.success) {
      showToast('Evolution cycle completed! Agents updated.', 'success');
      await loadDashboard();
    } else {
      showToast(`Evolution failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }

  hideLoading();
}

// ---- UI Helpers ----

function showLoading(text) {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'never') return 'Never';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

// ---- Simple Markdown to HTML ----

function markdownToHtml(md) {
  if (!md) return '';

  let html = md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--accent-cyan)">$1</a>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Tables
    .replace(/^\|(.+)\|$/gm, (match, content) => {
      const cells = content.split('|').map(c => c.trim());
      if (cells.every(c => c.match(/^[-:]+$/))) return '';
      const tag = cells.every(c => c.match(/^[A-Z\s|]+$/i)) ? 'th' : 'td';
      return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
    })
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap tables
  html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, (match) => {
    if (!match.startsWith('<table>')) return `<table>${match}</table>`;
    return match;
  });

  return `<p>${html}</p>`;
}

// ---- Initial Load ----

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});
