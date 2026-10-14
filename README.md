# Pantry

Home pantry inventory PWA. Hand-off package from design.

## Start with Claude Code

1. Unzip into an empty folder, `cd` into it, `git init`.
2. Run `claude` and paste:

> Read CLAUDE.md, then docs/SPEC.md, docs/DESIGN.md and docs/PLAN.md. Skim design/screens/Main.dc.html for the visual reference. Then do Milestone 1 from PLAN.md and stop at its checkpoint.

3. After each checkpoint: "Continue with Milestone N."

## What's here

| Path | What |
| --- | --- |
| `CLAUDE.md` | Project guide Claude Code reads automatically |
| `docs/SPEC.md` | Build spec: model, rules, screens, decisions, open questions |
| `docs/DESIGN.md` | Visual system + link to the live mockups |
| `docs/PLAN.md` | Milestones M1–M9 |
| `docs/BRIEF.md` | Original design brief |
| `design/screens/` | Mockup source, one file per screen |
| `src/domain/` | Types, behaviour rules, sample data, 21 passing tests |
| `src/ui/icons.ts` | Category + UI icon paths, `guessCategory()` |
| `src/styles/tokens.css` | Design tokens (light mode) |
