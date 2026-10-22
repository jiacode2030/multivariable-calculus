// Full error check for index.html: opens every lesson, clicks every control,
// runs the numeric math checks, and checks the phone layout.
// Usage: node tests/check.js   (exits 1 on any failure)
const path = require("path");
const { chromium } = require("playwright");
const url = "file://" + path.resolve(__dirname, "..", "index.html");

(async () => {
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  pg.on("pageerror", e => errs.push("JS error: " + e.message));
  await pg.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await pg.goto(url);

  // 1. every lesson, every button
  const ids = await pg.evaluate(() => LESSONS.map(l => l.id));
  for (const id of ids) {
    try { await pg.evaluate(id => open(id), id); }
    catch (e) { errs.push(`${id}: crashed while opening (${e.message.split("\n")[0]})`); continue; }
    const n = await pg.locator("#controls button").count();
    for (let i = 0; i < n; i++) await pg.locator("#controls button").nth(i).click().catch(() => {});
    if (await pg.locator(".teach p.err").count()) errs.push(`${id}: lesson failed to draw`);
    const rep = await pg.getAttribute("#report", "href");
    if (!rep || !rep.includes("issues/new?title=")) errs.push(`${id}: report link missing`);
  }

  // 2. numeric math checks (theorems balance, exact answers match)
  const math = await pg.evaluate(() => {
    const R = [], rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b)), chk = (name, a, b, tol = 2e-3) => R.push([rel(a, b) < tol ? 'ok ' : 'BAD', name, +a.toFixed(5), +b.toFixed(5)]);
    // Green: boundary vs inside, every preset field, shape, form, size
    for (const F of Object.keys(FIELDS).filter(k => k !== 'custom')) for (const shape of ['disk', 'square']) for (const form of ['circ', 'flux']) for (const Rr of [0.5, 1.2]) {
      const Fd = FIELDS[F], P = { R: Rr }, path = PATHS[shape === 'disk' ? 'circle' : 'square'], { W, Fl } = lineInt(Fd, t => path.r(t, P), 1600), g = form === 'circ' ? (x, y) => curlAt(Fd, x, y) : (x, y) => divAt(Fd, x, y);
      const I = shape === 'disk' ? simpson(t => simpson(r => g(r * Math.cos(t), r * Math.sin(t)) * r, 0, Rr, 60), 0, 2 * Math.PI, 60) : integrate2(g, -Rr, Rr, () => -Rr, () => Rr, 60);
      chk(`green ${F} ${shape} ${form} R=${Rr}`, form === 'circ' ? W : Fl, I);
    }
    // Divergence theorem: every solid × field
    const DV = byId('divergence'); for (const sol of ['ball', 'cube', 'cyl', 'hemi']) for (const F3 of Object.keys(DV.F3S)) { const k = DV.calc({ sol, F3, a: 0.9 }); chk(`divthm ${sol} ${F3}`, k.flux, k.I); }
    // Stokes: every cap × field, two heights
    const ST = byId('stokes'); for (const S of ['disk', 'hemi', 'para']) for (const F3 of Object.keys(ST.F3S)) for (const bulge of [0.5, 1.5]) { const k = ST.calc({ S, F3, R: 1, bulge }); chk(`stokes ${S} ${F3} h=${bulge}`, k.circ, k.flux); }
    // Surface area numeric vs exact formula
    const SU = byId('surface'), ex = { hemi: R => 2 * Math.PI * R * R, sphere: R => 4 * Math.PI * R * R, para: R => Math.PI / 6 * ((1 + 4 * R * R) ** 1.5 - 1), cyl: R => 2 * Math.PI * R };
    for (const S of Object.keys(ex)) for (const Rr of [0.6, 1.2]) chk(`surface area ${S} R=${Rr}`, SU.calc({ S, R: Rr, F3: 'up', u: .4, v: .1 }).area, ex[S](Rr));
    chk('surface flux k thru hemi = πR²', SU.calc({ S: 'hemi', R: 1, F3: 'up', u: .4, v: .1 }).flux, Math.PI);
    chk('surface flux r thru sphere = 4πR³', SU.calc({ S: 'sphere', R: 1, F3: 'rad', u: .4, v: .1 }).flux, 4 * Math.PI);
    // Triple / spherical volumes vs stated exact
    const TR = byId('triple'), V = s => 2 * Math.PI * simpson(r => (TR.SOL[s].zhi(r) - TR.SOL[s].zlo(r)) * r, 0, TR.SOL[s].R, 200);
    chk('triple para 8π', V('para'), 8 * Math.PI); chk('triple cyl 2π', V('cyl'), 2 * Math.PI); chk('triple cone 8π/3', V('cone'), 8 * Math.PI / 3);
    const SPv = { ball: 4 / 3 * Math.PI * 1.5 ** 3, cone: 2 * Math.PI / 3 * 1.5 ** 3 * (1 - Math.SQRT2 / 2), hemi: 2 / 3 * Math.PI * 1.5 ** 3 }, SP = byId('spherical');
    for (const s in SPv) chk(`spherical ${s}`, 2 * Math.PI * simpson(ph => Math.sin(ph), 0, SP.SOL[s].phi * Math.PI / 180, 200) * SP.SOL[s].a ** 3 / 3, SPv[s]);
    // Switching order: dy dx = dx dy for every region × integrand
    for (const r in REGIONS) for (const g in INTEG) { const Rg = REGIONS[r], f = INTEG[g].f; chk(`order ${r} ${g}`, integrate2(f, Rg.a, Rg.b, Rg.lo, Rg.hi, 80), simpson(y => simpson(x => f(x, y), Rg.left(y), Rg.right(y), 40), Rg.c, Rg.d, 1200), 5e-3); }
    // Conservative: three paths agree, and equal f(end) − f(start)
    const CO = byId('conservative'); for (const F of ['grad', 'xy', 'mix']) { const P = { F, bx: 1.3, by: -0.7, bend: 1.4 }, ps = CO.paths(P), Fd = CO.CF[F], w = k => lineInt(Fd, ps[k], 1200).W, d = Fd.f(1.3, -0.7) - Fd.f(0, 0); chk(`conservative ${F} straight`, w('A'), d); chk(`conservative ${F} bent`, w('Bp'), d); chk(`conservative ${F} L-path`, w('Cp'), d); }
    // Jacobian: |J|ΔuΔv ≈ image area on small cells (linear maps exact)
    const JA = byId('jacobian'); for (const T of Object.keys(JA.TR)) { const k = JA.cell({ T, u: .5, v: .5 }), f = k.T.f, h = 1e-5, um = k.u0 + k.du / 2, vm = k.v0 + k.dv / 2, xu = (f(um + h, vm)[0] - f(um - h, vm)[0]) / (2 * h), xv = (f(um, vm + h)[0] - f(um, vm - h)[0]) / (2 * h), yu = (f(um + h, vm)[1] - f(um - h, vm)[1]) / (2 * h), yv = (f(um, vm + h)[1] - f(um, vm - h)[1]) / (2 * h); chk(`jacobian ${T}`, Math.abs(xu * yv - xv * yu) * k.du * k.dv, Math.abs(shoelace(k.img)), 2e-2); }
    // Plate & solid centers of mass vs formulas
    const MA = byId('mass'); chk('half disk ȳ = 4R/3π', MA.calc({ reg: 'half', rho: 'one' }).yb, 4 * 1.5 / (3 * Math.PI)); chk('triangle centroid x̄', MA.calc({ reg: 'tri', rho: 'one' }).xb, 2 / 3);
    const M3 = byId('mass3'); chk('half ball z̄ = 3a/8', M3.calc({ sol: 'hemi', rho: 'one' }).zb, 0.75); chk('cone z̄ = 3h/4', M3.calc({ sol: 'cone', rho: 'one' }).zb, 1.5); chk('cyl Iz = π', M3.calc({ sol: 'cyl', rho: 'one' }).Iz, Math.PI);
    // Double integral: hill on [-1,1]² = 12 ; polar Gaussian full plane → π
    chk('double hill [-1,1]² = 12', integrate2((x, y) => 4 - x * x - 2 * y * y, -1, 1, () => -1, () => 1, 60), 12);
    chk('polar gaussian r≤2 full circle ≈ π(1−e⁻⁴)', 2 * Math.PI * simpson(r => Math.exp(-r * r) * r, 0, 2, 200), Math.PI * (1 - Math.exp(-4)));
    // Critical points of x³−3x+y² classified as stated
    const cps = criticalPointsRaw((x, y) => x ** 3 - 3 * x + y * y, 2.2).map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}:${p.type}`).join(' ');
    R.push([cps === '-1.00,0.00:saddle 1.00,0.00:min' ? 'ok ' : 'BAD', 'critical points x³−3x+y² → ' + cps]);
    // Review: derivatives (formula vs numeric slope) and the check answers
    const nd = (g, x) => (g(x + 1e-5) - g(x - 1e-5)) / 2e-5;
    for (const [k, F] of Object.entries(RD)) for (const t of [0.15, 0.5, 0.85]) { const x = F.A[0] + t * (F.A[1] - F.A[0]); chk(`deriv ${k} at ${x.toFixed(2)}`, F.d(x), nd(F.f, x), 1e-5); }
    const x7 = 0.7;
    chk("d/dx x² sin x", 2 * x7 * Math.sin(x7) + x7 * x7 * Math.cos(x7), nd(x => x * x * Math.sin(x), x7), 1e-6);
    chk("d/dx e^(3x²)", 6 * x7 * Math.exp(3 * x7 * x7), nd(x => Math.exp(3 * x * x), x7), 1e-6);
    chk("d/dx arctan 2x", 2 / (1 + 4 * x7 * x7), nd(x => Math.atan(2 * x), x7), 1e-6);
    chk("d/dx ln x / x", (1 - Math.log(1.7)) / 1.7 ** 2, nd(x => Math.log(x) / x, 1.7), 1e-6);
    // Review: integration (antiderivative vs numeric) and the check answers
    for (const [k, F] of Object.entries(RI)) { chk(`integral ${k} 0..X`, F.F(F.X) - F.F(0), simpson(F.f, 0, F.X, 400), 1e-6); for (const x of [0.3, 1.1]) chk(`antiderivative ${k}`, nd(F.F, x), F.f(x), 1e-5); }
    chk("∫ x eˣ: ((x−1)eˣ)′ = x eˣ", nd(x => (x - 1) * Math.exp(x), 0.9), 0.9 * Math.exp(0.9), 1e-6);
    chk("∫₀^π sin² = π/2", simpson(t => Math.sin(t) ** 2, 0, Math.PI, 400), Math.PI / 2, 1e-6);
    chk("∫₀¹ 2x e^(x²) = e − 1", simpson(x => 2 * x * Math.exp(x * x), 0, 1, 400), Math.E - 1, 1e-6);
    chk("∫₀^2π cos² = π", simpson(t => Math.cos(t) ** 2, 0, 2 * Math.PI, 400), Math.PI, 1e-6);
    // Review: polar areas and the check answers
    for (const [k, C0] of Object.entries(RP)) chk(`polar area ${k}`, 0.5 * simpson(t => C0.r(t) ** 2, 0, C0.T, 800), C0.area, 1e-6);
    chk("polar (−1, √3): r", Math.hypot(-1, Math.sqrt(3)), 2, 1e-9); chk("polar (−1, √3): θ", Math.atan2(Math.sqrt(3), -1), 2 * Math.PI / 3, 1e-9);
    for (const t of [0.3, 1.2, 2.5]) { const r = 4 * Math.sin(t), x = r * Math.cos(t), y = r * Math.sin(t); chk(`r = 4 sin θ on x² + (y − 2)² = 4 (θ=${t})`, x * x + (y - 2) ** 2, 4, 1e-9); }
    chk("cardioid area 3π/2", 0.5 * simpson(t => (1 + Math.cos(t)) ** 2, 0, 2 * Math.PI, 800), 1.5 * Math.PI, 1e-6);
    chk("one petal of cos 2θ = π/8", 0.5 * simpson(t => Math.cos(2 * t) ** 2, -Math.PI / 4, Math.PI / 4, 800), Math.PI / 8, 1e-6);
    // Review: area between curves (dx = dy = exact) and the check answers
    for (const [k, R] of Object.entries(RA)) { const A = raArea(R); chk(`area ${k} dx`, A.dx, R.ex, 1e-5); chk(`area ${k} dy`, A.dy, R.ex, 1e-5); }
    chk("∫₀¹ (x − x³) = 1/4", simpson(x => x - x ** 3, 0, 1, 200), 0.25, 1e-9);
    chk("∫₀² (4 − y²) = 16/3", simpson(y => 4 - y * y, 0, 2, 200), 16 / 3, 1e-9);
    // Review: conics — every drawn point satisfies the expanded form; focus properties hold
    for (const type of ["ell", "hypx", "hypy", "par"]) for (const [a, b, h, kk, pp] of [[3, 2, 0, 0, 0.5], [1.4, 2.6, -1.3, 0.7, 1.2], [2, 2, 1.5, -2, 0.25]]) {
      const P = { type, a, b, h, k: kk, p: pp }, q = conic(P); let worst = 0;
      for (const br of q.branches) for (const [x, y] of br) worst = Math.max(worst, Math.abs(q.G(x, y)) / (1 + Math.abs(q.F)));
      chk(`conic ${type} (${a},${b},${h},${kk}) on its equation`, worst, 0, 1e-9);
      const d2 = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]), X = q.branches[0][37];
      if (type === "ell" && q.foci) chk(`ellipse focal sum ${a},${b}`, d2(X, q.foci[0]) + d2(X, q.foci[1]), 2 * Math.max(a, b), 1e-9);
      if (type.startsWith("hyp")) chk(`hyperbola focal difference ${type}`, Math.abs(d2(X, q.foci[0]) - d2(X, q.foci[1])), 2 * (type === "hypx" ? a : b), 1e-9);
      if (type === "par") chk(`parabola focus = directrix distance`, d2(X, q.foci[0]), Math.abs(X[1] - q.directrix), 1e-9);
    }
    { const q = conic({ type: "ell", a: 3, b: 2, h: 2, k: -1, p: 1 }); for (const t of [0.4, 2.2, 4.1]) { const x = 2 + 3 * Math.cos(t), y = -1 + 2 * Math.sin(t); chk(`4x²+9y²−16x+18y−11 on (x−2)²/9+(y+1)²/4=1`, 4 * x * x + 9 * y * y - 16 * x + 18 * y - 11, 0, 1e-9); } }
    chk("y = x²/8 focus: distance to (0,2) = distance to y = −2", Math.hypot(3, 9 / 8 - 2), 9 / 8 + 2, 1e-9);
    // Review: parametric curves — on their Cartesian equation, velocity matches the numeric derivative
    for (const [k, C0] of Object.entries(PCV)) for (const f of [0.1, 0.45, 0.8]) { const t = C0.T[0] + f * (C0.T[1] - C0.T[0]), [x, y] = C0.r(t); chk(`param ${k} on equation`, C0.G(x, y), 0, 1e-9); chk(`param ${k} velocity x`, C0.d(t)[0], nd(u => C0.r(u)[0], t), 1e-5); chk(`param ${k} velocity y`, C0.d(t)[1], nd(u => C0.r(u)[1], t), 1e-5); }
    for (const t of [0.5, 2, 4]) { chk("(x−2)²+(y+1)²=1", (Math.cos(t)) ** 2 + (Math.sin(t)) ** 2, 1, 1e-12); const x = 1 + 2 * Math.cos(t), y = -2 + 3 * Math.sin(t); chk("(x−1)²/4+(y+2)²/9=1", (x - 1) ** 2 / 4 + (y + 2) ** 2 / 9, 1, 1e-12); }
    chk("speed of (3cos t, 2sin t) at π/2", Math.hypot(-3 * Math.sin(Math.PI / 2), 2 * Math.cos(Math.PI / 2)), 3, 1e-12);
    // Formula sheet: every lesson button points at a real lesson
    for (const g of FORM) for (const [id] of g.go) R.push([byId(id) ? "ok " : "BAD", `formula link ${id}`]);
    return R;
  });
  const bad = math.filter(r => r[0] === "BAD");
  bad.forEach(r => errs.push("Math: " + r.slice(1).join(" | ")));

  // 2b. formula page filter
  await pg.evaluate(() => open("formulas"));
  await pg.fill("#ffind", "stokes");
  const shown = await pg.locator("#teach .fi:visible").count();
  if (shown < 1 || shown > 4) errs.push(`Formula filter: "stokes" showed ${shown} entries`);
  if (!(await pg.locator("#vis").isHidden())) errs.push("Formula page: figure panel should be hidden");

  // 3. phone layout: no sideways scroll, lesson menu opens
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(200);
  if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) errs.push("Phone: page scrolls sideways");
  await pg.locator("#menuBtn").click();
  if (!(await pg.locator("#outline [data-l]").first().isVisible())) errs.push("Phone: lesson menu does not open");

  await b.close();
  console.log(`${ids.length} lessons, ${math.length} math checks, ${errs.length} problems`);
  errs.forEach(e => console.log("  - " + e));
  process.exit(errs.length ? 1 : 0);
})();
