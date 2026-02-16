# CLAUDE.md — ch4p project rules

## Build & Test

- Always use `corepack pnpm -r build` (NOT `corepack pnpm build`)
- Run tests with `npx vitest run`
- Run `corepack pnpm audit` to verify zero vulnerabilities

## Pre-Push Checklist (mandatory before every push)

1. **Build** — `corepack pnpm -r build` must succeed with no errors
2. **Test** — `npx vitest run` must pass all tests with 0 failures
3. **Audit** — `corepack pnpm audit` must report 0 vulnerabilities
4. **Sensitive info scan** — Run a scan on all staged/changed files for:
   - Hardcoded API keys, tokens, passwords, secrets
   - Hardcoded URLs with embedded credentials
   - Internal IPs or hostnames (not localhost/test fixtures)
   - Real email addresses, phone numbers, personal info
   - `.env` values or credentials in source
   - Bearer tokens that aren't runtime variables
   - Connection strings with real credentials
5. **Never commit**: `handover.md`, `tasks/`, `todo.md`, `lessons.md`

## Git

- Never amend previous commits — always create new commits
- Never force push to main
- Never use `git add -A` or `git add .` — add files by name
- Commit messages should explain "why" not "what"

## Architecture

- 4 Pillars: Broad connectivity, Resilient concurrency, Security-first defaults, Agent reliability
- All defense layers ON by default (security-first)
- IChannel is the messaging surface interface — `editMessage()` is optional for streaming
- MinimalMatrixClient is vendored (no matrix-bot-sdk) to avoid the deprecated `request` dependency chain
