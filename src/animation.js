// Sprite animation — reads a horizontal frame strip (one row per state).
// Expected sheet layout per entity, e.g. player.png:
//   row 0: idle (N frames), row 1: walk (N frames), row 2: death (N frames)
// Configure rows/frame counts/sizes below per sprite key. If the image is
// missing, draw() calls the supplied fallback shape function instead.

const SHEET_CONFIG = {
  player: { frameW: 48, frameH: 48, rows: { idle: 0, walk: 1 }, fps: 8 },
  zombie_walker: { frameW: 48, frameH: 48, rows: { walk: 0, death: 1 }, fps: 6 },
  zombie_runner: { frameW: 48, frameH: 48, rows: { walk: 0, death: 1 }, fps: 10 },
  zombie_brute: { frameW: 64, frameH: 64, rows: { walk: 0, death: 1 }, fps: 5 },
};

function createAnimator(spriteKey) {
  const cfg = SHEET_CONFIG[spriteKey];
  return {
    spriteKey,
    cfg,
    state: 'idle',
    frame: 0,
    timer: 0,
  };
}

function updateAnimator(anim, dt, state) {
  if (!anim.cfg) return;
  if (state !== anim.state) { anim.state = state; anim.frame = 0; anim.timer = 0; }
  anim.timer += dt;
  const frameDur = 1 / anim.cfg.fps;
  if (anim.timer >= frameDur) {
    anim.timer -= frameDur;
    anim.frame++;
  }
}

// Draws the current animation frame rotated to face `angle`, or calls
// fallbackDraw(ctx) if the sprite sheet image isn't loaded.
function drawAnimated(ctx, anim, x, y, angle, fallbackDraw) {
  const img = window.Assets.getImage(anim.spriteKey);
  if (!img || !anim.cfg) {
    fallbackDraw(ctx);
    return;
  }
  const { frameW, frameH, rows } = anim.cfg;
  const row = rows[anim.state] ?? 0;
  const framesInRow = Math.floor(img.width / frameW);
  const frame = anim.frame % Math.max(1, framesInRow);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(
    img,
    frame * frameW, row * frameH, frameW, frameH,
    -frameW / 2, -frameH / 2, frameW, frameH
  );
  ctx.restore();
}

window.Animation = { createAnimator, updateAnimator, drawAnimated, SHEET_CONFIG };
