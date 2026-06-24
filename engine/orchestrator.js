// ============================================================
// ORCHESTRATOR — Multi-Agent Parallel Execution Engine
// ============================================================
// Implements the @fullstack-run command flow. Dispatches Locator,
// ErrorMax, SecureMax in parallel, then feeds results to FullMax.

import { LocatorAgent } from './agents/locator.js';
import { ErrorMaxAgent } from './agents/errormax.js';
import { SecureMaxAgent } from './agents/securemax.js';
import { FullMaxAgent } from './agents/fullmax.js';

export class Orchestrator {
  constructor() {
    this.agents = {};
    this.status = 'idle';
    this.startTime = null;
  }

  /**
   * Run all agents in parallel, then validate with FullMax
   */
  async fullstackRun(targetDir, callbacks = {}) {
    this.status = 'running';
    this.startTime = Date.now();
    const { onAgentStart, onAgentComplete, onPhaseChange, onLog } = callbacks;

    const log = (msg) => {
      if (onLog) onLog(msg);
    };

    log('🚀 Starting Full-Stack Agent Run...');
    log(`📂 Target: ${targetDir}`);
    log('');

    // Phase 1: Launch all 3 sub-agents in parallel
    if (onPhaseChange) onPhaseChange('parallel-scan');
    log('═══════════════════════════════════════');
    log('  PHASE 1: Parallel Agent Execution');
    log('═══════════════════════════════════════');
    log('');

    const locator = new LocatorAgent();
    const errormax = new ErrorMaxAgent();
    const securemax = new SecureMaxAgent();

    this.agents = { locator, errormax, securemax };

    // Launch all agents in parallel
    if (onAgentStart) {
      onAgentStart('locator');
      onAgentStart('errormax');
      onAgentStart('securemax');
    }

    log('🔍 Locator:  Starting code analysis...');
    log('🐛 ErrorMax: Starting runtime tests...');
    log('🛡️ SecureMax: Starting security audit...');
    log('');

    const [locatorResult, errormaxResult, securemaxResult] = await Promise.allSettled([
      locator.scan(targetDir),
      errormax.test(targetDir),
      securemax.audit(targetDir)
    ]);

    // Process results
    const results = {
      locator: locatorResult.status === 'fulfilled'
        ? { ...locatorResult.value, exists: true }
        : { error: locatorResult.reason?.message, exists: false },
      errormax: errormaxResult.status === 'fulfilled'
        ? { ...errormaxResult.value, exists: true }
        : { error: errormaxResult.reason?.message, exists: false },
      securemax: securemaxResult.status === 'fulfilled'
        ? { ...securemaxResult.value, exists: true }
        : { error: securemaxResult.reason?.message, exists: false }
    };

    // Log completion
    log('');
    if (locatorResult.status === 'fulfilled') {
      const r = locatorResult.value.results;
      log(`✅ Locator:  Complete — ${r.issues?.length || 0} issues found (confidence: ${r.confidence}/100)`);
      if (onAgentComplete) onAgentComplete('locator', r);
    } else {
      log(`❌ Locator:  Failed — ${locatorResult.reason?.message}`);
    }

    if (errormaxResult.status === 'fulfilled') {
      const r = errormaxResult.value.results;
      log(`✅ ErrorMax: Complete — Stability: ${r.stabilityScore}/100`);
      if (onAgentComplete) onAgentComplete('errormax', r);
    } else {
      log(`❌ ErrorMax: Failed — ${errormaxResult.reason?.message}`);
    }

    if (securemaxResult.status === 'fulfilled') {
      const r = securemaxResult.value.results;
      log(`✅ SecureMax: Complete — Risk: ${r.riskLevel}, ${r.vulnerabilities?.length || 0} vulns`);
      if (onAgentComplete) onAgentComplete('securemax', r);
    } else {
      log(`❌ SecureMax: Failed — ${securemaxResult.reason?.message}`);
    }

    // Phase 2: FullMax Validation
    log('');
    log('═══════════════════════════════════════');
    log('  PHASE 2: FullMax Validation');
    log('═══════════════════════════════════════');
    log('');

    if (onPhaseChange) onPhaseChange('validation');

    const fullmax = new FullMaxAgent();
    this.agents.fullmax = fullmax;

    if (onAgentStart) onAgentStart('fullmax');
    log('🧠 FullMax:  Consolidating all findings...');

    const fullmaxResult = await fullmax.validate(results);

    log('');
    log(`✅ FullMax:  Validation complete`);
    log(`   Health:  ${fullmaxResult.consolidated.overallHealth}`);
    log(`   Risk:    ${fullmaxResult.consolidated.riskLevel}`);
    log(`   Verdict: ${fullmaxResult.consolidated.approvalRecommendation}`);
    if (onAgentComplete) onAgentComplete('fullmax', fullmaxResult.consolidated);

    // Phase 3: Summary
    log('');
    log('═══════════════════════════════════════');
    log('  FULL-STACK RUN COMPLETE');
    log('═══════════════════════════════════════');
    log('');
    log('📄 Reports saved to /reports/:');
    log('   • locator-report.md');
    log('   • errormax-report.md');
    log('   • securemax-report.md');
    log('   • final-report.md');
    log('');

    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    log(`⏱️ Total time: ${elapsed}s`);

    this.status = 'completed';

    return {
      results,
      consolidated: fullmaxResult.consolidated,
      finalReport: fullmaxResult.report,
      elapsed: parseFloat(elapsed)
    };
  }

  /**
   * Run a single agent
   */
  async runSingle(agentName, targetDir, callbacks = {}) {
    const { onLog } = callbacks;
    const log = (msg) => { if (onLog) onLog(msg); };

    switch (agentName) {
      case 'locator': {
        const agent = new LocatorAgent();
        log('🔍 Starting Locator scan...');
        const result = await agent.scan(targetDir);
        log(`✅ Locator complete — ${result.results.issues?.length || 0} issues found`);
        return result;
      }
      case 'errormax': {
        const agent = new ErrorMaxAgent();
        log('🐛 Starting ErrorMax tests...');
        const result = await agent.test(targetDir);
        log(`✅ ErrorMax complete — Stability: ${result.results.stabilityScore}/100`);
        return result;
      }
      case 'securemax': {
        const agent = new SecureMaxAgent();
        log('🛡️ Starting SecureMax audit...');
        const result = await agent.audit(targetDir);
        log(`✅ SecureMax complete — Risk: ${result.results.riskLevel}`);
        return result;
      }
      case 'fullmax': {
        const agent = new FullMaxAgent();
        log('🧠 Starting FullMax validation...');
        const result = await agent.validate();
        log(`✅ FullMax complete — Health: ${result.consolidated.overallHealth}`);
        return result;
      }
      default:
        throw new Error(`Unknown agent: ${agentName}`);
    }
  }

  getStatus() {
    return {
      status: this.status,
      startTime: this.startTime,
      agents: Object.entries(this.agents).map(([name, agent]) => ({
        name,
        status: agent.runtime?.status || 'unknown'
      }))
    };
  }
}

export default Orchestrator;
