// ============================================================
// SCHEDULER — Cron-based Auto-Evolution Scheduler
// ============================================================
// Runs evolution cycles on a configurable schedule.
// Can also be triggered manually.

import cron from 'node-cron';
import { SelfEvolver } from './self-evolver.js';

export class EvolutionScheduler {
  constructor() {
    this.evolver = new SelfEvolver();
    this.cronJob = null;
    this.isRunning = false;
    this.lastRun = null;
    this.nextRun = null;
  }

  /**
   * Start the scheduled evolution
   */
  start(cronExpression = null) {
    const schedule = cronExpression || process.env.EVOLUTION_CRON || '0 0 * * *'; // Default: daily midnight

    if (!cron.validate(schedule)) {
      console.error(`Invalid cron expression: ${schedule}`);
      return false;
    }

    console.log(`🧬 Evolution scheduler started: ${schedule}`);
    console.log(`   Next run will fetch latest trends, CVEs, and update all agents`);

    this.cronJob = cron.schedule(schedule, async () => {
      if (this.isRunning) {
        console.log('⏭️ Evolution already running — skipping');
        return;
      }

      console.log('');
      console.log('⏰ Scheduled evolution cycle triggered');
      await this.runNow();
    });

    return true;
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Evolution scheduler stopped');
    }
  }

  /**
   * Run evolution cycle immediately
   */
  async runNow(callbacks = {}) {
    if (this.isRunning) {
      console.log('⏭️ Evolution already in progress');
      return null;
    }

    this.isRunning = true;
    this.lastRun = new Date();

    try {
      const result = await this.evolver.evolve({
        onLog: (msg) => {
          console.log(msg);
          if (callbacks.onLog) callbacks.onLog(msg);
        },
        onPhaseChange: callbacks.onPhaseChange
      });

      this.isRunning = false;
      return result;
    } catch (err) {
      console.error(`Evolution failed: ${err.message}`);
      this.isRunning = false;
      return { success: false, error: err.message };
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun?.toISOString() || 'never',
      schedulerActive: this.cronJob !== null,
      cronExpression: process.env.EVOLUTION_CRON || '0 0 * * *'
    };
  }
}

export default EvolutionScheduler;
