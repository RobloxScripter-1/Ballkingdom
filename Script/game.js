// Ballkingdom: renders every kingdom and troop defined in the JSON folders.
const MAP_SIZE = 120;      // square (cube-shaped) map, in tiles
const TILE = 16;           // world pixels per tile
const SIGHT = 14;          // tiles a unit can see enemies
const MAX_UNITS = 600;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');

const cam = { x: (MAP_SIZE * TILE) / 2, y: (MAP_SIZE * TILE) / 2, zoom: 1 };
const game = { kingdoms: [], byId: {}, troops: {}, units: [], over: false, winner: null, last: 0 };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function toScreen(x, y) {
  return [
    (x * TILE - cam.x) * cam.zoom + canvas.width / 2,
    (y * TILE - cam.y) * cam.zoom + canvas.height / 2,
  ];
}

async function loadFolder(folder) {
  const files = await (await fetch(`${folder}/index.json`)).json();
  return Promise.all(files.map(f => fetch(`${folder}/${f}`).then(r => r.json())));
}

async function boot() {
  try {
    const [troops, kingdoms] = await Promise.all([loadFolder('Troops'), loadFolder('Kingdoms')]);
    troops.forEach(t => (game.troops[t.id] = t));
    game.kingdoms = kingdoms.map(k => ({
      ...k, gold: k.startGold, hp: k.capitalHp, maxHp: k.capitalHp, timer: 0, alive: true,
    }));
    game.kingdoms.forEach(k => (game.byId[k.id] = k));
    resize();
    requestAnimationFrame(loop);
  } catch (err) {
    hud.textContent = 'Could not load Kingdoms/ or Troops/. Run a local server and build the index (see README).';
    console.error(err);
  }
}

function pickTroop(k) {
  const total = k.roster.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of k.roster) {
    if ((roll -= r.weight) < 0) return game.troops[r.troop];
  }
  return game.troops[k.roster[0].troop];
}

function spawn(k) {
  const t = pickTroop(k);
  if (!t || k.gold < t.cost) return;
  k.gold -= t.cost;
  const a = Math.random() * Math.PI * 2;
  const d = k.capitalRadius + 1;
  game.units.push({
    kid: k.id, troop: t.id, hp: t.hp, maxHp: t.hp, cd: 0,
    x: clamp(k.capital.x + Math.cos(a) * d, 0, MAP_SIZE),
    y: clamp(k.capital.y + Math.sin(a) * d, 0, MAP_SIZE),
  });
}

function nearestEnemyCapital(u) {
  let best = null, bd = Infinity;
  for (const k of game.kingdoms) {
    if (!k.alive || k.id === u.kid) continue;
    const d = dist(u, k.capital);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function update(dt) {
  if (game.over) return;

  for (const k of game.kingdoms) {
    if (!k.alive) continue;
    k.gold = Math.min(k.maxGold, k.gold + k.income * dt);
    k.timer += dt;
    if (k.timer >= k.spawnInterval) {
      k.timer = 0;
      if (game.units.length < MAX_UNITS) spawn(k);
    }
  }

  for (const u of game.units) {
    const t = game.troops[u.troop];
    u.cd -= dt;

    // Prefer the nearest enemy unit in sight; otherwise march on the nearest enemy capital.
    let target = null, best = SIGHT * SIGHT;
    for (const o of game.units) {
      if (o.kid === u.kid || o.hp <= 0) continue;
      const d2 = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
      if (d2 < best) { best = d2; target = o; }
    }

    let tx, ty, reach, cap = null;
    if (target) {
      tx = target.x; ty = target.y; reach = t.range;
    } else {
      cap = nearestEnemyCapital(u);
      if (!cap) continue;
      tx = cap.capital.x; ty = cap.capital.y; reach = t.range + cap.capitalRadius;
    }

    const d = Math.hypot(tx - u.x, ty - u.y);
    if (d > reach) {
      const step = Math.min(t.speed * dt, d - reach);
      u.x += ((tx - u.x) / d) * step;
      u.y += ((ty - u.y) / d) * step;
    } else if (u.cd <= 0) {
      u.cd = t.cooldown;
      if (cap) {
        cap.hp -= t.damage;
      } else {
        target.hp -= t.damage;
        if (t.splash) {
          for (const o of game.units) {
            if (o !== target && o.kid !== u.kid && dist(o, target) <= t.splash) o.hp -= t.damage * 0.5;
          }
        }
      }
    }
  }

  game.units = game.units.filter(u => u.hp > 0);

  for (const k of game.kingdoms) {
    if (k.alive && k.hp <= 0) { k.alive = false; k.hp = 0; }
  }
  const alive = game.kingdoms.filter(k => k.alive);
  if (alive.length <= 1) {
    game.over = true;
    game.winner = alive[0] || null;
  }
}

function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0b0f1e';
  ctx.fillRect(0, 0, W, H);

  const [x0, y0] = toScreen(0, 0);
  const [x1, y1] = toScreen(MAP_SIZE, MAP_SIZE);

  ctx.fillStyle = '#1d2440';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  if (TILE * cam.zoom >= 6) {
    ctx.strokeStyle = '#2c3558';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= MAP_SIZE; i++) {
      const sx = toScreen(i, 0)[0];
      const sy = toScreen(0, i)[1];
      ctx.moveTo(sx, y0); ctx.lineTo(sx, y1);
      ctx.moveTo(x0, sy); ctx.lineTo(x1, sy);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 3;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

  // Capitals
  for (const k of game.kingdoms) {
    const size = 4 * TILE * cam.zoom;
    const [cx, cy] = toScreen(k.capital.x - 2, k.capital.y - 2);
    ctx.globalAlpha = k.alive ? 1 : 0.3;
    ctx.fillStyle = k.color;
    ctx.fillRect(cx, cy, size, size);
    ctx.strokeStyle = '#f5f1e6';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, size, size);
    drawBar(cx, cy - 10, size, 6, k.hp / k.maxHp, '#f5f1e6');
    ctx.globalAlpha = 1;
  }

  // Troops
  for (const u of game.units) {
    const t = game.troops[u.troop];
    const k = game.byId[u.kid];
    const [sx, sy] = toScreen(u.x, u.y);
    const r = Math.max(2, t.radius * TILE * cam.zoom);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = k.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#f5f1e6';
    ctx.stroke();
    if (u.hp < u.maxHp && r > 3) drawBar(sx - r, sy - r - 5, r * 2, 3, u.hp / u.maxHp, '#38b000');
  }
}

function drawBar(x, y, w, h, ratio, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h);
}

function updateHud() {
  const rows = game.kingdoms.map(k => {
    const count = game.units.filter(u => u.kid === k.id).length;
    return `<div class="row ${k.alive ? '' : 'dead'}">
      <span class="dot" style="background:${k.color}"></span>
      <strong>${k.name}</strong>
      <span>HP ${Math.ceil(k.hp)}</span>
      <span>Gold ${Math.floor(k.gold)}</span>
      <span>Troops ${count}</span>
    </div>`;
  }).join('');
  const banner = game.over
    ? `<div class="winner">${game.winner ? game.winner.name + ' rules the realm!' : 'No one survives.'}</div>`
    : '';
  hud.innerHTML = banner + rows;
}

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}

function loop(ts) {
  const dt = Math.min(0.05, (ts - (game.last || ts)) / 1000);
  game.last = ts;
  update(dt);
  draw();
  updateHud();
  requestAnimationFrame(loop);
}

// Pan (drag) and zoom (wheel / pinch via pointer)
let drag = null;
canvas.addEventListener('pointerdown', e => {
  drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  cam.x = clamp(drag.cx - (e.clientX - drag.x) / cam.zoom, 0, MAP_SIZE * TILE);
  cam.y = clamp(drag.cy - (e.clientY - drag.y) / cam.zoom, 0, MAP_SIZE * TILE);
});
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  cam.zoom = clamp(cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.3, 4);
}, { passive: false });
window.addEventListener('resize', resize);

boot();
