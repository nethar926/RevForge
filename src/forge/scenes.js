/** Scene art ported from Wilson’s published RevForge build. See docs/revforge-merge.md. */
function _(e) {
  let t = e.replace(`#`, ``),
    n = parseInt(
      t.length === 3
        ? t
            .split(``)
            .map((e) => e + e)
            .join(``)
        : t,
      16,
    );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function v(e, t) {
  let [n, r, i] = _(e);
  return `rgba(${n},${r},${i},${t})`;
}
function y(e, t, n, r) {
  let { sim: i, pack: a, motion: o, time: s } = r,
    c = a.palette,
    l = i.speedMps,
    u = a.scene,
    d =
      a.scene === `surge` && l > 18 && o > 0.2
        ? (Math.random() - 0.5) * o * 2.2
        : 0;
  {
    e.save();
    e.translate(d, d * 0.4);
  }
  let f = e.createLinearGradient(0, 0, 0, n);
  {
    f.addColorStop(0, c.skyTop);
    f.addColorStop(0.52, c.haze);
    f.addColorStop(1, c.skyBottom);
    e.fillStyle = f;
    e.fillRect(-4, -4, t + 8, n + 8);
  }
  let p = t * 0.5,
    m = n * (u === `trench` ? 0.46 : u === `grid` ? 0.44 : 0.42);
  {
    if (u === `warp` || u === `starliner` || u === `trench`) {
      x(e, t, n, s, l, c.particle, u === `warp` ? 1.6 : 1);
    }
    if (u === `grid`) {
      S(e, t, n, p, m, c, s);
    }
    if (u === `route66` || u === `coast` || u === `desert`) {
      b(e, t, n, c, u);
    }
    if (u === `alpine`) {
      T(e, t, n, m, c);
    }
    if (u === `miami` || u === `autobahn`) {
      E(e, t, n, m, c, u === `miami`);
    }
    if (u === `coast`) {
      D(e, t, n, m, c, s);
    }
    if (u === `desert`) {
      ee(e, t, n, m, c);
    }
    if (u === `sakura`) {
      te(e, t, n, m, c, s);
    }
    if (u === `trench`) {
      ne(e, t, n, p, m, c, i.distance);
    }
    if (u === `surge`) {
      O(e, t, n, c, l);
    }
    C(e, t, n, p, m, c, i.distance, u);
    if (u === `route66`) {
      w(e, t, n, p, m, i.distance, c);
    }
    if (u === `rain`) {
      k(e, t, n, l, c.particle);
    }
    if (u === `sakura`) {
      A(e, t, n, s, l, c.particle);
    }
    if (u === `desert`) {
      re(e, t, n, s, l, c.particle);
    }
    if (u === `trench`) {
      ie(e, t, n, p, m, s, c.accent);
    }
    if (u === `warp`) {
      j(e, t, n, p, m, l, c.particle);
    }
    if (u === `starliner`) {
      ae(e, t, n, c, s);
    }
  }
  let h = e.createRadialGradient(
    t / 2,
    n * 0.55,
    n * 0.2,
    t / 2,
    n * 0.5,
    n * 0.85,
  );
  {
    h.addColorStop(0, `rgba(0,0,0,0)`);
    h.addColorStop(1, `rgba(0,0,0,0.42)`);
    e.fillStyle = h;
    e.fillRect(0, 0, t, n);
    e.restore();
  }
}
function b(e, t, n, r, i) {
  let a = t * (i === `coast` ? 0.72 : 0.5),
    o = n * 0.34,
    s = Math.min(t, n) * 0.14,
    c = e.createRadialGradient(a, o, s * 0.1, a, o, s * 2.4);
  {
    c.addColorStop(0, r.sun);
    c.addColorStop(0.25, v(r.sun, 0.7));
    c.addColorStop(1, v(r.sun, 0));
    e.fillStyle = c;
    e.beginPath();
    e.arc(a, o, s * 2.4, 0, Math.PI * 2);
    e.fill();
    e.fillStyle = r.sun;
    e.beginPath();
    e.arc(a, o, s * 0.42, 0, Math.PI * 2);
    e.fill();
  }
}
function x(e, t, n, r, i, a, o) {
  e.fillStyle = a;
  let s = Math.floor(90 * o);
  for (let a = 0; a < s; a++) {
    let s = a * 127.1,
      c =
        ((s * 13.3 + r * (8 + i * 4) * (a % 5 == 0 ? 2.4 : 0.4)) % (t + 40)) -
        20,
      l = (Math.sin(s) * 0.5 + 0.5) * n * 0.7,
      u = (a % 7 == 0 ? 1.8 : 0.7) * o;
    {
      e.globalAlpha = 0.35 + (a % 5) * 0.12;
      e.fillRect(c, l, u, u);
    }
  }
  e.globalAlpha = 1;
}
function S(e, t, n, r, i, a, o) {
  {
    e.strokeStyle = v(a.accent, 0.35);
    e.lineWidth = 1;
  }
  for (let n = 0; n < 10; n++) {
    let r = i - 8 - (i / 10) * n * 0.85 + ((o * 8) % (i / 10));
    if (!(r < 0 || r > i)) {
      e.beginPath();
      e.moveTo(0, r);
      e.lineTo(t, r);
      e.stroke();
    }
  }
  let s = r,
    c = i * 0.55,
    l = e.createRadialGradient(s, c, 4, s, c, n * 0.22);
  {
    l.addColorStop(0, a.sun);
    l.addColorStop(1, v(a.sun, 0));
    e.fillStyle = l;
    e.beginPath();
    e.arc(s, c, n * 0.22, 0, Math.PI * 2);
    e.fill();
  }
}
function C(e, t, n, r, i, a, o, s) {
  let c = 0.04,
    l = 0.96;
  {
    e.fillStyle = a.shoulder;
    e.beginPath();
    e.moveTo(0, n);
    e.lineTo(t, n);
    e.lineTo(r + 8, i);
    e.lineTo(r - 8, i);
    e.closePath();
    e.fill();
    e.fillStyle = a.road;
    e.beginPath();
    e.moveTo(t * c, n);
    e.lineTo(t * l, n);
    e.lineTo(r + 4, i);
    e.lineTo(r - 4, i);
    e.closePath();
    e.fill();
  }
  let u = e.createLinearGradient(0, i, 0, n);
  {
    u.addColorStop(
      0,
      v(a.accent, s === `grid` || s === `trench` ? 0.22 : 0.04),
    );
    u.addColorStop(1, v(a.accent, 0));
    e.fillStyle = u;
    e.fill();
    e.save();
    e.beginPath();
    e.moveTo(t * c, n);
    e.lineTo(t * l, n);
    e.lineTo(r + 4, i);
    e.lineTo(r - 4, i);
    e.closePath();
    e.clip();
    e.strokeStyle = a.lane;
  }
  for (let t = 0; t < 22; t++) {
    let a = ((o * 0.42 + t) % 22) / 22,
      s = i + a ** 1.65 * (n - i),
      c = i + Math.min(1, a + 0.035) ** 1.65 * (n - i),
      l = (s - i) / (n - i),
      u = r;
    {
      e.globalAlpha = 0.25 + l * 0.75;
      e.lineWidth = 2 + l * 10;
      e.beginPath();
      e.moveTo(u, s);
      e.lineTo(u, c);
      e.stroke();
    }
  }
  {
    e.globalAlpha = 0.85;
    e.strokeStyle = a.lane;
    e.lineWidth = 3;
    e.beginPath();
    e.moveTo(t * c + 10, n);
    e.lineTo(r - 3, i);
    e.stroke();
    e.beginPath();
    e.moveTo(t * l - 10, n);
    e.lineTo(r + 3, i);
    e.stroke();
    e.restore();
    e.globalAlpha = 1;
  }
  let d = e.createLinearGradient(0, i - 30, 0, i + n * 0.18);
  {
    d.addColorStop(0, v(a.fog, 0));
    d.addColorStop(0.4, v(a.fog, 0.35));
    d.addColorStop(1, v(a.fog, 0));
    e.fillStyle = d;
    e.fillRect(0, i - 40, t, n * 0.28);
  }
}
function w(e, t, n, r, i, a, _o) {
  for (let o = 0; o < 8; o++) {
    let s = i + (((a * 0.12 + o * 1.7) % 8) / 8) ** 1.5 * (n - i),
      c = (s - i) / (n - i),
      l = r - (40 + c * t * 0.55);
    {
      e.fillStyle = v(`#1a120c`, 0.55 + c * 0.4);
      e.fillRect(l, s - c * 140, 3 + c * 5, c * 160);
      e.fillRect(l, s - c * 140, c * 40, 3);
    }
  }
}
function T(e, t, n, r, i) {
  {
    e.fillStyle = i.shoulder;
    e.beginPath();
    e.moveTo(0, r + 20);
    e.lineTo(t * 0.18, r - n * 0.18);
    e.lineTo(t * 0.32, r + 8);
    e.lineTo(t * 0.5, r - n * 0.28);
    e.lineTo(t * 0.68, r + 4);
    e.lineTo(t * 0.86, r - n * 0.16);
    e.lineTo(t, r + 16);
    e.lineTo(t, r + 80);
    e.lineTo(0, r + 80);
    e.fill();
    e.fillStyle = v(`#f8fbff`, 0.7);
    e.beginPath();
    e.moveTo(t * 0.5, r - n * 0.28);
    e.lineTo(t * 0.46, r - n * 0.16);
    e.lineTo(t * 0.54, r - n * 0.16);
    e.fill();
  }
}
function E(e, t, n, r, i, a) {
  let o = r + 8;
  for (let n = 0; n < 18; n++) {
    let r = (t / 18) * n + 4,
      s = 20 + ((n * 17) % 90);
    if (
      ((e.fillStyle = v(i.skyTop, 0.9)), e.fillRect(r, o - s, t / 22, s), a)
    ) {
      e.fillStyle = n % 3 == 0 ? v(i.accent, 0.5) : v(i.sun, 0.35);
      for (let t = 6; t < s - 6; t += 8) e.fillRect(r + 3, o - t - 2, 3, 2);
    }
  }
}
function D(e, t, n, r, i, a) {
  {
    e.fillStyle = v(`#3a6a88`, 0.45);
    e.fillRect(0, r + 10, t * 0.28, n - r);
    e.fillRect(t * 0.72, r + 10, t * 0.28, n - r);
    e.strokeStyle = v(i.sun, 0.25);
  }
  for (let n = 0; n < 6; n++) {
    let i = r + 30 + n * 18 + Math.sin(a + n) * 3;
    {
      e.beginPath();
      e.moveTo(0, i);
      e.lineTo(t * 0.26, i + 6);
      e.stroke();
    }
  }
}
function ee(e, t, n, r, i) {
  {
    e.fillStyle = i.shoulder;
    e.beginPath();
    e.moveTo(0, r + 40);
  }
  for (let n = 0; n <= t; n += 20) {
    let t = r + 18 + Math.sin(n * 0.01) * 22 + Math.sin(n * 0.03) * 10;
    e.lineTo(n, t);
  }
  {
    e.lineTo(t, n);
    e.lineTo(0, n);
    e.fill();
  }
}
function te(e, t, n, r, i, _a) {
  for (let a of [-1, 1])
    for (let o = 0; o < 5; o++) {
      let s = 0.2 + o * 0.16,
        c = t / 2 + a * (80 + s * t * 0.42),
        l = r + s * (n - r) * 0.85;
      {
        e.fillStyle = v(i.particle, 0.45);
        e.beginPath();
        e.arc(c, l - s * 70, s * 48, 0, Math.PI * 2);
        e.fill();
        e.fillStyle = `#2a1818`;
        e.fillRect(c - 2, l - s * 40, 4 + s * 4, s * 70);
      }
    }
}
function ne(e, t, n, r, i, a, o) {
  for (let s of [-1, 1])
    for (let c = 0; c < 16; c++) {
      let l = ((o * 0.35 + c) % 16) / 16,
        u = i + l ** 1.4 * (n - i),
        d = i + Math.min(1, l + 1 / 16) ** 1.4 * (n - i),
        f = (u - i) / (n - i),
        p = (d - i) / (n - i),
        m = r + s * (18 + f * t * 0.48),
        h = r + s * (18 + p * t * 0.48),
        g = s < 0 ? 0 : t;
      {
        e.fillStyle = c % 2 == 0 ? a.shoulder : v(a.road, 0.9);
        e.beginPath();
        e.moveTo(m, u);
        e.lineTo(h, d);
        e.lineTo(g, d);
        e.lineTo(g, u);
        e.closePath();
        e.fill();
        e.strokeStyle = v(a.accent, 0.25);
        e.stroke();
      }
    }
}
function O(e, t, n, r, i) {
  let a = e.createLinearGradient(0, 0, t, 0);
  {
    a.addColorStop(0, v(r.accent, 0.08 + Math.min(0.2, i / 80)));
    a.addColorStop(0.5, `rgba(0,0,0,0)`);
    a.addColorStop(1, v(r.accent, 0.08));
    e.fillStyle = a;
    e.fillRect(0, 0, t, n);
  }
}
function k(e, t, n, r, i) {
  {
    e.strokeStyle = v(i, 0.35);
    e.lineWidth = 1;
  }
  for (let i = 0; i < 90; i++) {
    let a = (i * 73 + r * 40) % t,
      o = (i * 47 + r * 120) % n;
    {
      e.beginPath();
      e.moveTo(a, o);
      e.lineTo(a + 3, o + 14);
      e.stroke();
    }
  }
}
function A(e, t, n, r, i, a) {
  e.fillStyle = a;
  for (let a = 0; a < 28; a++) {
    let o = ((a * 89 + r * 30 + i * 20) % (t + 40)) - 20,
      s = ((a * 53 + r * 18) % (n + 20)) - 10;
    {
      e.globalAlpha = 0.45;
      e.beginPath();
      e.ellipse(o, s, 4, 2.2, r + a, 0, Math.PI * 2);
      e.fill();
    }
  }
  e.globalAlpha = 1;
}
function re(e, t, n, r, i, a) {
  e.fillStyle = v(a, 0.15);
  for (let a = 0; a < 20; a++) {
    let o = ((a * 97 + r * 40 + i * 30) % (t + 80)) - 40,
      s = n * 0.55 + ((a * 13) % 80);
    {
      e.beginPath();
      e.ellipse(o, s, 30 + (a % 5) * 10, 8, 0, 0, Math.PI * 2);
      e.fill();
    }
  }
}
function ie(e, t, n, r, i, a, o) {
  {
    e.strokeStyle = o;
    e.shadowColor = o;
    e.shadowBlur = 12;
  }
  for (let t = 0; t < 3; t++) {
    let o = (a * 0.7 + t * 0.33) % 1,
      s = i + o * o * (n - i),
      c = (s - i) / (n - i),
      l = r + (t === 1 ? -1 : 1) * (20 + c * 90);
    {
      e.lineWidth = 1.5 + c * 3;
      e.globalAlpha = 1 - o;
      e.beginPath();
      e.moveTo(l, s);
      e.lineTo(l + (t === 1 ? -12 : 12), s + 28 + c * 20);
      e.stroke();
    }
  }
  {
    e.shadowBlur = 0;
    e.globalAlpha = 1;
  }
}
function j(e, t, n, r, i, a, o) {
  e.strokeStyle = v(o, 0.45);
  for (let t = 0; t < 40; t++) {
    let n = (t / 40) * Math.PI * 2,
      o = 40 + a * 8 + (t % 5) * 10;
    {
      e.globalAlpha = 0.15 + (a / 80) * 0.5;
      e.beginPath();
      e.moveTo(r + Math.cos(n) * 8, i + Math.sin(n) * 6);
      e.lineTo(r + Math.cos(n) * o, i + Math.sin(n) * o * 0.7);
      e.stroke();
    }
  }
  e.globalAlpha = 1;
}
function ae(e, t, n, r, _i) {
  let a = e.createRadialGradient(
    t * 0.7,
    n * 0.25,
    10,
    t * 0.7,
    n * 0.25,
    n * 0.4,
  );
  {
    a.addColorStop(0, v(r.accent, 0.18));
    a.addColorStop(1, v(r.accent, 0));
    e.fillStyle = a;
    e.fillRect(0, 0, t, n);
  }
}
export { y as drawScene };
