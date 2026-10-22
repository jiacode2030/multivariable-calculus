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
    return R;
  });
  const bad = math.filter(r => r[0] === "BAD");
  bad.forEach(r => errs.push("Math: " + r.slice(1).join(" | ")));

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
