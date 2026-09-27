// Zombie Assault — level 1 proof of concept.
// Uses Assets/Tilemap/Animation modules (src/assets.js, tilemap.js, animation.js).
// Runs today with fallback shapes/silence; upgrades automatically once real
// sprites (assets/sprites/*.png) and a Tiled map (assets/maps/level1.json) exist.

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Utility ----------
  const rand = (min, max) => Math.random() * (max - min) + min;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- Input ----------
  const keys = {};
  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  const mouse = { x: 0, y: 0, down: false };
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', () => mouse.down = true);
  canvas.addEventListener('mouseup', () => mouse.down = false);

  // ---------- Weapons ----------
  const WEAPONS = {
    pistol:   { name: 'Pistol',    fireRate: 320, dmg: 12, speed: 700, spread: 0.03, bulletsPerShot: 1, color: '#ffe066', sound: 'shot_pistol' },
    smg:      { name: 'SMG',       fireRate: 100, dmg: 7,  speed: 800, spread: 0.09, bulletsPerShot: 1, color: '#66ffe0', sound: 'shot_smg' },
    shotgun:  { name: 'Shotgun',   fireRate: 700, dmg: 9,  speed: 650, spread: 0.35, bulletsPerShot: 6, color: '#ff9966', sound: 'shot_shotgun' },
    rifle:    { name: 'Rifle',     fireRate: 180, dmg: 22, speed: 1000, spread: 0.015, bulletsPerShot: 1, color: '#c299ff', sound: 'shot_rifle' },
  };
  const weaponOrder = ['pistol', 'smg', 'shotgun', 'rifle'];

  // ---------- World / camera ----------
  let map = null;
  const camera = { x: 0, y: 0 };

  function worldToScreen(x, y) { return { x: x - camera.x, y: y - camera.y }; }

  function updateCamera() {
    camera.x = clamp(player.x - canvas.width / 2, 0, Math.max(0, map.pixelWidth - canvas.width));
    camera.y = clamp(player.y - canvas.height / 2, 0, Math.max(0, map.pixelHeight - canvas.height));
  }

  // ---------- Player ----------
  const player = {
    x: 0, y: 0, r: 16,
    speed: 260,
    hp: 100, maxHp: 100,
    weaponKey: 'pistol',
    lastShot: 0,
    fireRateMult: 1,
    dmgMult: 1,
    invuln: 0,
    anim: null,
  };

  function resetPlayer() {
    player.x = map.pixelWidth / 2;
    player.y = map.pixelHeight / 2;
    player.hp = player.maxHp;
    player.weaponKey = 'pistol';
    player.fireRateMult = 1;
    player.dmgMult = 1;
    player.speed = 260;
    player.invuln = 0;
    player.anim = window.Animation.createAnimator('player');
  }

  // ---------- Entities ----------
  let bullets = [];
  let zombies = [];
  let particles = [];
  let pickups = [];

  function spawnZombie(wave) {
    const edge = Math.floor(rand(0, 4));
    let x, y;
    const margin = 60;
    if (edge === 0) { x = margin; y = rand(0, map.pixelHeight); }
    else if (edge === 1) { x = map.pixelWidth - margin; y = rand(0, map.pixelHeight); }
    else if (edge === 2) { x = rand(0, map.pixelWidth); y = margin; }
    else { x = rand(0, map.pixelWidth); y = map.pixelHeight - margin; }

    const roll = Math.random();
    let type = 'walker';
    if (wave >= 3 && roll < 0.15) type = 'runner';
    if (wave >= 5 && roll > 0.92) type = 'brute';

    const base = {
      walker: { hp: 30, speed: 70, r: 15, dmg: 10, color: '#5c8a4f', score: 10, spriteKey: 'zombie_walker' },
      runner: { hp: 18, speed: 150, r: 12, dmg: 8, color: '#a3d15c', score: 15, spriteKey: 'zombie_runner' },
      brute:  { hp: 120, speed: 45, r: 24, dmg: 25, color: '#7a3b3b', score: 40, spriteKey: 'zombie_brute' },
    }[type];

    const scale = 1 + (wave - 1) * 0.12;
    zombies.push({
      x, y, type,
      r: base.r,
      hp: base.hp * scale,
      maxHp: base.hp * scale,
      speed: base.speed,
      dmg: base.dmg,
      color: base.color,
      score: base.score,
      hitFlash: 0,
      anim: window.Animation.createAnimator(base.spriteKey),
      groanTimer: rand(0, 4),
    });
  }

  function spawnParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(60, 220);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.2, 0.5),
        maxLife: 0.5,
        color,
      });
    }
  }

  function spawnPickup(x, y) {
    if (Math.random() < 0.12) {
      pickups.push({ x, y, r: 10, type: 'health', amount: 20 });
    }
  }

  // ---------- Game state ----------
  let state = 'loading'; // loading | start | playing | upgrade | gameover
  let wave = 0;
  let score = 0;
  let zombiesToSpawn = 0;
  let zombieSpawnTimer = 0;
  let lastTime = performance.now();

  const hpFill = document.getElementById('hp-fill');
  const waveNumEl = document.getElementById('wave-num');
  const scoreEl = document.getElementById('score');
  const weaponNameEl = document.getElementById('weapon-name');
  const centerMsg = document.getElementById('center-msg');
  const upgradePanel = document.getElementById('upgrade-panel');
  const upgradeButtons = document.getElementById('upgrade-buttons');
  const loadingScreen = document.getElementById('loading');
  const loadingFill = document.getElementById('loading-fill');

  function startWave() {
    wave++;
    zombiesToSpawn = 5 + wave * 3;
    zombieSpawnTimer = 0;
    waveNumEl.textContent = wave;
    centerMsg.innerHTML = `<h1>Wave ${wave}</h1>`;
    window.Assets.playSound('wave_start', { volume: 0.6 });
    setTimeout(() => { if (state === 'playing') centerMsg.innerHTML = ''; }, 1200);
  }

  const UPGRADE_POOL = [
    { name: '+20 Max Health', apply: () => { player.maxHp += 20; player.hp += 20; } },
    { name: '+15% Damage', apply: () => { player.dmgMult *= 1.15; } },
    { name: '+15% Fire Rate', apply: () => { player.fireRateMult *= 1.15; } },
    { name: '+10% Move Speed', apply: () => { player.speed *= 1.10; } },
    { name: 'Full Heal', apply: () => { player.hp = player.maxHp; } },
  ];

  function weaponUnlockUpgrade(key) {
    return { name: `Unlock ${WEAPONS[key].name}`, apply: () => { player.weaponKey = key; } };
  }

  function showUpgradeScreen() {
    state = 'upgrade';
    upgradeButtons.innerHTML = '';
    const options = [...UPGRADE_POOL];
    const lockedWeapons = weaponOrder.filter(w => w !== player.weaponKey);
    if (lockedWeapons.length && wave % 2 === 0) {
      const w = lockedWeapons[Math.floor(rand(0, lockedWeapons.length))];
      options.push(weaponUnlockUpgrade(w));
    }
    const picks = [];
    while (picks.length < 3 && options.length) {
      const idx = Math.floor(rand(0, options.length));
      picks.push(options.splice(idx, 1)[0]);
    }
    picks.forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt.name;
      btn.onclick = () => {
        opt.apply();
        upgradePanel.style.display = 'none';
        state = 'playing';
        startWave();
      };
      upgradeButtons.appendChild(btn);
    });
    upgradePanel.style.display = 'block';
  }

  function gameOver() {
    state = 'gameover';
    centerMsg.innerHTML = `<h1>You Died</h1><p>Score: ${score}</p><p>Press R to restart</p>`;
  }

  function startGame() {
    resetPlayer();
    bullets = []; zombies = []; particles = []; pickups = [];
    score = 0; wave = 0;
    scoreEl.textContent = score;
    state = 'playing';
    centerMsg.innerHTML = '';
    startWave();
  }

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === ' ' && state === 'start') startGame();
    if (k === 'r' && state === 'gameover') startGame();
  });

  // ---------- Update ----------
  function updatePlayer(dt) {
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    let moving = false;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      moving = true;
      const resolved = window.Tilemap.resolveWallCollision(map, player, dx * player.speed * dt, dy * player.speed * dt);
      player.x = resolved.x;
      player.y = resolved.y;
    }
    player.x = clamp(player.x, player.r, map.pixelWidth - player.r);
    player.y = clamp(player.y, player.r, map.pixelHeight - player.r);

    window.Animation.updateAnimator(player.anim, dt, moving ? 'walk' : 'idle');

    if (player.invuln > 0) player.invuln -= dt;

    const now = performance.now();
    const weapon = WEAPONS[player.weaponKey];
    const rate = weapon.fireRate / player.fireRateMult;
    if (mouse.down && now - player.lastShot >= rate) {
      player.lastShot = now;
      const worldMouse = { x: mouse.x + camera.x, y: mouse.y + camera.y };
      const baseAngle = Math.atan2(worldMouse.y - player.y, worldMouse.x - player.x);
      window.Assets.playSound(weapon.sound, { volume: 0.5, rate: rand(0.95, 1.05) });
      for (let i = 0; i < weapon.bulletsPerShot; i++) {
        const spread = (Math.random() - 0.5) * weapon.spread * 2;
        const angle = baseAngle + spread;
        bullets.push({
          x: player.x + Math.cos(angle) * (player.r + 4),
          y: player.y + Math.sin(angle) * (player.r + 4),
          vx: Math.cos(angle) * weapon.speed,
          vy: Math.sin(angle) * weapon.speed,
          dmg: weapon.dmg * player.dmgMult,
          color: weapon.color,
          r: 4,
        });
      }
    }
  }

  function updateBullets(dt) {
    bullets = bullets.filter(b => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > map.pixelWidth + 20 || b.y < -20 || b.y > map.pixelHeight + 20) return false;

      for (const wall of map.walls) {
        if (b.x > wall.x && b.x < wall.x + wall.w && b.y > wall.y && b.y < wall.y + wall.h) return false;
      }

      for (const z of zombies) {
        if (z.hp <= 0) continue;
        if (dist(b, z) < b.r + z.r) {
          z.hp -= b.dmg;
          z.hitFlash = 0.1;
          spawnParticles(b.x, b.y, z.color, 4);
          window.Assets.playSound('zombie_hit', { volume: 0.35, rate: rand(0.9, 1.1) });
          return false;
        }
      }
      return true;
    });
  }

  function updateZombies(dt) {
    for (const z of zombies) {
      if (z.hp <= 0) continue;
      const angle = Math.atan2(player.y - z.y, player.x - z.x);
      const resolved = window.Tilemap.resolveWallCollision(map, z, Math.cos(angle) * z.speed * dt, Math.sin(angle) * z.speed * dt);
      z.x = resolved.x;
      z.y = resolved.y;
      if (z.hitFlash > 0) z.hitFlash -= dt;
      window.Animation.updateAnimator(z.anim, dt, 'walk');

      z.groanTimer -= dt;
      if (z.groanTimer <= 0) {
        z.groanTimer = rand(3, 7);
        const d = dist(z, player);
        if (d < 500) window.Assets.playSound('zombie_groan', { volume: clamp(1 - d / 500, 0, 0.4) * 0.5, rate: rand(0.9, 1.1) });
      }

      if (dist(z, player) < z.r + player.r && player.invuln <= 0) {
        player.hp -= z.dmg;
        player.invuln = 0.5;
        spawnParticles(player.x, player.y, '#ff3333', 10);
        window.Assets.playSound('player_hurt', { volume: 0.5 });
        if (player.hp <= 0) {
          player.hp = 0;
          gameOver();
        }
      }
    }

    const before = zombies.length;
    zombies = zombies.filter(z => {
      if (z.hp <= 0) {
        spawnParticles(z.x, z.y, z.color, 12);
        spawnPickup(z.x, z.y);
        score += z.score;
        window.Assets.playSound('zombie_death', { volume: 0.5, rate: rand(0.9, 1.1) });
        return false;
      }
      return true;
    });
    if (zombies.length !== before) scoreEl.textContent = score;
  }

  function updateSpawning(dt) {
    if (zombiesToSpawn > 0) {
      zombieSpawnTimer -= dt;
      if (zombieSpawnTimer <= 0) {
        spawnZombie(wave);
        zombiesToSpawn--;
        zombieSpawnTimer = Math.max(0.25, 1.1 - wave * 0.05);
      }
    } else if (zombies.length === 0) {
      showUpgradeScreen();
    }
  }

  function updateParticles(dt) {
    particles = particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      return p.life > 0;
    });
  }

  function updatePickups(dt) {
    pickups = pickups.filter(p => {
      if (dist(p, player) < p.r + player.r) {
        if (p.type === 'health') player.hp = Math.min(player.maxHp, player.hp + p.amount);
        window.Assets.playSound('pickup', { volume: 0.5 });
        return false;
      }
      return true;
    });
  }

  // ---------- Draw ----------
  function drawPlayer() {
    const s = worldToScreen(player.x, player.y);
    ctx.save();
    if (player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.4;
    const worldMouse = { x: mouse.x + camera.x, y: mouse.y + camera.y };
    const angle = Math.atan2(worldMouse.y - player.y, worldMouse.x - player.x);

    window.Animation.drawAnimated(ctx, player.anim, s.x, s.y, angle, (c) => {
      c.save();
      c.translate(s.x, s.y);
      c.rotate(angle);
      c.fillStyle = '#3d7fd6';
      c.beginPath();
      c.arc(0, 0, player.r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#295a9c';
      c.fillRect(0, -4, player.r + 14, 8);
      c.restore();
    });
    ctx.restore();
  }

  function drawZombies() {
    for (const z of zombies) {
      const s = worldToScreen(z.x, z.y);
      const angle = Math.atan2(player.y - z.y, player.x - z.x);
      window.Animation.drawAnimated(ctx, z.anim, s.x, s.y, angle, (c) => {
        c.save();
        c.fillStyle = z.hitFlash > 0 ? '#ffffff' : z.color;
        c.beginPath();
        c.arc(s.x, s.y, z.r, 0, Math.PI * 2);
        c.fill();
        c.restore();
      });
      const w = z.r * 2;
      ctx.fillStyle = '#000';
      ctx.fillRect(s.x - w / 2, s.y - z.r - 10, w, 4);
      ctx.fillStyle = '#e05555';
      ctx.fillRect(s.x - w / 2, s.y - z.r - 10, w * (z.hp / z.maxHp), 4);
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      const s = worldToScreen(b.x, b.y);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const s = worldToScreen(p.x, p.y);
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups() {
    for (const p of pickups) {
      const s = worldToScreen(p.x, p.y);
      ctx.fillStyle = '#66ff66';
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+', s.x, s.y + 4);
    }
  }

  function drawWorld() {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    window.Tilemap.drawTilemap(ctx, map, window.Assets.getImage('tileset'));
    ctx.restore();
  }

  function updateHUD() {
    hpFill.style.width = `${clamp((player.hp / player.maxHp) * 100, 0, 100)}%`;
    weaponNameEl.textContent = WEAPONS[player.weaponKey].name;
  }

  // ---------- Main loop ----------
  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state === 'playing') {
      updatePlayer(dt);
      updateBullets(dt);
      updateZombies(dt);
      updateSpawning(dt);
      updateParticles(dt);
      updatePickups(dt);
      updateCamera();
      updateHUD();
    }

    if (state !== 'loading') {
      drawWorld();
      drawPickups();
      drawZombies();
      drawBullets();
      drawParticles();
      if (state === 'playing' || state === 'upgrade') drawPlayer();
    }

    requestAnimationFrame(loop);
  }

  // ---------- Boot ----------
  async function boot() {
    window.Assets.loadAll((done, total) => {
      loadingFill.style.width = `${(done / total) * 100}%`;
    }).then(async () => {
      map = await window.Tilemap.loadTilemap('assets/maps/level1.json', canvas.width, canvas.height);
      loadingScreen.style.display = 'none';
      state = 'start';
      centerMsg.innerHTML = `<h1>Zombie Assault</h1><p>WASD to move, mouse to aim & shoot</p><p>Press SPACE to start</p>`;
    });
    requestAnimationFrame(loop);
  }

  boot();
})();
