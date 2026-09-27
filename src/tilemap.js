// Tilemap — loads a Tiled (mapeditor.org) JSON export.
// Expects an orthogonal map with a "walls" object layer (rectangles) for
// collision, and optionally a tile layer named "ground" for visuals.
// If no map file exists yet, falls back to a hardcoded single-room layout
// so the game runs before you've built a level in Tiled.

function fallbackMap(width, height) {
  // Open room with a border wall and a couple of interior obstacles —
  // stand-in until assets/maps/level1.json exists.
  const margin = 40;
  const walls = [
    { x: 0, y: 0, w: width, h: margin },
    { x: 0, y: height - margin, w: width, h: margin },
    { x: 0, y: 0, w: margin, h: height },
    { x: width - margin, y: 0, w: margin, h: height },
    { x: width * 0.3, y: height * 0.4, w: 120, h: 30 },
    { x: width * 0.65, y: height * 0.55, w: 30, h: 140 },
  ];
  return { walls, tileLayer: null, tileset: null, tileSize: 32, pixelWidth: width, pixelHeight: height };
}

async function loadTilemap(path, viewportW, viewportH) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error('no map file');
    const data = await res.json();

    const tileSize = data.tilewidth || 32;
    const wallsLayer = (data.layers || []).find(l => l.name === 'walls' && l.type === 'objectgroup');
    const groundLayer = (data.layers || []).find(l => l.name === 'ground' && l.type === 'tilelayer');

    const walls = wallsLayer
      ? wallsLayer.objects.map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height }))
      : [];

    return {
      walls,
      tileLayer: groundLayer || null,
      tileSize,
      mapWidthTiles: data.width,
      mapHeightTiles: data.height,
      pixelWidth: data.width * tileSize,
      pixelHeight: data.height * tileSize,
    };
  } catch (e) {
    return fallbackMap(viewportW, viewportH);
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Resolve movement against wall rects by testing X and Y axes separately
// (prevents sliding through corners and gives clean wall-sliding behavior).
function resolveWallCollision(map, entity, dx, dy) {
  const box = (x, y) => ({ x: x - entity.r, y: y - entity.r, w: entity.r * 2, h: entity.r * 2 });

  let x = entity.x + dx;
  let testBox = box(x, entity.y);
  for (const wall of map.walls) {
    if (rectsOverlap(testBox, wall)) { x = entity.x; break; }
  }

  let y = entity.y + dy;
  testBox = box(x, y);
  for (const wall of map.walls) {
    if (rectsOverlap(testBox, wall)) { y = entity.y; break; }
  }

  return { x, y };
}

function drawTilemap(ctx, map, tilesetImage) {
  if (map.tileLayer && tilesetImage) {
    // Real tileset present — draw tiles (assumes a single-column-per-tile
    // atlas indexed left-to-right, top-to-bottom; adjust to your tileset).
    const ts = map.tileSize;
    const cols = Math.floor(tilesetImage.width / ts);
    const layer = map.tileLayer;
    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i];
      if (!gid) continue;
      const tx = (gid - 1) % cols;
      const ty = Math.floor((gid - 1) / cols);
      const dx = (i % map.mapWidthTiles) * ts;
      const dy = Math.floor(i / map.mapWidthTiles) * ts;
      ctx.drawImage(tilesetImage, tx * ts, ty * ts, ts, ts, dx, dy, ts, ts);
    }
  } else {
    // Fallback floor
    ctx.fillStyle = '#1b1f1b';
    ctx.fillRect(0, 0, map.pixelWidth, map.pixelHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < map.pixelWidth; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, map.pixelHeight); ctx.stroke();
    }
    for (let y = 0; y < map.pixelHeight; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(map.pixelWidth, y); ctx.stroke();
    }
  }

  // Walls always drawn as solid blocks (visible even without art)
  ctx.fillStyle = '#3a3a3a';
  for (const w of map.walls) {
    ctx.fillRect(w.x, w.y, w.w, w.h);
  }
}

window.Tilemap = { loadTilemap, resolveWallCollision, drawTilemap, rectsOverlap };
