// ============================================================
// MEMORY STORE — Per-Agent Persistent JSON Memory
// ============================================================
// Each agent has isolated memory. Supports remember/recall/forget/evolve.
// Data stored in /memory/<agent>/ as JSON files.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(WORKSPACE_ROOT, 'memory');

const MAX_ENTRIES_PER_CATEGORY = 100;

export class MemoryStore {
  constructor(agentName) {
    this.agentName = agentName;
    this.memoryDir = path.join(MEMORY_DIR, agentName);
    this._ensureDir(this.memoryDir);
    this.cache = {};
  }

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _filePath(category) {
    return path.join(this.memoryDir, `${category}.json`);
  }

  _load(category) {
    if (this.cache[category]) return this.cache[category];
    const fp = this._filePath(category);
    if (fs.existsSync(fp)) {
      try {
        const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        this.cache[category] = data;
        return data;
      } catch {
        return { entries: [], metadata: { created: new Date().toISOString(), version: 1 } };
      }
    }
    return { entries: [], metadata: { created: new Date().toISOString(), version: 1 } };
  }

  _save(category, data) {
    // Prune if over limit
    if (data.entries && data.entries.length > MAX_ENTRIES_PER_CATEGORY) {
      data.entries = data.entries.slice(-MAX_ENTRIES_PER_CATEGORY);
    }
    data.metadata = data.metadata || {};
    data.metadata.lastUpdated = new Date().toISOString();
    data.metadata.version = (data.metadata.version || 0) + 1;
    this.cache[category] = data;
    fs.writeFileSync(this._filePath(category), JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Store a memory entry in a category
   */
  remember(category, entry) {
    const data = this._load(category);
    data.entries.push({
      ...entry,
      timestamp: new Date().toISOString(),
      id: `${this.agentName}-${category}-${Date.now()}`
    });
    this._save(category, data);
    return entry;
  }

  /**
   * Recall all entries from a category, optionally filtered
   */
  recall(category, filter = null) {
    const data = this._load(category);
    if (!filter) return data.entries;
    return data.entries.filter(filter);
  }

  /**
   * Recall the most recent N entries from a category
   */
  recallRecent(category, count = 10) {
    const data = this._load(category);
    return data.entries.slice(-count);
  }

  /**
   * Remove entries matching a filter from a category
   */
  forget(category, filter) {
    const data = this._load(category);
    data.entries = data.entries.filter(e => !filter(e));
    this._save(category, data);
  }

  /**
   * Evolve — merge new knowledge into agent's memory
   * Used by the self-evolution system
   */
  evolve(category, newKnowledge) {
    const data = this._load(category);
    data.entries.push({
      type: 'evolution',
      knowledge: newKnowledge,
      timestamp: new Date().toISOString(),
      id: `${this.agentName}-evolution-${Date.now()}`
    });
    this._save(category, data);
    return { evolved: true, category, entriesCount: data.entries.length };
  }

  /**
   * Get full memory summary for this agent
   */
  getSummary() {
    const files = fs.readdirSync(this.memoryDir).filter(f => f.endsWith('.json'));
    const summary = {};
    for (const file of files) {
      const category = file.replace('.json', '');
      const data = this._load(category);
      summary[category] = {
        entries: data.entries.length,
        lastUpdated: data.metadata?.lastUpdated || 'never',
        version: data.metadata?.version || 0
      };
    }
    return summary;
  }

  /**
   * Clear all memory for this agent (dangerous!)
   */
  clearAll() {
    const files = fs.readdirSync(this.memoryDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      fs.unlinkSync(path.join(this.memoryDir, file));
    }
    this.cache = {};
  }

  /**
   * Get the workspace root path
   */
  static getWorkspaceRoot() {
    return WORKSPACE_ROOT;
  }
}

export default MemoryStore;
