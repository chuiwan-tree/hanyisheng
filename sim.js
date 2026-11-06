// 示众：能玩的。乙，第 13 天。
const W = 900, H = 360, TOP = 46, BOT = 330;
const N = 56;
const P = {
  manBase: 0.8, crowdK: 0.05, crowdCap: 15, boreUp: 0.16, boreDown: 0.03,
  manRange: 230, shoutAmp: 2.8, shoutRange: 210, shoutLife: 2.6, heardK: 0.6,
  cartAmp: 1.0, copCart: 0.3, cartRange: 380, cartLife: 6, wander: 0.27,
  copMan: 0.8, copRange: 420, copHeardK: 0.5,
  ringR: 52, copAwayR: 95, thinNeed: 2.0, thinMax: 2,
  speed: 62, wanderSpeed: 34, manSpeed: 38, youSpeed: 120,
  breathRegen: 0.24, copLock: 3,
};

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

class World {
  constructor(seed) {
    this.r = rng(seed); this.t = 0; this.idc = 0;
    this.man = { x: 450, y: 188, leaving: false, dir: 0 };
    this.cop = this.newPerson(472); this.cop.y = 182; this.cop.isCop = true;
    this.you = { x: 110, y: 300, tx: 110, ty: 300, breath: 1, shouts: 0 };
    this.shouts = []; this.carts = []; this.ppl = [];
    for (let i = 0; i < N; i++) this.ppl.push(this.newPerson(this.r() * W));
    this.nextCart = 25 + this.r() * 30;
    this.thinT = 0; this.state = 'play'; this.followers = 0; this.endT = 0; this.leaveT = 0;
    this.ring = 0; this.events = [];
  }
  newPerson(x) {
    const r = this.r;
    return { id: this.idc++, x, y: TOP + 8 + r() * (BOT - TOP - 16), vx: 0, vy: 0,
      dir: r() < 0.5 ? -1 : 1, bMan: r() * 0.5, heard: 0, heardIds: {}, tgt: null,
      think: r() * 0.5, seen: {} };
  }
  shout() {
    const y = this.you;
    if (this.state !== 'play' && this.state !== 'leaving') return false;
    if (y.breath < 1) return false;
    y.breath -= 1; y.shouts++;
    this.shouts.push({ id: this.idc++, x: y.x, y: y.y, t0: this.t, you: true });
    return true;
  }
  sources() {
    const s = [];
    s.push({ kind: 'man', id: -1, x: this.man.x, y: this.man.y, amp: 1 });
    for (const sh of this.shouts) {
      const a = Math.exp(-(this.t - sh.t0) / P.shoutLife);
      s.push({ kind: 'shout', id: sh.id, x: this.you.x, y: this.you.y, amp: a });
    }
    for (const c of this.carts) {
      const a = Math.exp(-(this.t - c.t0) / P.cartLife);
      s.push({ kind: 'cart', id: c.id, x: c.x, y: c.y, amp: a });
    }
    return s;
  }
  score(p, src) {
    const d = Math.hypot(p.x - src.x, p.y - src.y);
    if (src.kind === 'man') {
      if (p.isCop) return P.copMan * Math.exp(-d / P.copRange);
      const crowd = 1 + P.crowdK * Math.min(this.ring, P.crowdCap);
      return P.manBase * crowd * Math.exp(-p.bMan) * Math.exp(-d / P.manRange);
    }
    if (src.kind === 'shout') {
      const k = p.isCop ? P.copHeardK : P.heardK;
      const h = p.heardIds[src.id] ? p.heard - 1 : p.heard;
      return P.shoutAmp * src.amp * Math.pow(k, h) * Math.exp(-d / P.shoutRange);
    }
    if (src.kind === 'cart') {
      const seen = p.seen[src.id] || 0;
      return (p.isCop ? P.copCart : P.cartAmp) * src.amp * Math.exp(-seen * 0.25) * Math.exp(-d / P.cartRange);
    }
    return 0;
  }
  think(p, srcs) {
    if (p.isCop && p.lockUntil && this.t < p.lockUntil) return;
    let best = null, bs = p.isCop ? 0.05 : P.wander;
    for (const s of srcs) {
      let v = this.score(p, s);
      if (p.tgt && p.tgt.kind === s.kind && p.tgt.id === s.id) v *= 1.2;
      if (v > bs) { bs = v; best = s; }
    }
    if (best && best.kind === 'shout' && !p.heardIds[best.id]) { p.heardIds[best.id] = 1; p.heard++; }
    p.tgt = best ? { kind: best.kind, id: best.id } : null;
  }
  tgtPos(p) {
    if (!p.tgt) return null;
    if (p.tgt.kind === 'man') return [this.man.x, this.man.y, p.isCop ? 16 : 30];
    if (p.tgt.kind === 'shout') { const s = this.shouts.find(z => z.id === p.tgt.id); if (s || (p.isCop && p.lockUntil > this.t)) return [this.you.x, this.you.y, 24]; return null; }
    if (p.tgt.kind === 'cart') { const c = this.carts.find(z => z.id === p.tgt.id); return c ? [c.x, c.y, 30] : null; }
    return null;
  }
  step(dt) {
    const r = this.r; this.t += dt;
    const y = this.you;
    y.breath = Math.min(1.999, y.breath + P.breathRegen * dt);
    { const dx = y.tx - y.x, dy = y.ty - y.y, d = Math.hypot(dx, dy);
      if (d > 2) { const m = Math.min(d, P.youSpeed * dt); y.x += dx / d * m; y.y += dy / d * m; } }
    y.y = Math.max(TOP + 6, Math.min(BOT - 6, y.y));
    this.shouts = this.shouts.filter(s => this.t - s.t0 < P.shoutLife * 3);
    this.carts = this.carts.filter(c => this.t - c.t0 < P.cartLife * 3);
    if (this.t > this.nextCart && this.state === 'play') {
      const side = r() < 0.5 ? 70 + r() * 150 : W - 70 - r() * 150;
      this.carts.push({ id: this.idc++, x: side, y: TOP + 30 + r() * (BOT - TOP - 60), t0: this.t });
      this.events.push([this.t, 'cart']);
      this.nextCart = this.t + 35 + r() * 35;
    }
    // ring
    let ring = 0;
    for (const p of this.ppl) if (Math.hypot(p.x - this.man.x, p.y - this.man.y) < P.ringR) ring++;
    this.ring = ring;
    const srcs = this.sources();
    const all = this.ppl.concat([this.cop]);
    for (const p of all) {
      p.think -= dt;
      if (p.think <= 0) { p.think = 0.4 + r() * 0.3; this.think(p, srcs); }
      const dm = Math.hypot(p.x - this.man.x, p.y - this.man.y);
      if (!p.isCop) {
        if (dm < P.ringR + 10 && p.tgt && p.tgt.kind === 'man') p.bMan += P.boreUp * dt;
        else p.bMan = Math.max(0, p.bMan - P.boreDown * dt);
      }
      if (p.tgt && p.tgt.kind === 'cart') {
        const c = this.carts.find(z => z.id === p.tgt.id);
        if (c && Math.hypot(p.x - c.x, p.y - c.y) < 50) p.seen[c.id] = (p.seen[c.id] || 0) + dt;
      }
      if (p.isCop && p.tgt && p.tgt.kind === 'shout' && !(p.lockUntil > this.t) && Math.hypot(p.x - y.x, p.y - y.y) < 34) {
        p.lockUntil = this.t + P.copLock; this.events.push([this.t, 'ask']);
      }
      let ax = 0, ay = 0;
      const tp = this.tgtPos(p);
      if (tp) {
        const dx = tp[0] - p.x, dy = tp[1] - p.y, d = Math.hypot(dx, dy) || 1;
        const want = d - tp[2];
        const sp = Math.max(-P.speed * 0.5, Math.min(P.speed, want * 3));
        ax = dx / d * sp; ay = dy / d * sp;
      } else {
        ax = p.dir * P.wanderSpeed; ay = (r() - 0.5) * 20;
      }
      // separation
      for (const q of all) {
        if (q === p) continue;
        const dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 < 196 && d2 > 0.01) { const d = Math.sqrt(d2); ax += dx / d * (14 - d) * 9; ay += dy / d * (14 - d) * 9; }
      }
      { const dx = p.x - this.man.x, dy = p.y - this.man.y, d = Math.hypot(dx, dy) || 1;
        if (d < 14) { ax += dx / d * (14 - d) * 12; ay += dy / d * (14 - d) * 12; } }
      p.vx += (ax - p.vx) * Math.min(1, dt * 5); p.vy += (ay - p.vy) * Math.min(1, dt * 5);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.y = Math.max(TOP + 5, Math.min(BOT - 5, p.y));
    }
    // wrap: wanderers walking off are replaced
    for (let i = 0; i < this.ppl.length; i++) {
      const p = this.ppl[i];
      const off = p.x < -12 || p.x > W + 12;
      if (off && !(this.state !== 'play' && p.tgt && p.tgt.kind === 'man')) {
        const np = this.newPerson(p.x < 0 ? W + 8 : -8); np.dir = p.x < 0 ? -1 : 1;
        if (this.state === 'play') this.ppl[i] = np; else { p.gone = true; }
      }
    }
    if (this.state !== 'play') this.ppl = this.ppl.filter(p => !(p.gone && (p.x < -40 || p.x > W + 40)) || (p.tgt && p.tgt.kind === 'man'));
    const copD = Math.hypot(this.cop.x - this.man.x, this.cop.y - this.man.y);
    if (this.state === 'play') {
      if (ring <= P.thinMax && copD > P.copAwayR) this.thinT += dt; else this.thinT = 0;
      if (this.thinT >= P.thinNeed) {
        this.state = 'leaving'; this.leaveT = this.t;
        this.man.dir = this.cop.x > this.man.x ? -1 : 1;
        this.events.push([this.t, 'leave']);
      }
    } else if (this.state === 'leaving') {
      this.man.x += this.man.dir * P.manSpeed * dt;
      if (copD < 20 && this.t - this.leaveT > 0.5) {
        this.state = 'back'; this.events.push([this.t, 'caught']); this.thinT = 0;
      } else if (this.man.x < -30 || this.man.x > W + 30) {
        this.state = 'end'; this.endT = this.t;
        this.followers = this.ppl.filter(p => p.tgt && p.tgt.kind === 'man').length + (this.cop.tgt && this.cop.tgt.kind === 'man' ? 1 : 0);
        this.copFollows = !!(this.cop.tgt && this.cop.tgt.kind === 'man');
        this.events.push([this.t, 'end', this.followers]);
      }
    } else if (this.state === 'back') {
      const dx = 450 - this.man.x;
      if (Math.abs(dx) < 2) { this.man.x = 450; this.state = 'play'; }
      else this.man.x += Math.sign(dx) * Math.min(Math.abs(dx), 40 * dt);
      this.cop.tgt = { kind: 'man', id: -1 }; this.cop.lockUntil = this.t + 0.5;
    } else if (this.state === 'end') {
      this.man.x += this.man.dir * P.manSpeed * dt;
    }
  }
}
if (typeof module !== 'undefined') module.exports = { World, P, W, H, TOP, BOT };
