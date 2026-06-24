#!/usr/bin/env node
// ============================================================
// CLI — Command-Line Interface for AI-WORKSPACE Agents
// ============================================================
// Entry point for all agent commands.

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import { Orchestrator } from './orchestrator.js';
import { EvolutionScheduler } from './evolution/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

// ---- Branding ----

function showBanner() {
  console.log('');
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('     🤖 AI-WORKSPACE — Agent Command Center     ') + chalk.cyan.bold('  ║'));
  console.log(chalk.cyan.bold('  ║') + chalk.gray('     Self-Evolving Multi-Agent System v1.0      ') + chalk.cyan.bold('  ║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════════════╝'));
  console.log('');
}

function showHelp() {
  showBanner();
  console.log(chalk.yellow.bold('  USAGE:'));
  console.log(chalk.white('    node engine/cli.js <command> [options]'));
  console.log('');
  console.log(chalk.yellow.bold('  COMMANDS:'));
  console.log('');
  console.log(chalk.cyan('    locator scan <dir>     ') + chalk.gray('→ Run Locator code analysis'));
  console.log(chalk.cyan('    errormax test <dir>    ') + chalk.gray('→ Run ErrorMax runtime tests'));
  console.log(chalk.cyan('    securemax audit <dir>  ') + chalk.gray('→ Run SecureMax security audit'));
  console.log(chalk.cyan('    fullmax validate       ') + chalk.gray('→ Run FullMax report validation'));
  console.log(chalk.cyan('    fullstack-run <dir>    ') + chalk.gray('→ Run ALL agents in parallel'));
  console.log(chalk.cyan('    evolve                 ') + chalk.gray('→ Run self-evolution cycle'));
  console.log(chalk.cyan('    evolve --schedule      ') + chalk.gray('→ Start evolution cron scheduler'));
  console.log(chalk.cyan('    status                 ') + chalk.gray('→ Show agent status'));
  console.log(chalk.cyan('    --help                 ') + chalk.gray('→ Show this help'));
  console.log('');
  console.log(chalk.yellow.bold('  EXAMPLES:'));
  console.log(chalk.gray('    node engine/cli.js locator scan ./projects/myapp'));
  console.log(chalk.gray('    node engine/cli.js fullstack-run ./projects/myapp'));
  console.log(chalk.gray('    node engine/cli.js evolve'));
  console.log('');
  console.log(chalk.yellow.bold('  NPM SCRIPTS:'));
  console.log(chalk.gray('    npm run scan -- ./projects/myapp'));
  console.log(chalk.gray('    npm run audit -- ./projects/myapp'));
  console.log(chalk.gray('    npm run fullstack-run -- ./projects/myapp'));
  console.log(chalk.gray('    npm run evolve'));
  console.log(chalk.gray('    npm run dashboard'));
  console.log('');
}

// ---- Command Router ----

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const command = args[0]?.toLowerCase();
  const subcommand = args[1]?.toLowerCase();
  const target = args[2] || args[1];

  showBanner();

  const orchestrator = new Orchestrator();

  try {
    switch (command) {
      // ---------- Individual Agents ----------

      case 'locator': {
        if (subcommand !== 'scan' || !args[2]) {
          console.log(chalk.red('  Usage: locator scan <directory>'));
          return;
        }
        const dir = path.resolve(args[2]);
        const spinner = ora({ text: chalk.cyan('  🔍 Locator scanning...'), spinner: 'dots12' }).start();

        const result = await orchestrator.runSingle('locator', dir, {
          onLog: (msg) => spinner.text = chalk.cyan(`  🔍 ${msg}`)
        });

        spinner.succeed(chalk.green(`  🔍 Locator complete — ${result.results.issues?.length || 0} issues found`));
        console.log(chalk.gray(`  📄 Report saved: reports/locator-report.md`));
        console.log(chalk.gray(`  🎯 Confidence: ${result.results.confidence}/100`));
        break;
      }

      case 'errormax': {
        if (subcommand !== 'test' || !args[2]) {
          console.log(chalk.red('  Usage: errormax test <directory>'));
          return;
        }
        const dir = path.resolve(args[2]);
        const spinner = ora({ text: chalk.cyan('  🐛 ErrorMax testing...'), spinner: 'dots12' }).start();

        const result = await orchestrator.runSingle('errormax', dir, {
          onLog: (msg) => spinner.text = chalk.cyan(`  🐛 ${msg}`)
        });

        spinner.succeed(chalk.green(`  🐛 ErrorMax complete — Stability: ${result.results.stabilityScore}/100`));
        console.log(chalk.gray(`  📄 Report saved: reports/errormax-report.md`));
        break;
      }

      case 'securemax': {
        if (subcommand !== 'audit' || !args[2]) {
          console.log(chalk.red('  Usage: securemax audit <directory>'));
          return;
        }
        const dir = path.resolve(args[2]);
        const spinner = ora({ text: chalk.cyan('  🛡️ SecureMax auditing...'), spinner: 'dots12' }).start();

        const result = await orchestrator.runSingle('securemax', dir, {
          onLog: (msg) => spinner.text = chalk.cyan(`  🛡️ ${msg}`)
        });

        spinner.succeed(chalk.green(`  🛡️ SecureMax complete — Risk: ${result.results.riskLevel}`));
        console.log(chalk.gray(`  📄 Report saved: reports/securemax-report.md`));
        break;
      }

      case 'fullmax': {
        const spinner = ora({ text: chalk.cyan('  🧠 FullMax validating...'), spinner: 'dots12' }).start();

        const result = await orchestrator.runSingle('fullmax', null, {
          onLog: (msg) => spinner.text = chalk.cyan(`  🧠 ${msg}`)
        });

        spinner.succeed(chalk.green(`  🧠 FullMax complete — Health: ${result.consolidated.overallHealth}`));
        console.log(chalk.gray(`  📄 Report saved: reports/final-report.md`));
        break;
      }

      // ---------- Full-Stack Run ----------

      case 'fullstack-run': {
        const dir = path.resolve(subcommand || './projects');
        console.log(chalk.magenta.bold('  🚀 FULL-STACK AGENT RUN'));
        console.log(chalk.gray(`  Target: ${dir}`));
        console.log('');

        const result = await orchestrator.fullstackRun(dir, {
          onLog: (msg) => console.log(chalk.white(`  ${msg}`)),
          onAgentStart: (name) => {},
          onAgentComplete: (name, data) => {},
          onPhaseChange: (phase) => {}
        });

        console.log('');
        console.log(chalk.cyan.bold(`  ✨ Health: ${result.consolidated.overallHealth}`));
        console.log(chalk.cyan.bold(`  📊 Risk:   ${result.consolidated.riskLevel}`));
        console.log(chalk.cyan.bold(`  ✅ Verdict: ${result.consolidated.approvalRecommendation}`));
        break;
      }

      // ---------- Evolution ----------

      case 'evolve': {
        if (args.includes('--schedule')) {
          console.log(chalk.magenta.bold('  🧬 Starting Evolution Scheduler...'));
          const scheduler = new EvolutionScheduler();
          scheduler.start();

          // Keep process alive
          console.log(chalk.gray('  Press Ctrl+C to stop'));
          process.on('SIGINT', () => {
            scheduler.stop();
            process.exit(0);
          });
          // Prevent exit
          await new Promise(() => {});
        } else {
          console.log(chalk.magenta.bold('  🧬 Manual Evolution Cycle'));
          console.log('');

          const scheduler = new EvolutionScheduler();
          const result = await scheduler.runNow({
            onLog: (msg) => console.log(chalk.white(`  ${msg}`)),
            onPhaseChange: (phase) => {}
          });

          if (result?.success) {
            console.log(chalk.green.bold('  ✅ Evolution cycle complete!'));
            console.log(chalk.gray('  📄 Report saved: reports/evolution-report.md'));
          } else {
            console.log(chalk.red(`  ❌ Evolution failed: ${result?.error || 'Unknown error'}`));
          }
        }
        break;
      }

      // ---------- Status ----------

      case 'status': {
        console.log(chalk.yellow.bold('  📊 Agent Status'));
        console.log('');
        const agents = ['locator', 'errormax', 'securemax', 'fullmax'];
        for (const name of agents) {
          try {
            const { MemoryStore } = await import('./memory-store.js');
            const mem = new MemoryStore(name);
            const summary = mem.getSummary();
            const categories = Object.keys(summary);
            console.log(chalk.cyan(`  🤖 ${name.toUpperCase()}`));
            if (categories.length === 0) {
              console.log(chalk.gray('     No memory data yet'));
            } else {
              for (const cat of categories) {
                console.log(chalk.gray(`     ${cat}: ${summary[cat].entries} entries (v${summary[cat].version})`));
              }
            }
            console.log('');
          } catch {
            console.log(chalk.gray(`  🤖 ${name.toUpperCase()}: No data`));
          }
        }

        // Evolution status
        const { MemoryStore } = await import('./memory-store.js');
        const evolMem = new MemoryStore('evolution');
        const evolSummary = evolMem.getSummary();
        console.log(chalk.cyan('  🧬 EVOLUTION'));
        const evolCategories = Object.keys(evolSummary);
        if (evolCategories.length === 0) {
          console.log(chalk.gray('     No evolution data — run: node engine/cli.js evolve'));
        } else {
          for (const cat of evolCategories) {
            console.log(chalk.gray(`     ${cat}: ${evolSummary[cat].entries} entries`));
          }
        }
        console.log('');
        break;
      }

      default:
        console.log(chalk.red(`  Unknown command: ${command}`));
        console.log(chalk.gray('  Run with --help to see available commands'));
    }

  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err.message}`));
    if (process.env.LOG_LEVEL === 'debug') {
      console.error(err.stack);
    }
  }
}

main().catch(console.error);
