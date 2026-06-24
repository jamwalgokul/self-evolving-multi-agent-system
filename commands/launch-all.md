# MASTER MULTI-AGENT COMMAND

## COMMAND

@fullstack-run <directory>

Example:

@fullstack-run ./projects/myapp

---

# EXECUTION FLOW

When this command is called:

1. Launch Locator
2. Launch ErrorMax
3. Launch SecureMax

Run all agents in parallel using isolated contexts.

After all agents complete:

4. Send all outputs to FullMax
5. FullMax validates all findings
6. Generate consolidated report
7. Ask user for approval before modifications

---

# CONTEXT ISOLATION

Each subagent MUST:

- maintain separate memory
- maintain separate context window
- avoid sharing chain-of-thought
- only share summarized outputs with FullMax

This minimizes token consumption.

---

# REPORT STORAGE

Save reports in:

/reports/

Files:

- locator-report.md
- errormax-report.md
- securemax-report.md
- final-report.md

---

# UI REQUIREMENTS

Each subagent should have:

- independent UI panel
- separate logs
- independent progress status
- independent memory
- independent execution thread

---

# PERFORMANCE REQUIREMENTS

- Parallel execution enabled
- Async task scheduling enabled
- Token optimization enabled
- Incremental scanning enabled
- Smart caching enabled

---

# SAFETY RULES

- Never auto-deploy
- Never auto-push git commits
- Never auto-delete files
- Never expose secrets
- Always require human approval
