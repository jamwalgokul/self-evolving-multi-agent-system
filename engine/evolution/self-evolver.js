// ============================================================
// SELF-EVOLVER — Agent Knowledge Update Engine
// ============================================================
// Core evolution engine that updates each agent's knowledge base
// with new trends, CVEs, and best practices. Generates evolution
// reports via FullMax.

import { MemoryStore } from '../memory-store.js';
import { TrendMonitor } from './trend-monitor.js';
import { CVETracker } from './cve-tracker.js';
import { FullMaxAgent } from '../agents/fullmax.js';

export class SelfEvolver {
  constructor() {
    this.trendMonitor = new TrendMonitor();
    this.cveTracker = new CVETracker();
    this.evolutionMemory = new MemoryStore('evolution');
  }

  /**
   * Run a full evolution cycle
   */
  async evolve(callbacks = {}) {
    const { onLog, onPhaseChange } = callbacks;
    const log = (msg) => { if (onLog) onLog(msg); };

    log('🧬 Starting Self-Evolution Cycle...');
    log('');

    const evolutionData = {
      timestamp: new Date().toISOString(),
      trends: [],
      cves: [],
      agentsUpdated: []
    };

    // Phase 1: Fetch Trends
    if (onPhaseChange) onPhaseChange('trends');
    log('📡 Phase 1: Fetching latest AI & tech trends...');

    try {
      evolutionData.trends = await this.trendMonitor.fetchAllTrends();
      log(`   ✅ Found ${evolutionData.trends.length} relevant trends`);
    } catch (err) {
      log(`   ❌ Trend fetch failed: ${err.message}`);
    }

    // Phase 2: Fetch CVEs
    if (onPhaseChange) onPhaseChange('cves');
    log('🔐 Phase 2: Fetching latest CVEs and vulnerability intel...');

    try {
      evolutionData.cves = await this.cveTracker.fetchAllCVEs();
      log(`   ✅ Found ${evolutionData.cves.length} CVEs`);
    } catch (err) {
      log(`   ❌ CVE fetch failed: ${err.message}`);
    }

    // Phase 3: Update Agent Knowledge Bases
    if (onPhaseChange) onPhaseChange('updating');
    log('🤖 Phase 3: Updating agent knowledge bases...');

    // Update SecureMax with new CVE/security knowledge
    const secureUpdate = await this._updateSecureMax(evolutionData);
    if (secureUpdate.updated) {
      evolutionData.agentsUpdated.push(secureUpdate);
      log(`   ✅ SecureMax: +${secureUpdate.entriesAdded} new security patterns`);
    }

    // Update Locator with new detection patterns
    const locatorUpdate = await this._updateLocator(evolutionData);
    if (locatorUpdate.updated) {
      evolutionData.agentsUpdated.push(locatorUpdate);
      log(`   ✅ Locator: +${locatorUpdate.entriesAdded} new detection patterns`);
    }

    // Update ErrorMax with new runtime patterns
    const errormaxUpdate = await this._updateErrorMax(evolutionData);
    if (errormaxUpdate.updated) {
      evolutionData.agentsUpdated.push(errormaxUpdate);
      log(`   ✅ ErrorMax: +${errormaxUpdate.entriesAdded} new runtime patterns`);
    }

    // Phase 4: Generate Evolution Report via FullMax
    if (onPhaseChange) onPhaseChange('reporting');
    log('📄 Phase 4: Generating evolution report via FullMax...');

    const fullmax = new FullMaxAgent();
    const evolutionReport = await fullmax.generateEvolutionReport(evolutionData);

    // Save evolution changelog
    this.evolutionMemory.remember('changelog', {
      timestamp: new Date().toISOString(),
      trendsCount: evolutionData.trends.length,
      cvesCount: evolutionData.cves.length,
      agentsUpdated: evolutionData.agentsUpdated.map(a => a.agent),
      summary: `Evolution cycle: ${evolutionData.trends.length} trends, ${evolutionData.cves.length} CVEs, ${evolutionData.agentsUpdated.length} agents updated`
    });

    log('');
    log('═══════════════════════════════════════');
    log('  🧬 EVOLUTION CYCLE COMPLETE');
    log('═══════════════════════════════════════');
    log(`  Trends discovered: ${evolutionData.trends.length}`);
    log(`  CVEs tracked:      ${evolutionData.cves.length}`);
    log(`  Agents updated:    ${evolutionData.agentsUpdated.length}`);
    log(`  Report saved:      /reports/evolution-report.md`);
    log('');

    return {
      evolutionData,
      report: evolutionReport,
      success: true
    };
  }

  /**
   * Update SecureMax knowledge base with new CVE/security data
   */
  async _updateSecureMax(data) {
    const memory = new MemoryStore('securemax');
    let entriesAdded = 0;

    // Add new CVEs
    for (const cve of (data.cves || []).slice(0, 30)) {
      memory.evolve('cve-cache', {
        id: cve.id,
        description: cve.description,
        severity: cve.severity,
        affected: cve.affected,
        affectedPackage: cve.affectedPackage,
        cwe: cve.cwe,
        fix: cve.fix,
        activelyExploited: cve.activelyExploited || false
      });
      entriesAdded++;
    }

    // Add security-relevant trends
    const securityTrends = (data.trends || []).filter(t =>
      t.title?.toLowerCase().match(/security|vulnerab|exploit|cve|breach|hack|malware|ransomware|zero.day/)
    );

    for (const trend of securityTrends.slice(0, 10)) {
      memory.evolve('security-trends', {
        title: trend.title,
        url: trend.url,
        source: trend.source
      });
      entriesAdded++;
    }

    return {
      agent: 'SecureMax',
      updated: entriesAdded > 0,
      entriesAdded,
      description: `Updated with ${data.cves?.length || 0} CVEs and ${securityTrends.length} security trends`
    };
  }

  /**
   * Update Locator knowledge base with new analysis patterns
   */
  async _updateLocator(data) {
    const memory = new MemoryStore('locator');
    let entriesAdded = 0;

    // Add trends about new frameworks/languages
    const devTrends = (data.trends || []).filter(t =>
      t.title?.toLowerCase().match(/framework|language|library|tool|compiler|runtime|package|npm|pip/)
    );

    for (const trend of devTrends.slice(0, 10)) {
      memory.evolve('learned-patterns', {
        title: trend.title,
        url: trend.url,
        type: 'new-framework-awareness',
        source: trend.source
      });
      entriesAdded++;
    }

    // Add dependency vulnerability awareness
    for (const cve of (data.cves || []).filter(c => c.affectedPackage).slice(0, 15)) {
      memory.evolve('dependency-alerts', {
        package: cve.affectedPackage,
        cve: cve.id,
        severity: cve.severity,
        description: cve.description
      });
      entriesAdded++;
    }

    return {
      agent: 'Locator',
      updated: entriesAdded > 0,
      entriesAdded,
      description: `Updated with ${devTrends.length} development trends and dependency alerts`
    };
  }

  /**
   * Update ErrorMax knowledge base with new runtime patterns
   */
  async _updateErrorMax(data) {
    const memory = new MemoryStore('errormax');
    let entriesAdded = 0;

    // Add trends about new testing tools/practices
    const testTrends = (data.trends || []).filter(t =>
      t.title?.toLowerCase().match(/test|debug|monitor|performance|ci.cd|deploy|devops|observab/)
    );

    for (const trend of testTrends.slice(0, 10)) {
      memory.evolve('testing-trends', {
        title: trend.title,
        url: trend.url,
        type: 'testing-evolution',
        source: trend.source
      });
      entriesAdded++;
    }

    return {
      agent: 'ErrorMax',
      updated: entriesAdded > 0,
      entriesAdded,
      description: `Updated with ${testTrends.length} testing and DevOps trends`
    };
  }

  /**
   * Get evolution history
   */
  getHistory() {
    return this.evolutionMemory.recallRecent('changelog', 20);
  }
}

export default SelfEvolver;
