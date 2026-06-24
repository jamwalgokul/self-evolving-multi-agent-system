// ============================================================
// DASHBOARD SERVER — Local API + Static File Server
// ============================================================

import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MemoryStore } from '../engine/memory-store.js';
import { Orchestrator } from '../engine/orchestrator.js';
import { EvolutionScheduler } from '../engine/evolution/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(WORKSPACE_ROOT, 'reports');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ---- API Routes ----

// Get all agent statuses
app.get('/api/agents', (req, res) => {
  const agents = ['locator', 'errormax', 'securemax', 'fullmax'];
  const statuses = {};

  for (const name of agents) {
    const mem = new MemoryStore(name);
    statuses[name] = {
      name,
      memory: mem.getSummary(),
      lastActivity: getLastActivity(mem)
    };
  }

  res.json(statuses);
});

// Get all reports
app.get('/api/reports', (req, res) => {
  if (!fs.existsSync(REPORTS_DIR)) {
    return res.json({});
  }

  const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md'));
  const reports = {};

  for (const file of files) {
    const filePath = path.join(REPORTS_DIR, file);
    const stat = fs.statSync(filePath);
    reports[file] = {
      name: file,
      content: fs.readFileSync(filePath, 'utf-8'),
      size: stat.size,
      modified: stat.mtime.toISOString()
    };
  }

  res.json(reports);
});

// Get specific report
app.get('/api/reports/:name', (req, res) => {
  const filePath = path.join(REPORTS_DIR, req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.json({
    name: req.params.name,
    content: fs.readFileSync(filePath, 'utf-8')
  });
});

// Get evolution data
app.get('/api/evolution', (req, res) => {
  const mem = new MemoryStore('evolution');
  res.json({
    trends: mem.recallRecent('trends', 5),
    cves: mem.recallRecent('cves', 5),
    changelog: mem.recallRecent('changelog', 20),
    summary: mem.getSummary()
  });
});

// Get agent memory
app.get('/api/memory/:agent', (req, res) => {
  const mem = new MemoryStore(req.params.agent);
  res.json(mem.getSummary());
});

// Run agent
app.post('/api/run/:agent', async (req, res) => {
  const { agent } = req.params;
  const { target } = req.body;
  const targetDir = path.resolve(target || './projects');

  try {
    const orchestrator = new Orchestrator();

    if (agent === 'fullstack-run') {
      const result = await orchestrator.fullstackRun(targetDir, {
        onLog: () => {}
      });
      res.json({ success: true, result: result.consolidated });
    } else {
      const result = await orchestrator.runSingle(agent, targetDir, {
        onLog: () => {}
      });
      res.json({ success: true, result });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run evolution
app.post('/api/evolve', async (req, res) => {
  try {
    const scheduler = new EvolutionScheduler();
    const result = await scheduler.runNow({ onLog: () => {} });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function getLastActivity(mem) {
  const summary = mem.getSummary();
  const dates = Object.values(summary).map(s => s.lastUpdated).filter(Boolean);
  if (dates.length === 0) return 'never';
  return dates.sort().reverse()[0];
}

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log(`  🖥️  AI-WORKSPACE Dashboard`);
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`  📡 API: http://localhost:${PORT}/api`);
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');
});
