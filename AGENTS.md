# Agent Instructions & Operating Rules

Project: `ob` / `filecrm` (Local-First Offline CRM)

---

## 1. Core Operating Principles

1. **Plan First, Code Second:** Never modify or write code without presenting a clear plan and receiving explicit approval from the user.
2. **Utilize Skills:** Always leverage installed CLI/editor tools, skills, and agents (e.g., skill tools, file search, diagnostics) to gather context before suggesting code or architecture changes.
3. **Respect the Brief:** The source of truth for the stack, schemas, and file structures is the `brief.md` file in the repository root. Do not deviate from locked-in tech choices (Node + Hono, React + Tailwind + shadcn/ui, `vite-plugin-singlefile`, pure JS indexer).
4. **Be Straight to the Point:** Keep explanations concise, technical, and accurate. Avoid fluff or unnecessary filler.

---

## 2. Standard Task Workflow

For every task, bug fix, or feature implementation, you **MUST** follow this exact 3-step loop:

### Step 1: Context & Investigation
* Read relevant codebase files.
* Run pre-flight checks or search skills if needed.
* Do **NOT** edit code during this phase.

### Step 2: Plan & Wait for Approval
* Present a concise breakdown of proposed changes:
  1. **Files to create/modify/delete**
  2. **Summary of changes**
  3. **Potential edge cases or breaking changes**
* **STOP and wait for the user's explicit approval ("LGTM", "Go ahead", "Approved") before proceeding.**

### Step 3: Execution & Verification
* Write clean, type-safe, minimal code matching project conventions.
* Verify syntax, imports, and run relevant test/build commands.
* Summarize what was completed and suggest logical next steps.

---

## 3. Tech Stack Quick Reference

* **CLI Runner:** tbd
* **Backend:** Node.js + Hono (Embedded HTTP server, fast startup)
* **Frontend:** React + Tailwind CSS + shadcn/ui (Bundled via `vite-plugin-singlefile`)
* **Index / Search:** Pure JS in-memory Map / FlexSearch (Zero native C++ bindings)
* **Storage Format:** Standard Markdown files (`.md`) with YAML frontmatter + `documents/` folder
* **Sync:** Git CLI sub-processes (`git status`, `git pull --rebase`, `git add`, `git commit`, `git push`)
