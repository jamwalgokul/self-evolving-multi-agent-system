// ============================================================
// FULLMAX — Master Orchestrator & Validation Agent
// ============================================================
// Receives outputs from Locator, ErrorMax, SecureMax. Validates
// completeness, generates consolidated human-readable reports,
// and manages evolution reporting.

import fs from 'fs';
import path from 'path';
import { AgentRuntime } from '../agent-runtime.js';

export class FullMaxAgent {
  constructor() {
    this.runtime = new AgentRuntime('fullmax');
    this.runtime.setStatus('initialized');
  }

  /**
   * Main validation entry point — aggregates all sub-agent reports
   */
  async validate(agentResults = null) {
    this.runtime.setStatus('validating');
    this.runtime.info('Starting validation and report consolidation...');

    const startTime = Date.now();

    // Load reports either from passed results or from disk
    const reports = agentResults || await this._loadReportsFromDisk();

    const consolidated = {
      overallHealth: 'unknown',
      bugSummary: { total: 0, bySeverity: {} },
      runtimeStability: { score: 0, status: 'unknown' },
      securityStatus: { riskLevel: 'unknown', totalVulns: 0 },
      riskLevel: 'unknown',
      missingTests: [],
      contradictions: [],
      approvalRecommendation: 'pending',
      nextSteps: [],
      agentStatuses: {}
    };

    try {
      // Step 1: Validate report integrity
      this.runtime.info('Step 1/6: Validating report integrity...');
      const integrity = this._validateIntegrity(reports);
      consolidated.agentStatuses = integrity;

      // Step 2: Aggregate bug findings (Locator)
      this.runtime.info('Step 2/6: Aggregating bug findings...');
      if (reports.locator) {
        consolidated.bugSummary = this._aggregateBugs(reports.locator);
      }

      // Step 3: Aggregate runtime status (ErrorMax)
      this.runtime.info('Step 3/6: Aggregating runtime status...');
      if (reports.errormax) {
        consolidated.runtimeStability = this._aggregateRuntime(reports.errormax);
      }

      // Step 4: Aggregate security status (SecureMax)
      this.runtime.info('Step 4/6: Aggregating security status...');
      if (reports.securemax) {
        consolidated.securityStatus = this._aggregateSecurity(reports.securemax);
      }

      // Step 5: Cross-check and detect contradictions
      this.runtime.info('Step 5/6: Cross-checking findings...');
      consolidated.contradictions = this._detectContradictions(reports);
      consolidated.missingTests = this._detectMissingChecks(reports);

      // Step 6: Calculate overall health and recommendation
      this.runtime.info('Step 6/6: Generating recommendation...');
      consolidated.overallHealth = this._calculateOverallHealth(consolidated);
      consolidated.riskLevel = this._calculateOverallRisk(consolidated);
      consolidated.approvalRecommendation = this._generateRecommendation(consolidated);
      consolidated.nextSteps = this._generateNextSteps(consolidated);

    } catch (err) {
      this.runtime.error(`Validation failed: ${err.message}`);
    }

    // Save to memory
    this.runtime.memory.remember('validations', {
      health: consolidated.overallHealth,
      riskLevel: consolidated.riskLevel,
      recommendation: consolidated.approvalRecommendation,
      bugs: consolidated.bugSummary.total,
      stability: consolidated.runtimeStability.score,
      vulns: consolidated.securityStatus.totalVulns
    });

    const report = this._generateReport(consolidated, startTime);
    this.runtime.setStatus('completed');

    return { report, consolidated };
  }

  /**
   * Generate evolution report — called by the self-evolution system
   */
  async generateEvolutionReport(evolutionData) {
    this.runtime.info('Generating evolution report...');

    const report = this._buildEvolutionReport(evolutionData);
    this.runtime.saveReport('evolution-report.md', report);

    this.runtime.memory.remember('evolution-reports', {
      timestamp: new Date().toISOString(),
      trendsAdded: evolutionData.trends?.length || 0,
      cvesAdded: evolutionData.cves?.length || 0,
      agentsUpdated: evolutionData.agentsUpdated || []
    });

    return report;
  }

  // -----------------------------------------------------------
  // Aggregation Methods
  // -----------------------------------------------------------

  _loadReportsFromDisk() {
    const reportsDir = AgentRuntime.getReportsDir();
    const reports = {};

    const files = {
      locator: 'locator-report.md',
      errormax: 'errormax-report.md',
      securemax: 'securemax-report.md'
    };

    for (const [agent, filename] of Object.entries(files)) {
      const filePath = path.join(reportsDir, filename);
      if (fs.existsSync(filePath)) {
        reports[agent] = {
          raw: fs.readFileSync(filePath, 'utf-8'),
          exists: true
        };
      } else {
        reports[agent] = { exists: false };
      }
    }

    return reports;
  }

  _validateIntegrity(reports) {
    const statuses = {};
    for (const [agent, data] of Object.entries(reports)) {
      if (!data || !data.exists) {
        statuses[agent] = { status: 'missing', message: `${agent} report not found` };
      } else if (data.results) {
        statuses[agent] = { status: 'complete', message: 'Report validated' };
      } else if (data.raw) {
        statuses[agent] = { status: 'complete', message: 'Report found on disk' };
      } else {
        statuses[agent] = { status: 'incomplete', message: 'Report exists but may be incomplete' };
      }
    }
    return statuses;
  }

  _aggregateBugs(locatorData) {
    if (locatorData.results) {
      return {
        total: locatorData.results.issues?.length || 0,
        bySeverity: locatorData.results.summary?.severityCounts || {},
        confidence: locatorData.results.confidence || 0,
        filesScanned: locatorData.results.filesScanned || 0
      };
    }
    // Parse from raw markdown
    const total = (locatorData.raw?.match(/Total Issues \| (\d+)/)?.[1]) || 0;
    return { total: parseInt(total), bySeverity: {}, confidence: 0 };
  }

  _aggregateRuntime(errormaxData) {
    if (errormaxData.results) {
      return {
        score: errormaxData.results.stabilityScore || 0,
        status: errormaxData.results.summary?.status || 'unknown',
        buildSuccess: errormaxData.results.buildResult?.success,
        testsRun: errormaxData.results.testResults?.length || 0,
        errors: errormaxData.results.runtimeErrors?.length || 0
      };
    }
    const score = (errormaxData.raw?.match(/Stability Score.*?(\d+)\/100/)?.[1]) || 0;
    return { score: parseInt(score), status: 'parsed' };
  }

  _aggregateSecurity(securemaxData) {
    if (securemaxData.results) {
      return {
        riskLevel: securemaxData.results.riskLevel || 'unknown',
        totalVulns: securemaxData.results.vulnerabilities?.length || 0,
        severityCounts: securemaxData.results.severityCounts || {},
        categories: securemaxData.results.summary?.categories || {}
      };
    }
    const vulns = (securemaxData.raw?.match(/Total Vulnerabilities \| (\d+)/)?.[1]) || 0;
    return { riskLevel: 'unknown', totalVulns: parseInt(vulns) };
  }

  _detectContradictions(reports) {
    const contradictions = [];

    // Example: Locator says clean but ErrorMax found build failures
    if (reports.locator?.results?.summary?.status === 'clean' &&
        reports.errormax?.results?.buildResult?.success === false) {
      contradictions.push({
        issue: 'Locator reports clean code but ErrorMax detected build failures',
        explanation: 'Static analysis passed but runtime compilation failed — check for environment-specific issues'
      });
    }

    // Locator found no issues but SecureMax found critical vulns
    if (reports.locator?.results?.issues?.length === 0 &&
        reports.securemax?.results?.severityCounts?.critical > 0) {
      contradictions.push({
        issue: 'Locator found no issues but SecureMax detected critical vulnerabilities',
        explanation: 'Security vulnerabilities are often different from code quality issues — both checks are needed'
      });
    }

    return contradictions;
  }

  _detectMissingChecks(reports) {
    const missing = [];

    if (!reports.locator?.exists) missing.push('Code analysis (Locator) was not run');
    if (!reports.errormax?.exists) missing.push('Runtime testing (ErrorMax) was not run');
    if (!reports.securemax?.exists) missing.push('Security audit (SecureMax) was not run');

    if (reports.errormax?.results?.testResults?.some(t => t.skipped)) {
      missing.push('Test suite is not configured — add unit tests');
    }

    return missing;
  }

  _calculateOverallHealth(consolidated) {
    const bugScore = Math.max(0, 100 - (consolidated.bugSummary.total * 5));
    const stabilityScore = consolidated.runtimeStability.score || 50;

    const securityPenalty = {
      'CRITICAL': 40, 'HIGH': 25, 'MEDIUM': 10, 'LOW': 5, 'SAFE': 0
    };
    const secScore = Math.max(0, 100 - (securityPenalty[consolidated.securityStatus.riskLevel] || 0));

    const overall = Math.round((bugScore + stabilityScore + secScore) / 3);

    if (overall >= 80) return 'HEALTHY';
    if (overall >= 60) return 'FAIR';
    if (overall >= 40) return 'POOR';
    return 'CRITICAL';
  }

  _calculateOverallRisk(consolidated) {
    if (consolidated.securityStatus.riskLevel === 'CRITICAL') return 'CRITICAL';
    if (consolidated.runtimeStability.score < 30) return 'HIGH';
    if (consolidated.securityStatus.riskLevel === 'HIGH') return 'HIGH';
    if (consolidated.bugSummary.total > 20 || consolidated.runtimeStability.score < 50) return 'MEDIUM';
    if (consolidated.securityStatus.riskLevel === 'MEDIUM') return 'MEDIUM';
    return 'LOW';
  }

  _generateRecommendation(consolidated) {
    if (consolidated.riskLevel === 'CRITICAL') {
      return '❌ DO NOT DEPLOY — Critical issues require immediate attention';
    }
    if (consolidated.riskLevel === 'HIGH') {
      return '⚠️ NOT RECOMMENDED — Fix high-severity issues first';
    }
    if (consolidated.riskLevel === 'MEDIUM') {
      return '⚠️ CONDITIONAL — Address medium issues before production deployment';
    }
    if (consolidated.missingTests.length > 0) {
      return '✅ APPROVED with conditions — Complete missing checks';
    }
    return '✅ APPROVED — Application passes all checks';
  }

  _generateNextSteps(consolidated) {
    const steps = [];

    if (consolidated.securityStatus.totalVulns > 0) {
      steps.push('🛡️ Fix security vulnerabilities — prioritize critical and high severity');
    }
    if (consolidated.runtimeStability.score < 80) {
      steps.push('🐛 Improve application stability — fix runtime errors');
    }
    if (consolidated.bugSummary.total > 0) {
      steps.push('🔍 Address code quality issues found by Locator');
    }
    if (consolidated.missingTests.length > 0) {
      steps.push('🧪 Run missing checks: ' + consolidated.missingTests.join(', '));
    }
    if (consolidated.contradictions.length > 0) {
      steps.push('⚡ Investigate contradictions between agent findings');
    }
    if (steps.length === 0) {
      steps.push('🎉 All checks passed! Ready for the next stage.');
    }

    return steps;
  }

  // -----------------------------------------------------------
  // Report Generation
  // -----------------------------------------------------------

  _generateReport(consolidated, startTime) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const now = new Date().toISOString();

    const healthIcons = { HEALTHY: '🟢', FAIR: '🟡', POOR: '🟠', CRITICAL: '🔴' };
    const riskIcons = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' };

    let report = `# 🧠 FullMax — Final Consolidated Report

> **Agent**: FullMax v1.0 (Master Orchestrator)
> **Date**: ${now}
> **Duration**: ${elapsed}s
> **Overall Health**: ${healthIcons[consolidated.overallHealth]} ${consolidated.overallHealth}
> **Risk Level**: ${riskIcons[consolidated.riskLevel]} ${consolidated.riskLevel}

---

## 📊 Overall Application Health

| Component | Status | Details |
|-----------|--------|---------|
| 🔍 Code Quality (Locator) | ${consolidated.bugSummary.total === 0 ? '✅' : '⚠️'} | ${consolidated.bugSummary.total} issues found |
| 🐛 Runtime Stability (ErrorMax) | ${consolidated.runtimeStability.score >= 80 ? '✅' : '⚠️'} | Score: ${consolidated.runtimeStability.score}/100 |
| 🛡️ Security (SecureMax) | ${consolidated.securityStatus.riskLevel === 'SAFE' ? '✅' : '⚠️'} | Risk: ${consolidated.securityStatus.riskLevel}, ${consolidated.securityStatus.totalVulns} vulns |

---

## 🐛 Bug Summary

- **Total Issues**: ${consolidated.bugSummary.total}
- **Confidence Score**: ${consolidated.bugSummary.confidence || 'N/A'}/100

${Object.entries(consolidated.bugSummary.bySeverity || {}).map(([sev, count]) => `- ${sev}: ${count}`).join('\n')}

---

## ⚡ Runtime Stability

- **Stability Score**: ${consolidated.runtimeStability.score}/100
- **Status**: ${consolidated.runtimeStability.status || 'N/A'}
- **Build**: ${consolidated.runtimeStability.buildSuccess === true ? '✅ Passed' : consolidated.runtimeStability.buildSuccess === false ? '❌ Failed' : '⏭️ N/A'}
- **Tests Run**: ${consolidated.runtimeStability.testsRun || 0}
- **Runtime Errors**: ${consolidated.runtimeStability.errors || 0}

---

## 🛡️ Security Status

- **Risk Level**: ${riskIcons[consolidated.securityStatus.riskLevel] || '❓'} ${consolidated.securityStatus.riskLevel}
- **Total Vulnerabilities**: ${consolidated.securityStatus.totalVulns}

${consolidated.securityStatus.categories ? Object.entries(consolidated.securityStatus.categories).map(([cat, count]) => `- ${cat}: ${count}`).join('\n') : ''}

---

## ⚡ Contradictions Detected

${consolidated.contradictions.length === 0 ? '✅ No contradictions — all agents agree' :
  consolidated.contradictions.map(c => `- ⚠️ **${c.issue}**\n  > ${c.explanation}`).join('\n\n')}

---

## 🧪 Missing Tests

${consolidated.missingTests.length === 0 ? '✅ All checks completed' :
  consolidated.missingTests.map(m => `- ⚠️ ${m}`).join('\n')}

---

## ✅ Approval Recommendation

### ${consolidated.approvalRecommendation}

---

## 📋 Next Steps

${consolidated.nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

---

## 🤖 Agent Status

| Agent | Status |
|-------|--------|
${Object.entries(consolidated.agentStatuses).map(([agent, s]) => `| ${agent} | ${s.status === 'complete' ? '✅' : '❌'} ${s.message} |`).join('\n')}

---

> 💡 **Explanation for Beginners**: This report combines the work of three specialized AI agents that analyzed your code from different angles — code quality, runtime behavior, and security. The overall health score tells you if your application is ready for the next stage. Always fix critical and high-severity issues before deploying to production.

---

*Generated by FullMax Master Orchestrator — AI-WORKSPACE*
`;

    this.runtime.saveReport('final-report.md', report);
    return report;
  }

  _buildEvolutionReport(data) {
    const now = new Date().toISOString();

    let report = `# 🧬 Evolution Report

> **Agent**: FullMax v1.0 (Evolution Monitor)
> **Date**: ${now}
> **Type**: Autonomous Self-Update

---

## 📡 What's New in the Market

### AI & Technology Trends

`;

    if (data.trends && data.trends.length > 0) {
      for (const trend of data.trends.slice(0, 15)) {
        report += `- **${trend.title || 'Untitled'}**\n`;
        if (trend.source) report += `  - Source: ${trend.source}\n`;
        if (trend.relevance) report += `  - Relevance: ${trend.relevance}\n`;
        if (trend.url) report += `  - [Read more](${trend.url})\n`;
        report += '\n';
      }
    } else {
      report += '> No new trends detected in this cycle\n\n';
    }

    report += `---

## 🔐 New CVE Alerts

`;

    if (data.cves && data.cves.length > 0) {
      report += '| CVE ID | Severity | Description | Affected |\n|--------|----------|-------------|----------|\n';
      for (const cve of data.cves.slice(0, 20)) {
        report += `| ${cve.id || 'N/A'} | ${cve.severity || 'N/A'} | ${(cve.description || '').substring(0, 80)} | ${cve.affected || 'N/A'} |\n`;
      }
    } else {
      report += '> No new CVEs detected in this cycle\n';
    }

    report += `\n---

## 🤖 Agent Updates

`;

    if (data.agentsUpdated && data.agentsUpdated.length > 0) {
      for (const update of data.agentsUpdated) {
        report += `### ${update.agent}\n`;
        report += `- **What changed**: ${update.description}\n`;
        report += `- **Entries added**: ${update.entriesAdded || 0}\n\n`;
      }
    } else {
      report += '> No agent knowledge bases were updated in this cycle\n';
    }

    report += `\n---

## 📊 Evolution Summary

- **Trends Discovered**: ${data.trends?.length || 0}
- **CVEs Tracked**: ${data.cves?.length || 0}
- **Agents Updated**: ${data.agentsUpdated?.length || 0}
- **Next Evolution**: Scheduled per cron configuration

---

*Generated by FullMax Evolution Monitor — AI-WORKSPACE*
`;

    return report;
  }
}

export default FullMaxAgent;
