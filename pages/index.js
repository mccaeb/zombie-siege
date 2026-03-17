import { useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';

// ─── Constants ──────────────────────────────────────────────────
const W = 1200, H = 800;
const PLAYER_RADIUS = 16;
const PLAYER_SPEED = 3.2;
const BULLET_SPEED = 10;
const BULLET_RADIUS = 4;
const BULLET_DAMAGE = 25;
const MAX_AMMO = 30;
const RELOAD_TIME = 1500; // ms
const FIRE_RATE = 120; // ms between shots
const PICKUP_RADIUS = 12;
const PICKUP_DURATION = 5000;
const SHAKE_DECAY = 0.85;
const ARENA_PAD = 40;

// Enemy definitions
const ENEMY_TYPES = {
  normal: { radius: 14, speed: 1.2, hp: 50, color: '#5a8a5a', score: 10, dropChance: 0.12 },
  runner: { radius: 10, speed: 2.8, hp: 25, color: '#8a5a5a', score: 20, dropChance: 0.08 },
  tank:   { radius: 22, speed: 0.7, hp: 150, color: '#4a5a4a', score: 30, dropChance: 0.20 },
};

// ─── Helper functions ───────────────────────────────────────────
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function spawnEdge() {
  const side = randInt(0, 3);
  switch (side) {
    case 0: return { x: rand(0, W), y: -30 };
    case 1: return { x: W + 30, y: rand(0, H) };
    case 2: return { x: rand(0, W), y: H + 30 };
    default: return { x: -30, y: rand(0, H) };
  }
}

// ─── Game State Factory ─────────────────────────────────────────
function createGameState() {
  return {
    player: {
      x: W / 2, y: H / 2,
      hp: 100, maxHp: 100,
      ammo: MAX_AMMO, maxAmmo: MAX_AMMO,
      angle: 0,
      speedMult: 1,
      speedBoostEnd: 0,
      reloading: false,
      reloadStart: 0,
      lastShot: 0,
      invincibleUntil: 0,
    },
    bullets: [],
    enemies: [],
    pickups: [],
    particles: [],
    announcements: [],
    keys: {},
    mouse: { x: W / 2, y: H / 2, down: false },
    wave: 0,
    waveTimer: 0,
    waveDelay: 3000,
    waveActive: false,
    enemiesRemaining: 0,
    score: 0,
    kills: 0,
    gameOver: false,
    gameStarted: false,
    shake: { x: 0, y: 0, intensity: 0 },
    time: 0,
    muzzleFlash: 0,
  };
}

// ─── Particle factory ───────────────────────────────────────────
function spawnParticles(particles, x, y, color, count, speedRange, life) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(speedRange[0], speedRange[1]);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      color,
      radius: rand(2, 5),
    });
  }
}

// ─── Main Component ─────────────────────────────────────────────
export default function Game() {
  const canvasRef = useRef(null);
  const stateRef = useRef(createGameState());
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);

  const startWave = useCallback((gs) => {
    gs.wave++;
    gs.waveActive = true;

    const baseCount = 5 + gs.wave * 3;
    const enemies = [];

    for (let i = 0; i < baseCount; i++) {
      let type = 'normal';
      const r = Math.random();
      if (gs.wave >= 3 && r < 0.15 + gs.wave * 0.02) type = 'tank';
      else if (gs.wave >= 2 && r < 0.3 + gs.wave * 0.03) type = 'runner';

      const def = ENEMY_TYPES[type];
      const pos = spawnEdge();
      enemies.push({
        ...pos,
        type,
        hp: def.hp + gs.wave * 5,
        maxHp: def.hp + gs.wave * 5,
        radius: def.radius,
        speed: def.speed + gs.wave * 0.05,
        color: def.color,
        score: def.score,
        dropChance: def.dropChance,
        hitFlash: 0,
      });
    }

    gs.enemies.push(...enemies);
    gs.enemiesRemaining = enemies.length;

    gs.announcements.push({
      text: `WAVE ${gs.wave}`,
      sub: `${baseCount} zombies incoming`,
      time: 2500,
      maxTime: 2500,
    });
  }, []);

  const shoot = useCallback((gs) => {
    const p = gs.player;
    const now = gs.time;

    if (p.reloading || p.ammo <= 0 || now - p.lastShot < FIRE_RATE) return;

    p.ammo--;
    p.lastShot = now;
    gs.muzzleFlash = 6;

    const dx = gs.mouse.x - p.x;
    const dy = gs.mouse.y - p.y;
    const len = Math.hypot(dx, dy) || 1;

    gs.bullets.push({
      x: p.x + (dx / len) * 22,
      y: p.y + (dy / len) * 22,
      vx: (dx / len) * BULLET_SPEED,
      vy: (dy / len) * BULLET_SPEED,
      life: 80,
    });

    // Auto-reload when empty
    if (p.ammo <= 0) {
      p.reloading = true;
      p.reloadStart = now;
    }
  }, []);

  const update = useCallback((gs, dt) => {
    if (gs.gameOver) return;
    gs.time += dt;

    const p = gs.player;

    // ── Player movement ─────────────────────────────
    let mx = 0, my = 0;
    if (gs.keys['w'] || gs.keys['arrowup']) my -= 1;
    if (gs.keys['s'] || gs.keys['arrowdown']) my += 1;
    if (gs.keys['a'] || gs.keys['arrowleft']) mx -= 1;
    if (gs.keys['d'] || gs.keys['arrowright']) mx += 1;

    if (mx || my) {
      const len = Math.hypot(mx, my);
      const spd = PLAYER_SPEED * p.speedMult;
      p.x += (mx / len) * spd * dt;
      p.y += (my / len) * spd * dt;
    }

    p.x = clamp(p.x, ARENA_PAD, W - ARENA_PAD);
    p.y = clamp(p.y, ARENA_PAD, H - ARENA_PAD);

    // ── Player aim angle ────────────────────────────
    p.angle = Math.atan2(gs.mouse.y - p.y, gs.mouse.x - p.x);

    // ── Speed boost timeout ─────────────────────────
    if (p.speedBoostEnd && gs.time > p.speedBoostEnd) {
      p.speedMult = 1;
      p.speedBoostEnd = 0;
    }

    // ── Reloading ───────────────────────────────────
    if (p.reloading && gs.time - p.reloadStart >= RELOAD_TIME) {
      p.ammo = p.maxAmmo;
      p.reloading = false;
    }

    // ── Shooting (hold to fire) ─────────────────────
    if (gs.mouse.down) shoot(gs);

    // ── Muzzle flash decay ──────────────────────────
    if (gs.muzzleFlash > 0) gs.muzzleFlash--;

    // ── Bullets ─────────────────────────────────────
    for (let i = gs.bullets.length - 1; i >= 0; i--) {
      const b = gs.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life--;

      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
        gs.bullets.splice(i, 1);
        continue;
      }

      // Bullet-enemy collision
      for (let j = gs.enemies.length - 1; j >= 0; j--) {
        const e = gs.enemies[j];
        if (dist(b, e) < e.radius + BULLET_RADIUS) {
          e.hp -= BULLET_DAMAGE;
          e.hitFlash = 8;
          gs.bullets.splice(i, 1);

          // Blood particles
          spawnParticles(gs.particles, e.x, e.y, '#8b0000', 4, [1, 3], 400);

          if (e.hp <= 0) {
            // Kill
            gs.score += e.score;
            gs.kills++;
            gs.enemiesRemaining--;

            // Death particles
            spawnParticles(gs.particles, e.x, e.y, '#5c1010', 10, [1, 5], 600);

            // Drop pickup
            if (Math.random() < e.dropChance) {
              const types = ['health', 'ammo', 'speed'];
              const type = types[randInt(0, 2)];
              gs.pickups.push({
                x: e.x, y: e.y, type,
                life: 8000,
              });
            }

            gs.enemies.splice(j, 1);
          }
          break;
        }
      }
    }

    // ── Enemies ─────────────────────────────────────
    for (const e of gs.enemies) {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
      if (e.hitFlash > 0) e.hitFlash--;

      // Enemy-player collision
      if (dist(e, p) < e.radius + PLAYER_RADIUS) {
        if (gs.time > p.invincibleUntil) {
          const dmg = e.type === 'tank' ? 20 : e.type === 'runner' ? 8 : 12;
          p.hp -= dmg;
          p.invincibleUntil = gs.time + 300;

          // Screen shake
          gs.shake.intensity = Math.min(gs.shake.intensity + 6, 15);

          // Hit particles
          spawnParticles(gs.particles, p.x, p.y, '#ff4444', 6, [2, 4], 300);

          if (p.hp <= 0) {
            p.hp = 0;
            gs.gameOver = true;
          }
        }
      }
    }

    // ── Pickups ─────────────────────────────────────
    for (let i = gs.pickups.length - 1; i >= 0; i--) {
      const pk = gs.pickups[i];
      pk.life -= dt;
      if (pk.life <= 0) { gs.pickups.splice(i, 1); continue; }

      if (dist(pk, p) < PICKUP_RADIUS + PLAYER_RADIUS) {
        switch (pk.type) {
          case 'health':
            p.hp = Math.min(p.hp + 30, p.maxHp);
            spawnParticles(gs.particles, pk.x, pk.y, '#44ff44', 6, [1, 3], 400);
            break;
          case 'ammo':
            p.ammo = p.maxAmmo;
            p.reloading = false;
            spawnParticles(gs.particles, pk.x, pk.y, '#ffcc44', 6, [1, 3], 400);
            break;
          case 'speed':
            p.speedMult = 1.8;
            p.speedBoostEnd = gs.time + PICKUP_DURATION;
            spawnParticles(gs.particles, pk.x, pk.y, '#44ccff', 6, [1, 3], 400);
            break;
        }
        gs.pickups.splice(i, 1);
      }
    }

    // ── Particles ───────────────────────────────────
    for (let i = gs.particles.length - 1; i >= 0; i--) {
      const pt = gs.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      pt.life -= dt;
      if (pt.life <= 0) gs.particles.splice(i, 1);
    }

    // ── Announcements ───────────────────────────────
    for (let i = gs.announcements.length - 1; i >= 0; i--) {
      gs.announcements[i].time -= dt;
      if (gs.announcements[i].time <= 0) gs.announcements.splice(i, 1);
    }

    // ── Screen shake ────────────────────────────────
    if (gs.shake.intensity > 0.5) {
      gs.shake.x = rand(-1, 1) * gs.shake.intensity;
      gs.shake.y = rand(-1, 1) * gs.shake.intensity;
      gs.shake.intensity *= SHAKE_DECAY;
    } else {
      gs.shake.x = gs.shake.y = gs.shake.intensity = 0;
    }

    // ── Wave logic ──────────────────────────────────
    if (!gs.waveActive) {
      gs.waveTimer += dt;
      if (gs.waveTimer >= gs.waveDelay) {
        gs.waveTimer = 0;
        startWave(gs);
      }
    } else if (gs.enemiesRemaining <= 0) {
      gs.waveActive = false;
      gs.waveTimer = 0;
      gs.waveDelay = 2000;
      gs.score += gs.wave * 50; // wave bonus

      gs.announcements.push({
        text: `WAVE ${gs.wave} CLEARED`,
        sub: `+${gs.wave * 50} bonus`,
        time: 2000,
        maxTime: 2000,
      });
    }
  }, [shoot, startWave]);

  // ─── Render ─────────────────────────────────────────
  const render = useCallback((ctx, gs) => {
    ctx.save();
    ctx.translate(gs.shake.x, gs.shake.y);

    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Arena border
    ctx.strokeStyle = 'rgba(255,80,80,0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ARENA_PAD, ARENA_PAD, W - ARENA_PAD * 2, H - ARENA_PAD * 2);

    // ── Pickups ─────────────────────
    for (const pk of gs.pickups) {
      const bob = Math.sin(gs.time / 200) * 3;
      const alpha = pk.life < 2000 ? pk.life / 2000 : 1;
      ctx.globalAlpha = alpha;

      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, PICKUP_RADIUS, 0, Math.PI * 2);

      switch (pk.type) {
        case 'health':
          ctx.fillStyle = '#44ff44';
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('+', pk.x, pk.y + bob + 5);
          break;
        case 'ammo':
          ctx.fillStyle = '#ffcc44';
          ctx.fill();
          ctx.fillStyle = '#000';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('A', pk.x, pk.y + bob + 4);
          break;
        case 'speed':
          ctx.fillStyle = '#44ccff';
          ctx.fill();
          ctx.fillStyle = '#000';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('>', pk.x - 1, pk.y + bob + 5);
          break;
      }
      ctx.globalAlpha = 1;
    }

    // ── Enemies ─────────────────────
    for (const e of gs.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);

      // Body
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
      ctx.fill();

      // Eyes
      const dx = gs.player.x - e.x;
      const dy = gs.player.y - e.y;
      const eyeAngle = Math.atan2(dy, dx);
      const eyeR = e.radius * 0.3;
      const eyeOff = e.radius * 0.35;

      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(
        Math.cos(eyeAngle - 0.4) * eyeOff,
        Math.sin(eyeAngle - 0.4) * eyeOff,
        eyeR, 0, Math.PI * 2
      );
      ctx.fill();
      ctx.beginPath();
      ctx.arc(
        Math.cos(eyeAngle + 0.4) * eyeOff,
        Math.sin(eyeAngle + 0.4) * eyeOff,
        eyeR, 0, Math.PI * 2
      );
      ctx.fill();

      // HP bar (if damaged)
      if (e.hp < e.maxHp) {
        const barW = e.radius * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-barW / 2, -e.radius - 10, barW, 4);
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(-barW / 2, -e.radius - 10, barW * (e.hp / e.maxHp), 4);
      }

      ctx.restore();
    }

    // ── Bullets ──────────────────────
    for (const b of gs.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#ffdd44';
      ctx.fill();

      // Trail
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 2, b.y - b.vy * 2);
      ctx.strokeStyle = 'rgba(255,220,68,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ── Player ──────────────────────
    const p = gs.player;
    ctx.save();
    ctx.translate(p.x, p.y);

    // Glow when invincible
    if (gs.time < p.invincibleUntil) {
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,100,100,0.2)';
      ctx.fill();
    }

    // Speed boost aura
    if (p.speedMult > 1) {
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(68,204,255,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#4488cc';
    ctx.fill();
    ctx.strokeStyle = '#6ab0ee';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gun barrel
    ctx.rotate(p.angle);
    ctx.fillStyle = '#999';
    ctx.fillRect(PLAYER_RADIUS - 4, -3, 16, 6);

    // Muzzle flash
    if (gs.muzzleFlash > 0) {
      ctx.fillStyle = `rgba(255,200,50,${gs.muzzleFlash / 6})`;
      ctx.beginPath();
      ctx.arc(PLAYER_RADIUS + 12, 0, 6 + gs.muzzleFlash, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // ── Particles ───────────────────
    for (const pt of gs.particles) {
      const alpha = pt.life / pt.maxLife;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius * alpha, 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── HUD ─────────────────────────
    // HP bar
    const hpW = 200, hpH = 16, hpX = 20, hpY = 20;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(hpX, hpY, hpW, hpH);
    const hpPct = p.hp / p.maxHp;
    ctx.fillStyle = hpPct > 0.5 ? '#44cc44' : hpPct > 0.25 ? '#ccaa44' : '#cc4444';
    ctx.fillRect(hpX, hpY, hpW * hpPct, hpH);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(hpX, hpY, hpW, hpH);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`HP ${p.hp}/${p.maxHp}`, hpX + 6, hpY + 12);

    // Ammo
    const ammoY = hpY + hpH + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(hpX, ammoY, hpW, hpH);
    if (p.reloading) {
      const reloadPct = (gs.time - p.reloadStart) / RELOAD_TIME;
      ctx.fillStyle = '#888';
      ctx.fillRect(hpX, ammoY, hpW * reloadPct, hpH);
      ctx.fillStyle = '#fff';
      ctx.fillText('RELOADING...', hpX + 6, ammoY + 12);
    } else {
      ctx.fillStyle = '#ffcc44';
      ctx.fillRect(hpX, ammoY, hpW * (p.ammo / p.maxAmmo), hpH);
      ctx.fillStyle = '#000';
      ctx.fillText(`AMMO ${p.ammo}/${p.maxAmmo}`, hpX + 6, ammoY + 12);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(hpX, ammoY, hpW, hpH);

    // Score & Wave (top right)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`SCORE: ${gs.score}`, W - 20, 36);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText(`WAVE ${gs.wave}  |  KILLS ${gs.kills}`, W - 20, 56);

    // ── Wave announcements ──────────
    for (const ann of gs.announcements) {
      const pct = ann.time / ann.maxTime;
      const fadeIn = pct > 0.8 ? (1 - pct) / 0.2 : 1;
      const fadeOut = pct < 0.2 ? pct / 0.2 : 1;
      const alpha = Math.min(fadeIn, fadeOut);
      const scale = 1 + (1 - Math.min(fadeIn, 1)) * 0.3;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2, H / 2 - 60);
      ctx.scale(scale, scale);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 48px monospace';
      ctx.fillText(ann.text, 0, 0);

      if (ann.sub) {
        ctx.fillStyle = '#ccc';
        ctx.font = '18px monospace';
        ctx.fillText(ann.sub, 0, 35);
      }

      ctx.restore();
    }

    // ── Crosshair ───────────────────
    const cx = gs.mouse.x, cy = gs.mouse.y;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 4, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 10, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 10); ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,100,100,0.8)';
    ctx.fill();

    ctx.restore(); // shake

    // ── Start screen ────────────────
    if (!gs.gameStarted && !gs.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 56px monospace';
      ctx.fillText('ZOMBIE SIEGE', W / 2, H / 2 - 60);

      ctx.fillStyle = '#aaa';
      ctx.font = '18px monospace';
      ctx.fillText('WASD to move  |  Mouse to aim  |  Click to shoot', W / 2, H / 2);
      ctx.fillText('R to reload  |  Survive as long as you can', W / 2, H / 2 + 30);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('CLICK TO START', W / 2, H / 2 + 90);
    }

    // ── Game over screen ────────────
    if (gs.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 56px monospace';
      ctx.fillText('YOU DIED', W / 2, H / 2 - 80);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px monospace';
      ctx.fillText(`SCORE: ${gs.score}`, W / 2, H / 2 - 20);

      ctx.fillStyle = '#aaa';
      ctx.font = '18px monospace';
      ctx.fillText(`Wave ${gs.wave}  |  ${gs.kills} kills`, W / 2, H / 2 + 20);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('CLICK TO RESTART', W / 2, H / 2 + 80);
    }

    // Reload hint
    if (!p.reloading && p.ammo < 10 && p.ammo > 0 && gs.gameStarted && !gs.gameOver) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,200,100,0.6)';
      ctx.font = '13px monospace';
      ctx.fillText('Press R to reload', W / 2, H - 20);
    }
  }, []);

  // ─── Game loop ──────────────────────────────────────
  const gameLoop = useCallback((timestamp) => {
    const gs = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const rawDt = timestamp - (lastTimeRef.current || timestamp);
    lastTimeRef.current = timestamp;
    const dt = Math.min(rawDt / 16.667, 3); // normalize to ~60fps, cap at 3x

    if (gs.gameStarted) update(gs, dt);
    render(ctx, gs);

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [update, render]);

  // ─── Setup ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Scale for device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const gs = stateRef.current;

    // Input handlers
    const onKeyDown = (e) => {
      gs.keys[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'r' && !gs.player.reloading && gs.player.ammo < gs.player.maxAmmo) {
        gs.player.reloading = true;
        gs.player.reloadStart = gs.time;
      }
      // Prevent scrolling with game keys
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e) => { gs.keys[e.key.toLowerCase()] = false; };

    const getCanvasPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
      };
    };

    const onMouseMove = (e) => {
      const pos = getCanvasPos(e);
      gs.mouse.x = pos.x;
      gs.mouse.y = pos.y;
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      gs.mouse.down = true;

      if (!gs.gameStarted) {
        gs.gameStarted = true;
        return;
      }
      if (gs.gameOver) {
        // Restart
        const newState = createGameState();
        newState.gameStarted = true;
        newState.mouse = gs.mouse;
        stateRef.current = newState;
        return;
      }
    };

    const onMouseUp = () => { gs.mouse.down = false; };

    const onContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);

    // Start loop
    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [gameLoop]);

  return (
    <>
      <Head>
        <title>Zombie Siege</title>
        <meta name="description" content="Top-down zombie survival shooter" />
      </Head>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#111',
        margin: 0,
        overflow: 'hidden',
        cursor: 'none',
      }}>
        <canvas
          ref={canvasRef}
          style={{
            border: '2px solid #333',
            borderRadius: 8,
            cursor: 'none',
          }}
        />
      </div>
    </>
  );
}
