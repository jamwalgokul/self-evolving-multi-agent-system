// ============================================================
// SECUREMAX — Autonomous Security Auditor Agent
// ============================================================
// Scans codebases for security vulnerabilities using OWASP, MITRE,
// CVE databases. Detects exposed secrets, injection flaws, and more.

import fs from 'fs';
import path from 'path';
import { AgentRuntime } from '../agent-runtime.js';

// ---- Security Pattern Databases ----

const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{10,}['"]/gi, name: 'API Key', severity: 'critical' },
  { pattern: /(?:secret|token|password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/gi, name: 'Secret/Password/Token', severity: 'critical' },
  { pattern: /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'AWS Credentials', severity: 'critical' },
  { pattern: /AKIA[0-9A-Z]{16}/g, name: 'AWS Access Key ID', severity: 'critical' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'GitHub Personal Access Token', severity: 'critical' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: 'OpenAI/Stripe Secret Key', severity: 'critical' },
  { pattern: /-----BEGIN (?:RSA |DSA |EC )?PRIVATE KEY-----/g, name: 'Private Key', severity: 'critical' },
  { pattern: /(?:mongodb|mysql|postgres|redis):\/\/[^:]+:[^@]+@/gi, name: 'Database Connection String', severity: 'critical' },
  { pattern: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g, name: 'Bearer Token', severity: 'high' },
  { pattern: /(?:xox[bpsa]-[a-zA-Z0-9-]+)/g, name: 'Slack Token', severity: 'critical' },
];

const INJECTION_PATTERNS = [
  // SQL Injection
  { pattern: /(?:query|execute|raw)\s*\(\s*['"`].*?\$\{/g, name: 'SQL Injection (template literal)', cwe: 'CWE-89', severity: 'critical', type: 'sqli' },
  { pattern: /(?:query|execute|raw)\s*\(\s*['"].*?\+\s*(?:req\.|request\.|params\.|body\.|query\.)/g, name: 'SQL Injection (concatenation)', cwe: 'CWE-89', severity: 'critical', type: 'sqli' },
  // XSS
  { pattern: /\.innerHTML\s*=\s*(?!['"]<)/g, name: 'Cross-Site Scripting (innerHTML)', cwe: 'CWE-79', severity: 'high', type: 'xss' },
  { pattern: /document\.write\s*\(/g, name: 'Cross-Site Scripting (document.write)', cwe: 'CWE-79', severity: 'high', type: 'xss' },
  { pattern: /dangerouslySetInnerHTML/g, name: 'React dangerouslySetInnerHTML — XSS risk', cwe: 'CWE-79', severity: 'high', type: 'xss' },
  // Command Injection
  { pattern: /(?:exec|spawn|execSync)\s*\(\s*(?:req\.|request\.|params\.|body\.|`)/g, name: 'Command Injection', cwe: 'CWE-78', severity: 'critical', type: 'cmdi' },
  { pattern: /child_process.*(?:req\.|request\.|params\.|body\.)/g, name: 'Command Injection via child_process', cwe: 'CWE-78', severity: 'critical', type: 'cmdi' },
  // Path Traversal
  { pattern: /(?:readFile|readFileSync|createReadStream)\s*\(\s*(?:req\.|request\.|params\.|body\.)/g, name: 'Path Traversal', cwe: 'CWE-22', severity: 'high', type: 'path-traversal' },
  // SSRF
  { pattern: /(?:fetch|axios|request|got|http\.get)\s*\(\s*(?:req\.|request\.|params\.|body\.|query\.)/g, name: 'Server-Side Request Forgery (SSRF)', cwe: 'CWE-918', severity: 'high', type: 'ssrf' },
  // Insecure Deserialization
  { pattern: /JSON\.parse\s*\(\s*(?:req\.|request\.)/g, name: 'Insecure Deserialization', cwe: 'CWE-502', severity: 'medium', type: 'deserialization' },
  { pattern: /pickle\.loads?\s*\(/g, name: 'Python Pickle Deserialization', cwe: 'CWE-502', severity: 'critical', type: 'deserialization' },
  { pattern: /yaml\.load\s*\([^)]*\)(?!\s*,\s*Loader)/g, name: 'Unsafe YAML loading', cwe: 'CWE-502', severity: 'high', type: 'deserialization' },
];

const AUTH_PATTERNS = [
  { pattern: /(?:password|secret)\s*===?\s*['"][^'"]+['"]/gi, name: 'Hardcoded password comparison', cwe: 'CWE-798', severity: 'critical' },
  { pattern: /jwt\.sign\s*\([^)]*(?:algorithm|alg)\s*:\s*['"](?:none|HS256)['"]/gi, name: 'Weak JWT algorithm', cwe: 'CWE-327', severity: 'high' },
  { pattern: /(?:cors|Access-Control-Allow-Origin)\s*[:=]\s*['"]?\*/gi, name: 'Wildcard CORS — allows any origin', cwe: 'CWE-942', severity: 'medium' },
  { pattern: /(?:secure|httpOnly|sameSite)\s*:\s*false/gi, name: 'Insecure cookie configuration', cwe: 'CWE-614', severity: 'high' },
  { pattern: /(?:md5|sha1)\s*\(/gi, name: 'Weak hashing algorithm (MD5/SHA1)', cwe: 'CWE-328', severity: 'high' },
  { pattern: /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/g, name: 'Node.js weak hash', cwe: 'CWE-328', severity: 'high' },
];

const MISCONFIG_PATTERNS = [
  { pattern: /(?:debug|DEBUG)\s*[:=]\s*(?:true|True|1|['"]true['"])/gi, name: 'Debug mode enabled', severity: 'medium' },
  { pattern: /(?:verify|rejectUnauthorized|SSL_VERIFY)\s*[:=]\s*(?:false|False|0)/gi, name: 'SSL/TLS verification disabled', cwe: 'CWE-295', severity: 'high' },
  { pattern: /helmet\(\s*\)/g, name: 'Helmet with default config — verify settings', severity: 'info' },
  { pattern: /app\.listen\s*\(\s*(?:80|8080|3000)\s*[,)]/g, name: 'Listening on common port — verify firewall rules', severity: 'info' },
];

export class SecureMaxAgent {
  constructor() {
    this.runtime = new AgentRuntime('securemax');
    this.runtime.setStatus('initialized');
  }

  /**
   * Main audit entry point
   */
  async audit(targetDir) {
    this.runtime.setStatus('auditing');
    this.runtime.info(`Starting security audit of: ${targetDir}`);

    const startTime = Date.now();
    const results = {
      summary: {},
      vulnerabilities: [],
      secrets: [],
      injections: [],
      authIssues: [],
      misconfigs: [],
      dependencyVulns: [],
      severityCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      riskLevel: 'unknown',
      filesScanned: 0
    };

    try {
      // Step 1: Scan files
      this.runtime.info('Step 1/7: Scanning project files...');
      const files = await this.runtime.scanDirectory(targetDir);
      results.filesScanned = files.length;
      const projectTypes = this.runtime.detectProjectType(files);

      // Step 2: Scan for exposed secrets
      this.runtime.info('Step 2/7: Scanning for exposed secrets...');
      results.secrets = await this._scanSecrets(files);

      // Step 3: Scan for injection vulnerabilities
      this.runtime.info('Step 3/7: Scanning for injection vulnerabilities...');
      results.injections = await this._scanInjections(files);

      // Step 4: Scan for auth/crypto issues
      this.runtime.info('Step 4/7: Scanning authentication & crypto...');
      results.authIssues = await this._scanAuth(files);

      // Step 5: Scan for misconfigurations
      this.runtime.info('Step 5/7: Scanning for misconfigurations...');
      results.misconfigs = await this._scanMisconfigs(files);

      // Step 6: Check dependency vulnerabilities
      this.runtime.info('Step 6/7: Checking dependency vulnerabilities...');
      results.dependencyVulns = await this._checkDependencyVulns(files, targetDir, projectTypes);

      // Step 7: Aggregate and score
      this.runtime.info('Step 7/7: Calculating risk score...');
      results.vulnerabilities = [
        ...results.secrets,
        ...results.injections,
        ...results.authIssues,
        ...results.misconfigs,
        ...results.dependencyVulns
      ];

      for (const vuln of results.vulnerabilities) {
        results.severityCounts[vuln.severity] = (results.severityCounts[vuln.severity] || 0) + 1;
      }

      results.riskLevel = this._calculateRisk(results.severityCounts);
      results.summary = this._buildSummary(results, projectTypes);

    } catch (err) {
      this.runtime.error(`Audit failed: ${err.message}`);
      results.summary = { status: 'error', message: err.message };
    }

    // Save to memory
    this.runtime.memory.remember('audits', {
      directory: targetDir,
      vulnerabilities: results.vulnerabilities.length,
      riskLevel: results.riskLevel,
      severityCounts: results.severityCounts
    });

    const report = this._generateReport(results, targetDir, startTime);
    this.runtime.setStatus('completed');

    return { report, results };
  }

  /**
   * Scan for exposed secrets and credentials
   */
  async _scanSecrets(files) {
    const findings = [];

    // Also load learned secret patterns from memory
    const learnedSecrets = this.runtime.memory.recall('learned-secret-patterns');

    for (const file of files) {
      if (!this._isAuditableFile(file.extension)) continue;
      if (file.relativePath.includes('node_modules')) continue;
      if (file.extension === '.md' || file.extension === '.txt') continue;

      try {
        const { content } = this.runtime.readFile(file.path);
        if (!content) continue;

        for (const secretDef of SECRET_PATTERNS) {
          const matches = content.match(secretDef.pattern);
          if (matches) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              // Reset regex
              const testPattern = new RegExp(secretDef.pattern.source, secretDef.pattern.flags.replace('g', ''));
              if (testPattern.test(lines[i])) {
                // Mask the actual secret
                const maskedSnippet = lines[i].trim().replace(/(['"])[^'"]{6,}(['"])/g, '$1****REDACTED****$2');

                findings.push(this.runtime.addFinding({
                  file: file.relativePath,
                  line: i + 1,
                  issue: `Exposed ${secretDef.name}`,
                  severity: secretDef.severity,
                  type: 'secret-exposure',
                  cwe: 'CWE-798',
                  snippet: maskedSnippet.substring(0, 100),
                  fix: `Move ${secretDef.name} to environment variables (.env) and add .env to .gitignore`
                }));
                break; // One per file per pattern type
              }
            }
          }
        }
      } catch { /* skip */ }
    }

    return findings;
  }

  /**
   * Scan for injection vulnerabilities
   */
  async _scanInjections(files) {
    return this._scanPatternGroup(files, INJECTION_PATTERNS, 'injection');
  }

  /**
   * Scan for authentication and crypto issues
   */
  async _scanAuth(files) {
    return this._scanPatternGroup(files, AUTH_PATTERNS, 'auth');
  }

  /**
   * Scan for misconfigurations
   */
  async _scanMisconfigs(files) {
    return this._scanPatternGroup(files, MISCONFIG_PATTERNS, 'misconfig');
  }

  /**
   * Generic pattern group scanner
   */
  async _scanPatternGroup(files, patterns, groupType) {
    const findings = [];

    for (const file of files) {
      if (!this._isAuditableFile(file.extension)) continue;
      if (file.relativePath.includes('node_modules')) continue;

      try {
        const { content } = this.runtime.readFile(file.path);
        if (!content) continue;

        for (const patternDef of patterns) {
          const testPattern = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
          const matches = content.match(testPattern);

          if (matches) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const lineTest = new RegExp(patternDef.pattern.source, patternDef.pattern.flags.replace('g', ''));
              if (lineTest.test(lines[i])) {
                findings.push(this.runtime.addFinding({
                  file: file.relativePath,
                  line: i + 1,
                  issue: patternDef.name,
                  severity: patternDef.severity,
                  type: groupType,
                  cwe: patternDef.cwe || null,
                  snippet: lines[i].trim().substring(0, 120),
                  fix: this._getRemediationForCWE(patternDef.cwe)
                }));
                break; // One per file per pattern
              }
            }
          }
        }
      } catch { /* skip */ }
    }

    return findings;
  }

  /**
   * Check dependencies for known vulnerabilities
   */
  async _checkDependencyVulns(files, targetDir, projectTypes) {
    const findings = [];

    if (projectTypes.includes('nodejs')) {
      // Run npm audit if available
      try {
        const auditResult = await this.runtime.runCommand('npm audit --json 2>nul', {
          cwd: targetDir,
          timeout: 30000
        });

        if (auditResult.stdout) {
          try {
            const audit = JSON.parse(auditResult.stdout);
            if (audit.vulnerabilities) {
              for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
                const sevMap = { critical: 'critical', high: 'high', moderate: 'medium', low: 'low', info: 'info' };
                findings.push(this.runtime.addFinding({
                  issue: `Vulnerable dependency: ${name} (${vuln.severity})`,
                  severity: sevMap[vuln.severity] || 'medium',
                  type: 'dependency-vuln',
                  fix: vuln.fixAvailable ? `Update ${name}: ${JSON.stringify(vuln.fixAvailable)}` : 'No fix available yet — monitor for updates'
                }));
              }
            }
          } catch { /* JSON parse failed — audit output may not be JSON */ }
        }
      } catch { /* npm audit not available */ }
    }

    // Check for known vulnerable packages (built-in knowledge)
    const deps = this.runtime.parseDependencies(files);
    const knownVulnerable = this._getKnownVulnerablePackages();

    for (const depName of deps.all) {
      if (knownVulnerable[depName]) {
        findings.push(this.runtime.addFinding({
          issue: `Known vulnerable package: ${depName} — ${knownVulnerable[depName].description}`,
          severity: knownVulnerable[depName].severity,
          type: 'dependency-vuln',
          cwe: knownVulnerable[depName].cwe,
          fix: knownVulnerable[depName].fix
        }));
      }
    }

    // Also check CVE cache from evolution system
    const cachedCVEs = this.runtime.memory.recall('cve-cache');
    if (cachedCVEs.length > 0) {
      for (const depName of deps.all) {
        const relevantCVEs = cachedCVEs.filter(c =>
          c.knowledge?.affectedPackage?.toLowerCase() === depName.toLowerCase()
        );
        for (const cve of relevantCVEs) {
          findings.push(this.runtime.addFinding({
            issue: `CVE Alert: ${depName} — ${cve.knowledge?.description || 'Known vulnerability'}`,
            severity: cve.knowledge?.severity || 'medium',
            type: 'cve',
            cwe: cve.knowledge?.cwe,
            fix: cve.knowledge?.fix || 'Update to latest version'
          }));
        }
      }
    }

    return findings;
  }

  _getKnownVulnerablePackages() {
    return {
      'lodash': { description: 'Prototype pollution (versions < 4.17.21)', severity: 'high', cwe: 'CWE-1321', fix: 'Update to lodash@4.17.21+' },
      'minimist': { description: 'Prototype pollution', severity: 'medium', cwe: 'CWE-1321', fix: 'Update to minimist@1.2.6+' },
      'node-fetch': { description: 'Possible SSRF in older versions', severity: 'medium', cwe: 'CWE-918', fix: 'Update to node-fetch@2.6.7+ or 3.x' },
      'express': { description: 'Check version — older versions have multiple CVEs', severity: 'info', fix: 'Ensure express@4.18+' },
      'jsonwebtoken': { description: 'Algorithm confusion in older versions', severity: 'high', cwe: 'CWE-327', fix: 'Update to jsonwebtoken@9+' },
    };
  }

  _getRemediationForCWE(cwe) {
    const remediations = {
      'CWE-89': 'Use parameterized queries or prepared statements. Never concatenate user input into SQL.',
      'CWE-79': 'Sanitize all user input before rendering. Use textContent instead of innerHTML. Use a templating engine with auto-escaping.',
      'CWE-78': 'Never pass user input directly to shell commands. Use allowlists and parameterized APIs.',
      'CWE-22': 'Validate and sanitize file paths. Use path.resolve() and verify the resolved path is within the expected directory.',
      'CWE-918': 'Validate and allowlist URLs before making requests. Block internal/private IP ranges.',
      'CWE-502': 'Never deserialize untrusted data. Use JSON.parse() with validation instead of pickle/eval.',
      'CWE-798': 'Move credentials to environment variables. Use a secrets manager. Never commit secrets to version control.',
      'CWE-327': 'Use strong, modern algorithms: AES-256, SHA-256+, bcrypt/argon2 for passwords.',
      'CWE-328': 'Replace MD5/SHA1 with SHA-256 or stronger. Use bcrypt/argon2 for password hashing.',
      'CWE-942': 'Restrict CORS to specific trusted origins. Never use wildcard (*) in production.',
      'CWE-614': 'Set cookies with Secure, HttpOnly, and SameSite=Strict flags.',
      'CWE-1321': 'Update affected package. Validate object keys before assignment. Use Object.create(null).',
      'CWE-295': 'Never disable SSL/TLS certificate verification in production.',
    };
    return remediations[cwe] || 'Review and fix according to security best practices';
  }

  _calculateRisk(severityCounts) {
    if (severityCounts.critical > 0) return 'CRITICAL';
    if (severityCounts.high > 2) return 'HIGH';
    if (severityCounts.high > 0 || severityCounts.medium > 3) return 'MEDIUM';
    if (severityCounts.medium > 0 || severityCounts.low > 5) return 'LOW';
    return 'SAFE';
  }

  _buildSummary(results, projectTypes) {
    return {
      status: results.riskLevel === 'SAFE' ? 'clean' : 'vulnerabilities-found',
      totalVulnerabilities: results.vulnerabilities.length,
      riskLevel: results.riskLevel,
      severityCounts: results.severityCounts,
      projectTypes,
      categories: {
        secrets: results.secrets.length,
        injections: results.injections.length,
        authIssues: results.authIssues.length,
        misconfigs: results.misconfigs.length,
        dependencyVulns: results.dependencyVulns.length
      }
    };
  }

  _isAuditableFile(ext) {
    return ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs',
            '.java', '.rb', '.php', '.env', '.yml', '.yaml', '.json', '.toml',
            '.cfg', '.ini', '.conf', '.vue', '.svelte', '.html'].includes(ext);
  }

  /**
   * Generate security audit report
   */
  _generateReport(results, targetDir, startTime) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const now = new Date().toISOString();
    const sc = results.severityCounts;

    const riskColors = {
      'CRITICAL': '🔴', 'HIGH': '🟠', 'MEDIUM': '🟡', 'LOW': '🔵', 'SAFE': '🟢'
    };

    let report = `# 🛡️ SecureMax Security Audit Report

> **Agent**: SecureMax v1.0
> **Target**: \`${targetDir}\`
> **Date**: ${now}
> **Duration**: ${elapsed}s
> **Risk Level**: ${riskColors[results.riskLevel]} ${results.riskLevel}

---

## 📊 Executive Summary

| Metric | Value |
|--------|-------|
| Files Scanned | ${results.filesScanned} |
| Total Vulnerabilities | ${results.vulnerabilities.length} |
| Risk Level | ${results.riskLevel} |
| 🔴 Critical | ${sc.critical} |
| 🟠 High | ${sc.high} |
| 🟡 Medium | ${sc.medium} |
| 🔵 Low | ${sc.low} |
| ⚪ Info | ${sc.info} |

### Category Breakdown

| Category | Count |
|----------|-------|
| 🔑 Exposed Secrets | ${results.secrets.length} |
| 💉 Injection Flaws | ${results.injections.length} |
| 🔐 Auth/Crypto Issues | ${results.authIssues.length} |
| ⚙️ Misconfigurations | ${results.misconfigs.length} |
| 📦 Dependency Vulns | ${results.dependencyVulns.length} |

---

`;

    // Detailed findings by category
    const categories = [
      { name: '🔑 Exposed Secrets', items: results.secrets },
      { name: '💉 Injection Vulnerabilities', items: results.injections },
      { name: '🔐 Authentication & Cryptography', items: results.authIssues },
      { name: '⚙️ Misconfigurations', items: results.misconfigs },
      { name: '📦 Dependency Vulnerabilities', items: results.dependencyVulns },
    ];

    for (const cat of categories) {
      report += `## ${cat.name}\n\n`;

      if (cat.items.length === 0) {
        report += '✅ No issues found\n\n';
      } else {
        for (const vuln of cat.items) {
          const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪' };
          report += `### ${icons[vuln.severity]} ${vuln.issue}\n\n`;
          report += `- **Severity**: ${vuln.severity.toUpperCase()}\n`;
          if (vuln.cwe) report += `- **CWE**: ${vuln.cwe}\n`;
          if (vuln.file) report += `- **File**: \`${vuln.file}:${vuln.line || '?'}\`\n`;
          if (vuln.snippet) report += `- **Code**: \`${vuln.snippet}\`\n`;
          if (vuln.fix) report += `- **Remediation**: ${vuln.fix}\n`;
          report += '\n';
        }
      }

      report += '---\n\n';
    }

    report += `## 🎯 Risk Assessment: ${riskColors[results.riskLevel]} ${results.riskLevel}

${results.riskLevel === 'SAFE' ? '✅ No significant security issues detected. Continue with confidence.' :
  results.riskLevel === 'LOW' ? '🔵 Minor issues found. Address when convenient.' :
  results.riskLevel === 'MEDIUM' ? '🟡 Moderate risk. Address high-severity issues before deployment.' :
  results.riskLevel === 'HIGH' ? '🟠 High risk! Fix critical and high-severity issues immediately.' :
  '🔴 CRITICAL RISK! Immediate action required. Do NOT deploy until resolved.'}

## 📋 Secure Coding Recommendations

1. **Never hardcode secrets** — use environment variables and .env files
2. **Always validate user input** — sanitize before use in queries, commands, or rendering
3. **Use parameterized queries** — prevent SQL injection
4. **Keep dependencies updated** — run \`npm audit\` regularly
5. **Enable security headers** — use Helmet.js for Express apps
6. **Use strong encryption** — SHA-256+, bcrypt for passwords, AES-256 for data
7. **Implement CORS properly** — restrict to specific trusted origins
8. **Secure cookies** — use Secure, HttpOnly, SameSite=Strict
9. **Review access controls** — apply principle of least privilege
10. **Monitor for new CVEs** — enable auto-evolution in SecureMax

---

*Generated by SecureMax Agent — AI-WORKSPACE*
*References: OWASP Top 10, MITRE CWE, MITRE ATT&CK, CISA KEV*
`;

    this.runtime.saveReport('securemax-report.md', report);
    return report;
  }
}

export default SecureMaxAgent;
