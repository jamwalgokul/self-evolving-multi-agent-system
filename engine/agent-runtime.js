// ============================================================
// AGENT RUNTIME — Core Agent Execution Engine
// ============================================================
// Loads agent definitions from /agents/*.md, manages isolated contexts,
// provides tool execution capabilities, and enforces safety rules.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import { glob } from 'glob';
import { MemoryStore } from './memory-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const AGENTS_DIR = path.join(WORKSPACE_ROOT, 'agents');
const REPORTS_DIR = path.join(WORKSPACE_ROOT, 'reports');

// Safety: actions that are NEVER allowed automatically
const FORBIDDEN_ACTIONS = [
  'rm -rf', 'del /f', 'format', 'git push', 'git commit',
  'deploy', 'publish', 'DROP TABLE', 'DELETE FROM'
];

export class AgentRuntime {
  constructor(agentName) {
    this.name = agentName;
    this.memory = new MemoryStore(agentName);
    this.definition = this._loadDefinition();
    this.startTime = new Date();
    this.status = 'idle';
    this.logs = [];
    this.findings = [];
  }

  // -----------------------------------------------------------
  // Definition Loading
  // -----------------------------------------------------------

  _loadDefinition() {
    const defPath = path.join(AGENTS_DIR, `${this.name}.md`);
    if (!fs.existsSync(defPath)) {
      throw new Error(`Agent definition not found: ${defPath}`);
    }
    const raw = fs.readFileSync(defPath, 'utf-8');
    return this._parseDefinition(raw);
  }

  _parseDefinition(markdown) {
    const sections = {};
    let currentSection = 'header';
    const lines = markdown.split('\n');

    for (const line of lines) {
      if (line.startsWith('# ') || line.startsWith('## ')) {
        currentSection = line.replace(/^#+\s*/, '').trim().toLowerCase();
        sections[currentSection] = [];
      } else if (currentSection) {
        if (!sections[currentSection]) sections[currentSection] = [];
        sections[currentSection].push(line);
      }
    }

    // Convert arrays to strings
    for (const key of Object.keys(sections)) {
      sections[key] = sections[key].join('\n').trim();
    }

    return sections;
  }

  // -----------------------------------------------------------
  // Logging
  // -----------------------------------------------------------

  log(level, message, data = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      agent: this.name,
      message,
      data
    };
    this.logs.push(entry);
    return entry;
  }

  info(message, data) { return this.log('info', message, data); }
  warn(message, data) { return this.log('warn', message, data); }
  error(message, data) { return this.log('error', message, data); }
  success(message, data) { return this.log('success', message, data); }

  // -----------------------------------------------------------
  // File System Tools
  // -----------------------------------------------------------

  /**
   * Recursively scan a directory, returning file metadata
   */
  async scanDirectory(targetDir, options = {}) {
    const {
      maxDepth = 10,
      maxFileSize = 5 * 1024 * 1024, // 5MB
      ignorePatterns = ['node_modules/**', '.git/**', 'dist/**', 'build/**', '__pycache__/**', '.next/**']
    } = options;

    const resolvedDir = path.resolve(targetDir);
    if (!fs.existsSync(resolvedDir)) {
      throw new Error(`Directory not found: ${resolvedDir}`);
    }

    const pattern = '**/*';
    const files = await glob(pattern, {
      cwd: resolvedDir,
      nodir: true,
      ignore: ignorePatterns,
      maxDepth,
      absolute: true
    });

    const results = [];
    for (const filePath of files) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > maxFileSize) continue;

        const ext = path.extname(filePath).toLowerCase();
        const relativePath = path.relative(resolvedDir, filePath);

        results.push({
          path: filePath,
          relativePath,
          extension: ext,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          language: this._detectLanguage(ext)
        });
      } catch {
        // Skip unreadable files
      }
    }

    return results;
  }

  /**
   * Read file contents safely
   */
  readFile(filePath) {
    try {
      const resolved = path.resolve(filePath);
      const stat = fs.statSync(resolved);
      if (stat.size > 5 * 1024 * 1024) {
        return { error: 'File too large (>5MB)', path: resolved };
      }
      return {
        content: fs.readFileSync(resolved, 'utf-8'),
        path: resolved,
        size: stat.size
      };
    } catch (err) {
      return { error: err.message, path: filePath };
    }
  }

  /**
   * Detect project type from directory contents
   */
  detectProjectType(files) {
    const extensions = new Set(files.map(f => f.extension));
    const fileNames = new Set(files.map(f => path.basename(f.path)));

    const types = [];

    if (fileNames.has('package.json')) types.push('nodejs');
    if (fileNames.has('requirements.txt') || fileNames.has('setup.py') || fileNames.has('pyproject.toml')) types.push('python');
    if (fileNames.has('go.mod')) types.push('go');
    if (fileNames.has('Cargo.toml')) types.push('rust');
    if (fileNames.has('pom.xml') || fileNames.has('build.gradle')) types.push('java');
    if (fileNames.has('Gemfile')) types.push('ruby');
    if (fileNames.has('composer.json')) types.push('php');
    if (fileNames.has('Dockerfile') || fileNames.has('docker-compose.yml')) types.push('docker');
    if (fileNames.has('next.config.js') || fileNames.has('next.config.mjs')) types.push('nextjs');
    if (fileNames.has('vite.config.js') || fileNames.has('vite.config.ts')) types.push('vite');

    if (extensions.has('.ts') || extensions.has('.tsx')) types.push('typescript');
    if (extensions.has('.jsx')) types.push('react');
    if (extensions.has('.vue')) types.push('vue');
    if (extensions.has('.svelte')) types.push('svelte');

    return types.length > 0 ? types : ['unknown'];
  }

  /**
   * Parse dependency files and build dependency map
   */
  parseDependencies(files) {
    const deps = { production: {}, development: {}, all: [] };

    for (const file of files) {
      const basename = path.basename(file.path);

      if (basename === 'package.json') {
        try {
          const pkg = JSON.parse(fs.readFileSync(file.path, 'utf-8'));
          if (pkg.dependencies) {
            deps.production = { ...deps.production, ...pkg.dependencies };
          }
          if (pkg.devDependencies) {
            deps.development = { ...deps.development, ...pkg.devDependencies };
          }
        } catch { /* skip invalid */ }
      }

      if (basename === 'requirements.txt') {
        try {
          const content = fs.readFileSync(file.path, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
          for (const line of lines) {
            const [name] = line.split(/[>=<~!]/);
            if (name.trim()) {
              deps.production[name.trim()] = line.trim();
            }
          }
        } catch { /* skip */ }
      }
    }

    deps.all = [...Object.keys(deps.production), ...Object.keys(deps.development)];
    return deps;
  }

  // -----------------------------------------------------------
  // Command Execution (Sandboxed)
  // -----------------------------------------------------------

  /**
   * Run a command safely with timeout
   */
  runCommand(command, options = {}) {
    const { timeout = 30000, cwd = WORKSPACE_ROOT } = options;

    // Safety check
    for (const forbidden of FORBIDDEN_ACTIONS) {
      if (command.toLowerCase().includes(forbidden.toLowerCase())) {
        return Promise.reject(new Error(`SAFETY VIOLATION: Command contains forbidden action "${forbidden}"`));
      }
    }

    return new Promise((resolve, reject) => {
      const proc = exec(command, {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      }, (error, stdout, stderr) => {
        resolve({
          exitCode: error ? error.code || 1 : 0,
          stdout: stdout || '',
          stderr: stderr || '',
          error: error ? error.message : null,
          timedOut: error?.killed || false
        });
      });
    });
  }

  /**
   * Run a command and stream output (for long-running processes)
   */
  spawnProcess(command, args = [], options = {}) {
    const { timeout = 60000, cwd = WORKSPACE_ROOT } = options;

    return new Promise((resolve) => {
      const stdout = [];
      const stderr = [];

      const proc = spawn(command, args, {
        cwd,
        shell: true,
        timeout
      });

      proc.stdout?.on('data', (data) => {
        stdout.push(data.toString());
      });

      proc.stderr?.on('data', (data) => {
        stderr.push(data.toString());
      });

      proc.on('close', (code) => {
        resolve({
          exitCode: code,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          timedOut: false
        });
      });

      proc.on('error', (err) => {
        resolve({
          exitCode: 1,
          stdout: stdout.join(''),
          stderr: err.message,
          error: err.message,
          timedOut: false
        });
      });
    });
  }

  // -----------------------------------------------------------
  // Report Generation
  // -----------------------------------------------------------

  /**
   * Save a report to the reports directory
   */
  saveReport(filename, content) {
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
    const reportPath = path.join(REPORTS_DIR, filename);
    fs.writeFileSync(reportPath, content, 'utf-8');
    this.info(`Report saved: ${reportPath}`);
    return reportPath;
  }

  /**
   * Read a report from the reports directory
   */
  readReport(filename) {
    const reportPath = path.join(REPORTS_DIR, filename);
    if (!fs.existsSync(reportPath)) return null;
    return fs.readFileSync(reportPath, 'utf-8');
  }

  // -----------------------------------------------------------
  // Finding Management
  // -----------------------------------------------------------

  addFinding(finding) {
    const enriched = {
      ...finding,
      agent: this.name,
      timestamp: new Date().toISOString(),
      id: `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
    };
    this.findings.push(enriched);
    return enriched;
  }

  getFindingsBySeverity(severity) {
    return this.findings.filter(f => f.severity === severity);
  }

  // -----------------------------------------------------------
  // Status & Lifecycle
  // -----------------------------------------------------------

  setStatus(status) {
    this.status = status;
    this.log('info', `Status changed to: ${status}`);
  }

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      startTime: this.startTime.toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
      findings: this.findings.length,
      logs: this.logs.length,
      memory: this.memory.getSummary()
    };
  }

  // -----------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------

  _detectLanguage(ext) {
    const map = {
      '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript',
      '.jsx': 'react', '.vue': 'vue', '.svelte': 'svelte',
      '.py': 'python', '.go': 'go', '.rs': 'rust',
      '.java': 'java', '.kt': 'kotlin',
      '.rb': 'ruby', '.php': 'php',
      '.c': 'c', '.cpp': 'cpp', '.h': 'c-header',
      '.css': 'css', '.scss': 'scss', '.less': 'less',
      '.html': 'html', '.htm': 'html',
      '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
      '.xml': 'xml', '.toml': 'toml',
      '.md': 'markdown', '.txt': 'text',
      '.sql': 'sql', '.graphql': 'graphql',
      '.sh': 'shell', '.bash': 'shell', '.ps1': 'powershell',
      '.dockerfile': 'docker', '.tf': 'terraform'
    };
    return map[ext] || 'unknown';
  }

  static getWorkspaceRoot() {
    return WORKSPACE_ROOT;
  }

  static getReportsDir() {
    return REPORTS_DIR;
  }

  static getAgentsDir() {
    return AGENTS_DIR;
  }
}

export default AgentRuntime;
