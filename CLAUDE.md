# Multivariable Calculus Lab — notes for Claude Code

Branded as general multivariable calculus; the only course reference is the sidebar subtitle ("Follows the order of Princeton MAT 201, Fall 2026").

Single-file static site served by GitHub Pages. Edit `index.html` directly (the original `src/` + `build.py` split is not in this repo). It must stay a full HTML document (doctype, charset, viewport, robots noindex).

## Layout of index.html
head (title, CSS) → markup → one `<script>` with, in order: engine (helpers, PRESETS, View3D), Map2D + teaching helpers, core state, lesson arrays U1–U4, main (nav, controls, refresh).
Syntax check: extract the `<script>` body and run `node --check` on it.

## Rules
- Course-generic: no semester dates, weeks, PSET numbers or exam schedules in the content.
- No external JS libraries (everything is hand-written canvas). Only Google Fonts.
- Light theme only, IBM Plex Sans / STIX Two Text / IBM Plex Mono.
- All math must be verified numerically before shipping (the check-yourself answers are exact; readouts are computed live).

## Architecture
- `engine_old.js`: helpers (clamp, fmt, compile = safe f(x,y) parser), function PRESETS, numeric derivatives, critical points, quadric classifier, `View3D` (painter's-algorithm 3D renderer: meshes, quads, lines, points), `heat`, `marching` (level curves).
- `engine2.js`: `Map2D` (2D view with bounds, heat grid or `shade(x,y)`, polys, levels, curves, arrows, spins, points, texts, pickable), simpson/integrate2, vector helpers, teaching HTML helpers (head, notice, spot, traps, checks, ro, roRow, M), colors C / CRGB.
- `core.js`: state `S`, `current()` preset, `sample()`, surfaceMesh/surfaceCurve/fnScene, paramMesh, arrow3, polyQuad, boxQuads.
- `lessons_uN.js`: arrays U1–U4 of lesson objects. Plus `U0` (optional Review: derivatives, integration, area between curves, conic sections, parametric curves, polar, series; data RD/RI/RA/conic()/PCV/RP/SER) and `UF` (the Key formulas page, data `FORM`).
- `main.js`: UNITS (each has n, tag, label, name, list; lesson numbers are `tag.i`), sidebar outline + search, hashchange navigation, prev/next pager and ← → keys, Reset, declarative controls, refresh.

## Lesson object
```
{ id, sec, title, fn?, defaults: {...},
  controls(P, ctx) -> [{t:"fn"} | {t:"range",k,label,min,max,step,d?,u?} | {t:"seg",k,label,opts:[[v,label]],wide?} | {t:"acts",label,acts:[[name,label]]} | {t:"text",k,label,show?}],
  teach({L,P,F,f,smp}) -> HTML,
  scene({P,F,f,smp,L}) -> { s3|null, s2|null, s2b?, legend:[[label,color]], v1Lbl?, v2Lbl?, v2Hint? },
  pick?(x,y,P), act?(name,P,ctx), onSeg?(P), onOpen?(P,ctx) }
```
A lesson with `page: true` (the formula sheet) hides the figure panel and renders only `teach`.
`s3` → 3D canvas; `s2` → right 2D map; `s2b` replaces the 3D canvas with a second 2D map (used by the Jacobian lesson). Null views are hidden.

## UI notes
View3D: drag with inertia, pinch zoom, arrow/+/- keys, animated presets (VIEWS, setView), a short intro turn on lesson open, axis compass (gizmo). Every range slider has a play button (startPlay/stopPlay) and a filled track (--p). All motion respects prefers-reduced-motion (RM). Visited lessons are remembered in localStorage (per browser only).
Design guidance: the ui-ux-pro-max skill is installed in `.claude/skills/ui-ux-pro-max` (from github.com/nextlevelbuilder/ui-ux-pro-max-skill, MIT); use its UX rules, not its auto-picked visual style (the repo's light theme and fonts stay).

## claude.ai copy
A second copy is published as a claude.ai artifact. Build it with `python3 tools/to_artifact.py OUT.html` (strips the doctype/head/body wrapper the artifact host adds itself). Never edit that copy by hand.

## Testing
`npm install && npx playwright install chromium && npm test` runs `tests/check.js`: opens every lesson, clicks every control, checks the report link, runs the numeric math checks (Green/Stokes/divergence balance, switching order, exact answers), and checks the phone layout. Exits 1 on any problem.
GitHub Actions (`.github/workflows/check.yml`) runs it on every push, every PR, and weekly. When adding a lesson or changing math, add a numeric check for it in the math section of `tests/check.js`.

## Error reports
Readers report errors through GitHub Issues (pre-filled per lesson). Verify each report numerically or against the textbook before changing anything; reply on the issue with what was found.
