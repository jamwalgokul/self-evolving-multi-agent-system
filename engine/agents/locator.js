// ============================================================
// LOCATOR — Static Code Analysis & Bug Detection Agent
// ============================================================
// Scans codebases recursively, detects bugs, logic flaws,
// broken imports, dead code, and generates severity-scored reports.

import fs from 'fs';
import path from 'path';
import { AgentRuntime } from '../agent-runtime.js';

// ---- Pattern Databases (self-evolving via memory) ----

const SYNTAX_PATTERNS = {
  javascript: [
    { pattern: /console\.log\(/g, issue: 'Console.log left in code', severity: 'low', type: 'cleanup' },
    { pattern: /var\s+/g, issue: 'Using var instead of let/const', severity: 'low', type: 'best-practice' },
    { pattern: /eval\s*\(/g, issue: 'Use of eval() — security and performance risk', severity: 'high', type: 'security' },
    { pattern: /document\.write\s*\(/g, issue: 'document.write() usage — XSS risk', severity: 'high', type: 'security' },
    { pattern: /==(?!=)/g, issue: 'Loose equality (==) instead of strict (===)', severity: 'medium', type: 'logic' },
    { pattern: /!=(?!=)/g, issue: 'Loose inequality (!=) instead of strict (!==)', severity: 'medium', type: 'logic' },
    { pattern: /TODO|FIXME|HACK|XXX|BUG/g, issue: 'TODO/FIXME comment found — unresolved work', severity: 'info', type: 'cleanup' },
    { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, issue: 'Empty catch block — swallowed error', severity: 'high', type: 'error-handling' },
    { pattern: /setTimeout\s*\(\s*[^,]+,\s*0\s*\)/g, issue: 'setTimeout with 0ms delay — potential race condition', severity: 'medium', type: 'logic' },
    { pattern: /new\s+Array\s*\(\s*\d+\s*\)/g, issue: 'new Array() with numeric arg — confusing behavior', severity: 'low', type: 'best-practice' },
    { pattern: /\.innerHTML\s*=/g, issue: 'Direct innerHTML assignment — XSS risk', severity: 'high', type: 'security' },
    { pattern: /debugger/g, issue: 'Debugger statement left in code', severity: 'medium', type: 'cleanup' },
  ],
  python: [
    { pattern: /print\s*\(/g, issue: 'Print statement in code — use logging', severity: 'low', type: 'cleanup' },
    { pattern: /except\s*:/g, issue: 'Bare except clause — catches all exceptions', severity: 'high', type: 'error-handling' },
    { pattern: /import\s+\*/g, issue: 'Wildcard import — pollutes namespace', severity: 'medium', type: 'best-practice' },
    { pattern: /exec\s*\(/g, issue: 'Use of exec() — code injection risk', severity: 'critical', type: 'security' },
    { pattern: /os\.system\s*\(/g, issue: 'os.system() call — use subprocess instead', severity: 'medium', type: 'security' },
    { pattern: /pickle\.loads?\s*\(/g, issue: 'Unsafe pickle deserialization', severity: 'critical', type: 'security' },
    { pattern: /TODO|FIXME|HACK|XXX|BUG/g, issue: 'TODO/FIXME comment found', severity: 'info', type: 'cleanup' },
    { pattern: /global\s+/g, issue: 'Global variable usage', severity: 'medium', type: 'best-practice' },
  ],
  typescript: [
    { pattern: /any(?:\s|;|,|\)|\])/g, issue: 'Usage of "any" type — defeats TypeScript purpose', severity: 'medium', type: 'best-practice' },
    { pattern: /@ts-ignore/g, issue: '@ts-ignore directive — suppressed type error', severity: 'medium', type: 'best-practice' },
    { pattern: /@ts-nocheck/g, issue: '@ts-nocheck directive — entire file unchecked', severity: 'high', type: 'best-practice' },
    { pattern: /as\s+any/g, issue: 'Type assertion to any — unsafe cast', severity: 'medium', type: 'best-practice' },
    { pattern: /TODO|FIXME|HACK|XXX|BUG/g, issue: 'TODO/FIXME comment found', severity: 'info', type: 'cleanup' },
  ]
};

const IMPORT_PATTERNS = {
  javascript: /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g,
  typescript: /import\s+.*?from\s+['"]([^'"]+)['"]/g,
  python: /(?:from\s+(\S+)\s+import|import\s+(\S+))/g,
};

export class LocatorAgent {
  constructor() {
    this.runtime = new AgentRuntime('locator');
    this.runtime.setStatus('initialized');
  }

  /**
   * Main scan entry point
   */
  async scan(targetDir) {
    this.runtime.setStatus('scanning');
    this.runtime.info(`Starting scan of: ${targetDir}`);

    const startTime = Date.now();
    const results = {
      summary: {},
      issues: [],
      dependencies: {},
      projectTypes: [],
      filesScanned: 0,
      confidence: 0
    };

    try {
      // Step 1: Scan all files
      this.runtime.info('Step 1/6: Scanning directory recursively...');
      const files = await this.runtime.scanDirectory(targetDir);
      results.filesScanned = files.length;
      this.runtime.info(`Found ${files.length} files`);

      if (files.length === 0) {
        this.runtime.warn('No files found in target directory');
        results.summary = { status: 'empty', message: 'No files found to scan' };
        return this._generateReport(results, targetDir, startTime);
      }

      // Step 2: Detect project type
      this.runtime.info('Step 2/6: Detecting project type...');
      results.projectTypes = this.runtime.detectProjectType(files);
      this.runtime.info(`Project types detected: ${results.projectTypes.join(', ')}`);

      // Step 3: Build dependency map
      this.runtime.info('Step 3/6: Building dependency map...');
      results.dependencies = this.runtime.parseDependencies(files);
      this.runtime.info(`Found ${results.dependencies.all.length} dependencies`);

      // Step 4: Scan for issues
      this.runtime.info('Step 4/6: Scanning for issues...');
      results.issues = await this._scanForIssues(files);
      this.runtime.info(`Found ${results.issues.length} issues`);

      // Step 5: Check for broken imports
      this.runtime.info('Step 5/6: Checking imports...');
      const importIssues = await this._checkImports(files, targetDir);
      results.issues.push(...importIssues);

      // Step 6: Calculate confidence score
      this.runtime.info('Step 6/6: Calculating confidence score...');
      results.confidence = this._calculateConfidence(results);

      // Generate summary
      results.summary = this._buildSummary(results);

    } catch (err) {
      this.runtime.error(`Scan failed: ${err.message}`);
      results.summary = { status: 'error', message: err.message };
    }

    // Save to memory
    this.runtime.memory.remember('scans', {
      directory: targetDir,
      filesScanned: results.filesScanned,
      issuesFound: results.issues.length,
      projectTypes: results.projectTypes,
      confidence: results.confidence
    });

    // Generate and save report
    const report = this._generateReport(results, targetDir, startTime);
    this.runtime.setStatus('completed');

    return { report, results };
  }

  /**
   * Scan files for pattern-based issues
   */
  async _scanForIssues(files) {
    const issues = [];

    // Load learned patterns from memory
    const learnedPatterns = this.runtime.memory.recall('learned-patterns');

    for (const file of files) {
      if (!this._isCodeFile(file.extension)) continue;

      try {
        const { content } = this.runtime.readFile(file.path);
        if (!content) continue;

        const lang = file.language;
        const patterns = SYNTAX_PATTERNS[lang] || SYNTAX_PATTERNS['javascript'] || [];

        for (const patternDef of patterns) {
          const matches = content.match(patternDef.pattern);
          if (matches) {
            // Find line numbers for each match
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (patternDef.pattern.test(lines[i])) {
                // Reset regex lastIndex
                patternDef.pattern.lastIndex = 0;
                issues.push(this.runtime.addFinding({
                  file: file.relativePath,
                  line: i + 1,
                  issue: patternDef.issue,
                  severity: patternDef.severity,
                  type: patternDef.type,
                  snippet: lines[i].trim().substring(0, 120),
                  fix: this._suggestFix(patternDef)
                }));
              }
            }
            // Reset regex
            patternDef.pattern.lastIndex = 0;
          }
        }

        // Check for large functions (> 50 lines)
        this._checkFunctionSize(content, file, issues);

        // Check for deeply nested code
        this._checkNesting(content, file, issues);

      } catch {
        // Skip unreadable files
      }
    }

    return issues;
  }

  /**
   * Check for broken imports/requires
   */
  async _checkImports(files, targetDir) {
    const issues = [];

    for (const file of files) {
      if (!['javascript', 'typescript', 'react'].includes(file.language)) continue;

      try {
        const { content } = this.runtime.readFile(file.path);
        if (!content) continue;

        const importPattern = IMPORT_PATTERNS[file.language] || IMPORT_PATTERNS['javascript'];
        let match;

        // Reset regex
        importPattern.lastIndex = 0;

        while ((match = importPattern.exec(content)) !== null) {
          const importPath = match[1] || match[2];
          if (!importPath) continue;

          // Skip node_modules imports
          if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue;

          const resolvedImport = path.resolve(path.dirname(file.path), importPath);
          const possiblePaths = [
            resolvedImport,
            resolvedImport + '.js',
            resolvedImport + '.ts',
            resolvedImport + '.tsx',
            resolvedImport + '.jsx',
            resolvedImport + '.mjs',
            path.join(resolvedImport, 'index.js'),
            path.join(resolvedImport, 'index.ts'),
          ];

          const exists = possiblePaths.some(p => fs.existsSync(p));
          if (!exists) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            issues.push(this.runtime.addFinding({
              file: file.relativePath,
              line: lineNum,
              issue: `Broken import: "${importPath}" — file not found`,
              severity: 'high',
              type: 'broken-import',
              snippet: match[0].trim(),
              fix: `Verify the import path "${importPath}" exists and is spelled correctly`
            }));
          }
        }
      } catch {
        // Skip
      }
    }

    return issues;
  }

  /**
   * Check for overly large functions
   */
  _checkFunctionSize(content, file, issues) {
    const functionPattern = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/g;
    const lines = content.split('\n');
    let match;

    while ((match = functionPattern.exec(content)) !== null) {
      const startLine = content.substring(0, match.index).split('\n').length;
      let braceCount = 0;
      let started = false;
      let endLine = startLine;

      for (let i = startLine - 1; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') { braceCount++; started = true; }
          if (char === '}') braceCount--;
        }
        if (started && braceCount === 0) {
          endLine = i + 1;
          break;
        }
      }

      const funcLength = endLine - startLine;
      if (funcLength > 50) {
        issues.push(this.runtime.addFinding({
          file: file.relativePath,
          line: startLine,
          issue: `Large function (${funcLength} lines) — consider splitting`,
          severity: 'medium',
          type: 'complexity',
          snippet: match[0].trim(),
          fix: 'Break this function into smaller, focused helper functions'
        }));
      }
    }
  }

  /**
   * Check for deeply nested code (> 4 levels)
   */
  _checkNesting(content, file, issues) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const indentation = lines[i].match(/^(\s*)/)?.[1]?.length || 0;
      const nestLevel = Math.floor(indentation / 2);
      if (nestLevel > 5 && lines[i].trim().length > 0) {
        issues.push(this.runtime.addFinding({
          file: file.relativePath,
          line: i + 1,
          issue: `Deeply nested code (level ${nestLevel}) — reduce complexity`,
          severity: 'medium',
          type: 'complexity',
          snippet: lines[i].trim().substring(0, 80),
          fix: 'Use early returns, guard clauses, or extract into helper functions'
        }));
        break; // Only report once per file
      }
    }
  }

  /**
   * Suggest fix for a pattern
   */
  _suggestFix(patternDef) {
    const fixes = {
      'Console.log left in code': 'Remove or replace with a proper logger',
      'Using var instead of let/const': 'Replace var with const (or let if reassigned)',
      'Use of eval() — security and performance risk': 'Replace eval() with safer alternatives like JSON.parse() or Function constructor',
      'Loose equality (==) instead of strict (===)': 'Use === for strict equality comparison',
      'Loose inequality (!=) instead of strict (!==)': 'Use !== for strict inequality comparison',
      'Empty catch block — swallowed error': 'Add error handling or at minimum log the error',
      'Direct innerHTML assignment — XSS risk': 'Use textContent or DOM manipulation methods instead',
      'Bare except clause — catches all exceptions': 'Specify the exception type: except ValueError:',
      'Wildcard import — pollutes namespace': 'Import specific names: from module import name1, name2',
    };
    return fixes[patternDef.issue] || 'Review and fix according to best practices';
  }

  _isCodeFile(ext) {
    return ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs',
            '.java', '.kt', '.rb', '.php', '.c', '.cpp', '.h', '.vue', '.svelte'].includes(ext);
  }

  _calculateConfidence(results) {
    let score = 100;
    const criticals = results.issues.filter(i => i.severity === 'critical').length;
    const highs = results.issues.filter(i => i.severity === 'high').length;
    const mediums = results.issues.filter(i => i.severity === 'medium').length;

    score -= criticals * 15;
    score -= highs * 8;
    score -= mediums * 3;

    return Math.max(0, Math.min(100, score));
  }

  _buildSummary(results) {
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const issue of results.issues) {
      severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
    }
    return {
      status: results.issues.length === 0 ? 'clean' : 'issues-found',
      totalIssues: results.issues.length,
      severityCounts,
      projectTypes: results.projectTypes,
      filesScanned: results.filesScanned,
      dependenciesCount: results.dependencies.all.length,
      confidence: results.confidence
    };
  }

  /**
   * Generate markdown report
   */
  _generateReport(results, targetDir, startTime) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const now = new Date().toISOString();
    const severity = results.summary.severityCounts || {};

    let report = `# 🔍 Locator Report

> **Agent**: Locator v1.0
> **Target**: \`${targetDir}\`
> **Date**: ${now}
> **Duration**: ${elapsed}s
> **Status**: ${results.summary.status || 'unknown'}

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| Files Scanned | ${results.filesScanned} |
| Project Types | ${results.projectTypes?.join(', ') || 'unknown'} |
| Dependencies | ${results.dependencies?.all?.length || 0} |
| Total Issues | ${results.issues?.length || 0} |
| Confidence Score | ${results.confidence || 0}/100 |

### Severity Breakdown

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${severity.critical || 0} |
| 🟠 High | ${severity.high || 0} |
| 🟡 Medium | ${severity.medium || 0} |
| 🔵 Low | ${severity.low || 0} |
| ⚪ Info | ${severity.info || 0} |

---

## 🐛 Issues Found

`;

    if (results.issues.length === 0) {
      report += '✅ No issues detected! Codebase looks clean.\n';
    } else {
      // Group by severity
      for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
        const sevIssues = results.issues.filter(i => i.severity === sev);
        if (sevIssues.length === 0) continue;

        const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪' };
        report += `### ${icons[sev]} ${sev.toUpperCase()} (${sevIssues.length})\n\n`;

        for (const issue of sevIssues) {
          report += `- **${issue.file}:${issue.line}** — ${issue.issue}\n`;
          if (issue.snippet) report += `  \`\`\`\n  ${issue.snippet}\n  \`\`\`\n`;
          if (issue.fix) report += `  💡 **Fix**: ${issue.fix}\n`;
          report += '\n';
        }
      }
    }

    report += `---

## 📦 Dependencies

**Production**: ${Object.keys(results.dependencies?.production || {}).length}
**Development**: ${Object.keys(results.dependencies?.development || {}).length}

`;

    if (results.dependencies?.all?.length > 0) {
      report += '| Package | Version |\n|---------|--------|\n';
      for (const [name, version] of Object.entries(results.dependencies.production || {})) {
        report += `| ${name} | ${version} |\n`;
      }
    }

    report += `\n---

## 🎯 Confidence Score: ${results.confidence}/100

${results.confidence >= 80 ? '✅ Code quality is good' : results.confidence >= 50 ? '⚠️ Code quality needs improvement' : '❌ Significant issues detected — review recommended'}

---

*Generated by Locator Agent — AI-WORKSPACE*
`;

    this.runtime.saveReport('locator-report.md', report);
    return report;
  }
}

export default LocatorAgent;
