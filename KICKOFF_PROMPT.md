# Kickoff prompt for Claude Code

## One-time setup
1. Install Claude Code from https://docs.claude.com (follow the install steps for your computer).
2. Unzip this folder, open a terminal in it, then run:
   `git init`
   `claude`
3. Paste the prompt below.

## Prompt to paste

Read CLAUDE.md and docs/PRD.md, then look at the files in prototype/ for layout and copy.

Work in plan mode. Do not write code yet.

Give me a plain-language plan for Phase 0 only:
1. Confirm or change the proposed stack, with reasons, and tell me if you recommend something safer or more scalable.
2. Repo structure.
3. CI pipeline with secret scanning, dependency scanning and SAST.
4. Database schema from the PRD, including field-level encryption for contact details and an audit log.
5. Authentication and RBAC design (visitor, company user, admin, superadmin, with MFA for company users and admins), and how verification fields stay admin-only.
6. The public customer screens in English and Arabic (RTL), using fake seed data marked "(sample)".
7. The tests you will write, including cross-company access tests.
8. A list of anything in my idea that creates a security, scalability or legal risk, and what you suggest instead.

Then stop and wait for my approval. After approval, build in small steps, one branch and one PR per step, and show me what was checked and what was not at the end of each step.

## Rules while building
- Never read or print .env files. Use .env.example with placeholders.
- Do not put secrets in code, prompts or Git.
- If I ask for something unsafe, say so and offer a safer option first.
- Keep explanations short and in plain words.
