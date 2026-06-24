// ============================================================
// ERRORMAX — Runtime Testing & Debugging Agent
// ============================================================
// Launches applications, monitors runtime logs, detects crashes,
// runs test suites, and generates stability reports.

import fs from 'fs';
import path from 'path';
import { AgentRuntime } from '../agent-runtime.js';

export class ErrorMaxAgent {
  constructor() {
    this.runtime = new AgentRuntime('errormax');
    this.runtime.setStatus('initialized');
  }

  /**
   * Main test entry point
   */
  async test(targetDir) {
    this.runtime.setStatus('testing');
    this.runtime.info(`Starting runtime tests for: ${targetDir}`);

    const startTime = Date.now();
    const results = {
      summary: {},
      buildResult: null,
      testResults: [],
      runtimeErrors: [],
      dependencyCheck: null,
      stabilityScore: 0,
      filesScanned: 0
    };

    try {
      // Step 1: Scan directory
      this.runtime.info('Step 1/7: Scanning project files...');
      const files = await this.runtime.scanDirectory(targetDir);
      results.filesScanned = files.length;
      const projectTypes = this.runtime.detectProjectType(files);
      this.runtime.info(`Project types: ${projectTypes.join(', ')}`);

      // Step 2: Check dependencies
      this.runtime.info('Step 2/7: Checking dependencies...');
      results.dependencyCheck = await this._checkDependencies(targetDir, projectTypes);

      // Step 3: Attempt build
      this.runtime.info('Step 3/7: Attempting build...');
      results.buildResult = await this._attemptBuild(targetDir, projectTypes);

      // Step 4: Run available tests
      this.runtime.info('Step 4/7: Running test suites...');
      results.testResults = await this._runTests(targetDir, projectTypes);

      // Step 5: Static runtime analysis
      this.runtime.info('Step 5/7: Analyzing for runtime issues...');
      results.runtimeErrors = await this._analyzeRuntimeIssues(files);

      // Step 6: Check for common misconfigurations
      this.runtime.info('Step 6/7: Checking configurations...');
      const configIssues = await this._checkConfigs(files, targetDir);
      results.runtimeErrors.push(...configIssues);

      // Step 7: Calculate stability score
      this.runtime.info('Step 7/7: Calculating stability score...');
      results.stabilityScore = this._calculateStability(results);
      results.summary = this._buildSummary(results, projectTypes);

    } catch (err) {
      this.runtime.error(`Test run failed: ${err.message}`);
      results.summary = { status: 'error', message: err.message };
    }

    // Save to memory
    this.runtime.memory.remember('test-runs', {
      directory: targetDir,
      stabilityScore: results.stabilityScore,
      errorsFound: results.runtimeErrors.length,
      testsRun: results.testResults.length,
      buildSuccess: results.buildResult?.success
    });

    const report = this._generateReport(results, targetDir, startTime);
    this.runtime.setStatus('completed');

    return { report, results };
  }

  /**
   * Check if dependencies are installed and valid
   */
  async _checkDependencies(targetDir, projectTypes) {
    const result = { status: 'unknown', issues: [] };

    if (projectTypes.includes('nodejs')) {
      const pkgPath = path.join(targetDir, 'package.json');
      const nmPath = path.join(targetDir, 'node_modules');

      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

          // Check if node_modules exists
          if (!fs.existsSync(nmPath)) {
            result.issues.push(this.runtime.addFinding({
              issue: 'node_modules not found — dependencies not installed',
              severity: 'high',
              type: 'dependency',
              fix: 'Run: npm install'
            }));
          }

          // Check for missing required fields
          if (!pkg.name) result.issues.push(this.runtime.addFinding({
            issue: 'package.json missing "name" field', severity: 'low', type: 'config'
          }));
          if (!pkg.version) result.issues.push(this.runtime.addFinding({
            issue: 'package.json missing "version" field', severity: 'low', type: 'config'
          }));

          // Check for conflicting dependencies
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          for (const [name, version] of Object.entries(allDeps)) {
            if (version === '*' || version === 'latest') {
              result.issues.push(this.runtime.addFinding({
                issue: `Unpinned dependency: ${name}@${version} — use exact versions`,
                severity: 'medium',
                type: 'dependency',
                fix: `Pin ${name} to a specific version: npm install ${name}@latest --save-exact`
              }));
            }
          }

          result.status = result.issues.length === 0 ? 'healthy' : 'issues-found';
        } catch (err) {
          result.issues.push(this.runtime.addFinding({
            issue: `Invalid package.json: ${err.message}`,
            severity: 'critical',
            type: 'config'
          }));
          result.status = 'error';
        }
      }
    }

    if (projectTypes.includes('python')) {
      const reqPath = path.join(targetDir, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const content = fs.readFileSync(reqPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        for (const line of lines) {
          if (!line.includes('==') && !line.includes('>=')) {
            result.issues.push(this.runtime.addFinding({
              issue: `Unpinned Python dependency: ${line.trim()}`,
              severity: 'medium',
              type: 'dependency',
              fix: `Pin version: ${line.trim()}==<version>`
            }));
          }
        }
        result.status = result.issues.length === 0 ? 'healthy' : 'issues-found';
      }
    }

    return result;
  }

  /**
   * Attempt to build the project
   */
  async _attemptBuild(targetDir, projectTypes) {
    const result = { success: false, output: '', errors: [] };

    if (projectTypes.includes('nodejs')) {
      const pkgPath = path.join(targetDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

          // Check if build script exists
          if (pkg.scripts?.build) {
            this.runtime.info('Running npm build...');
            const buildResult = await this.runtime.runCommand('npm run build', {
              cwd: targetDir,
              timeout: 60000
            });

            result.success = buildResult.exitCode === 0;
            result.output = buildResult.stdout;

            if (!result.success) {
              const errorLines = (buildResult.stderr || buildResult.stdout)
                .split('\n')
                .filter(l => l.toLowerCase().includes('error'));

              for (const errorLine of errorLines.slice(0, 10)) {
                result.errors.push(this.runtime.addFinding({
                  issue: `Build error: ${errorLine.trim()}`,
                  severity: 'critical',
                  type: 'build-failure',
                  fix: 'Fix the build error and retry'
                }));
              }
            }
          } else {
            result.success = true;
            result.output = 'No build script defined — skipped';
          }
        } catch (err) {
          result.errors.push(this.runtime.addFinding({
            issue: `Build attempt failed: ${err.message}`,
            severity: 'critical',
            type: 'build-failure'
          }));
        }
      }
    }

    return result;
  }

  /**
   * Run available test suites
   */
  async _runTests(targetDir, projectTypes) {
    const results = [];

    if (projectTypes.includes('nodejs')) {
      const pkgPath = path.join(targetDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

          if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
            this.runtime.info('Running npm test...');
            const testResult = await this.runtime.runCommand('npm test', {
              cwd: targetDir,
              timeout: 120000
            });

            results.push({
              runner: 'npm test',
              success: testResult.exitCode === 0,
              output: testResult.stdout?.substring(0, 2000),
              errors: testResult.stderr?.substring(0, 2000),
              timedOut: testResult.timedOut
            });

            if (!testResult.success) {
              this.runtime.addFinding({
                issue: 'Test suite failed',
                severity: 'high',
                type: 'test-failure',
                fix: 'Review test output and fix failing tests'
              });
            }
          } else {
            results.push({
              runner: 'npm test',
              success: null,
              output: 'No test script configured',
              skipped: true
            });
            this.runtime.addFinding({
              issue: 'No test suite configured',
              severity: 'medium',
              type: 'missing-tests',
              fix: 'Add a test framework (Jest, Vitest, Mocha) and write tests'
            });
          }
        } catch { /* skip */ }
      }
    }

    if (projectTypes.includes('python')) {
      // Check for pytest
      const pytestExists = fs.existsSync(path.join(targetDir, 'tests'))
        || fs.existsSync(path.join(targetDir, 'test'));

      if (pytestExists) {
        this.runtime.info('Running pytest...');
        const testResult = await this.runtime.runCommand('python -m pytest --tb=short -q', {
          cwd: targetDir,
          timeout: 120000
        });

        results.push({
          runner: 'pytest',
          success: testResult.exitCode === 0,
          output: testResult.stdout?.substring(0, 2000),
          errors: testResult.stderr?.substring(0, 2000)
        });
      }
    }

    return results;
  }

  /**
   * Analyze source code for potential runtime issues
   */
  async _analyzeRuntimeIssues(files) {
    const issues = [];

    const runtimePatterns = [
      { pattern: /process\.exit\s*\(/g, issue: 'Hard process.exit() call — may cause data loss', severity: 'medium', type: 'runtime' },
      { pattern: /while\s*\(\s*true\s*\)/g, issue: 'Infinite while(true) loop — potential hang', severity: 'high', type: 'infinite-loop' },
      { pattern: /for\s*\(\s*;\s*;\s*\)/g, issue: 'Infinite for(;;) loop — potential hang', severity: 'high', type: 'infinite-loop' },
      { pattern: /new\s+Promise\s*\(\s*(?:async\s+)?\(\s*resolve\s*(?:,\s*reject)?\s*\)\s*=>\s*\{[^}]*\}\s*\)/gs, issue: 'Promise constructor may be missing resolve/reject call', severity: 'medium', type: 'async' },
      { pattern: /\.then\s*\([^)]*\)\s*(?!\s*\.catch)/g, issue: 'Unhandled promise — missing .catch()', severity: 'medium', type: 'error-handling' },
      { pattern: /setTimeout\s*\([^,]+,\s*(?:[1-9]\d{4,})\s*\)/g, issue: 'Very long setTimeout — potential memory issue', severity: 'low', type: 'performance' },
      { pattern: /JSON\.parse\s*\([^)]*\)(?!\s*(?:catch|try))/g, issue: 'JSON.parse without try/catch — may throw', severity: 'medium', type: 'error-handling' },
      { pattern: /fs\.\w+Sync\s*\(/g, issue: 'Synchronous file operation — blocks event loop', severity: 'low', type: 'performance' },
      { pattern: /new\s+Buffer\s*\(/g, issue: 'Deprecated Buffer constructor — use Buffer.from()', severity: 'medium', type: 'deprecation' },
      { pattern: /\.on\s*\(\s*['"]error['"]\s*,\s*function/g, issue: 'Error handler — verify it handles all error cases', severity: 'info', type: 'error-handling' },
    ];

    for (const file of files) {
      if (!this._isCodeFile(file.extension)) continue;

      try {
        const { content } = this.runtime.readFile(file.path);
        if (!content) continue;

        for (const patternDef of runtimePatterns) {
          const matches = content.match(patternDef.pattern);
          if (matches) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const resetPattern = new RegExp(patternDef.pattern.source, patternDef.pattern.flags.replace('g', ''));
              if (resetPattern.test(lines[i])) {
                issues.push(this.runtime.addFinding({
                  file: file.relativePath,
                  line: i + 1,
                  issue: patternDef.issue,
                  severity: patternDef.severity,
                  type: patternDef.type,
                  snippet: lines[i].trim().substring(0, 120)
                }));
                break; // One per file per pattern
              }
            }
          }
        }
      } catch { /* skip */ }
    }

    return issues;
  }

  /**
   * Check configuration files for misconfigurations
   */
  async _checkConfigs(files, targetDir) {
    const issues = [];

    for (const file of files) {
      const basename = path.basename(file.path);

      // Check for .env files committed to repo
      if (basename === '.env' || basename.match(/^\.env\.\w+$/)) {
        // Check if .gitignore excludes it
        const gitignorePath = path.join(targetDir, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
          const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
          if (!gitignore.includes('.env')) {
            issues.push(this.runtime.addFinding({
              file: file.relativePath,
              issue: '.env file may not be gitignored — secrets exposure risk',
              severity: 'high',
              type: 'config',
              fix: 'Add .env to .gitignore'
            }));
          }
        }
      }

      // Check JSON configs for validity
      if (file.extension === '.json' && !file.relativePath.includes('node_modules')) {
        try {
          const { content } = this.runtime.readFile(file.path);
          JSON.parse(content);
        } catch (err) {
          issues.push(this.runtime.addFinding({
            file: file.relativePath,
            issue: `Invalid JSON: ${err.message}`,
            severity: 'critical',
            type: 'config'
          }));
        }
      }
    }

    return issues;
  }

  _calculateStability(results) {
    let score = 100;

    // Build status
    if (results.buildResult && !results.buildResult.success) score -= 30;

    // Test results
    for (const test of results.testResults) {
      if (test.success === false) score -= 20;
      if (test.skipped) score -= 5;
    }

    // Runtime errors
    for (const error of results.runtimeErrors) {
      if (error.severity === 'critical') score -= 15;
      else if (error.severity === 'high') score -= 8;
      else if (error.severity === 'medium') score -= 3;
      else score -= 1;
    }

    // Dependency issues
    if (results.dependencyCheck?.issues) {
      score -= results.dependencyCheck.issues.length * 3;
    }

    return Math.max(0, Math.min(100, score));
  }

  _buildSummary(results, projectTypes) {
    return {
      status: results.stabilityScore >= 80 ? 'stable' : results.stabilityScore >= 50 ? 'unstable' : 'critical',
      stabilityScore: results.stabilityScore,
      projectTypes,
      buildSuccess: results.buildResult?.success ?? null,
      testsRun: results.testResults.length,
      testsPassed: results.testResults.filter(t => t.success).length,
      errorsFound: results.runtimeErrors.length,
      dependencyIssues: results.dependencyCheck?.issues?.length || 0
    };
  }

  _isCodeFile(ext) {
    return ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs',
            '.java', '.rb', '.php', '.c', '.cpp', '.vue', '.svelte'].includes(ext);
  }

  /**
   * Generate markdown report
   */
  _generateReport(results, targetDir, startTime) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const now = new Date().toISOString();

    let report = `# 🐛 ErrorMax Report

> **Agent**: ErrorMax v1.0
> **Target**: \`${targetDir}\`
> **Date**: ${now}
> **Duration**: ${elapsed}s
> **Stability Score**: ${results.stabilityScore}/100

---

## 📊 Runtime Status

| Metric | Value |
|--------|-------|
| Files Analyzed | ${results.filesScanned} |
| Build Status | ${results.buildResult?.success ? '✅ Success' : results.buildResult?.success === false ? '❌ Failed' : '⏭️ Skipped'} |
| Tests Run | ${results.testResults.length} |
| Tests Passed | ${results.testResults.filter(t => t.success).length} |
| Runtime Errors | ${results.runtimeErrors.length} |
| Dependency Issues | ${results.dependencyCheck?.issues?.length || 0} |

---

## 🏗️ Build Results

`;

    if (results.buildResult?.errors?.length > 0) {
      report += '### ❌ Build Errors\n\n';
      for (const err of results.buildResult.errors) {
        report += `- ${err.issue}\n`;
      }
    } else if (results.buildResult?.success) {
      report += '✅ Build completed successfully\n';
    } else {
      report += '⏭️ No build script configured\n';
    }

    report += '\n---\n\n## 🧪 Test Results\n\n';

    if (results.testResults.length === 0) {
      report += '⚠️ No test suites were run\n';
    } else {
      for (const test of results.testResults) {
        report += `### ${test.runner}\n`;
        report += `- **Status**: ${test.success ? '✅ Passed' : test.skipped ? '⏭️ Skipped' : '❌ Failed'}\n`;
        if (test.output) report += `- **Output**:\n\`\`\`\n${test.output.substring(0, 500)}\n\`\`\`\n`;
        report += '\n';
      }
    }

    report += '---\n\n## ⚠️ Runtime Errors Detected\n\n';

    if (results.runtimeErrors.length === 0) {
      report += '✅ No runtime issues detected\n';
    } else {
      for (const err of results.runtimeErrors) {
        const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪' };
        report += `- ${icons[err.severity] || '⚪'} **[${err.severity.toUpperCase()}]** ${err.issue}\n`;
        if (err.file) report += `  - File: \`${err.file}:${err.line || '?'}\`\n`;
        if (err.fix) report += `  - 💡 Fix: ${err.fix}\n`;
        report += '\n';
      }
    }

    report += `---

## 📦 Dependency Health

`;

    if (results.dependencyCheck?.issues?.length > 0) {
      for (const issue of results.dependencyCheck.issues) {
        report += `- ⚠️ ${issue.issue}\n`;
        if (issue.fix) report += `  - 💡 ${issue.fix}\n`;
      }
    } else {
      report += '✅ Dependencies look healthy\n';
    }

    report += `\n---

## 🎯 Final Stability Score: ${results.stabilityScore}/100

${results.stabilityScore >= 80 ? '✅ Application is STABLE — safe to proceed' : results.stabilityScore >= 50 ? '⚠️ Application is UNSTABLE — fix issues before deploying' : '❌ Application is CRITICAL — major issues require immediate attention'}

---

*Generated by ErrorMax Agent — AI-WORKSPACE*
`;

    this.runtime.saveReport('errormax-report.md', report);
    return report;
  }
}

export default ErrorMaxAgent;
