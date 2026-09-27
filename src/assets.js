// Asset loader — images/audio load if present, fail gracefully if not.
// Drop real files into assets/sprites and assets/sfx using these keys
// and everything upgrades automatically; nothing crashes if a file is missing.

const IMAGE_MANIFEST = {
  player: 'assets/sprites/player.png',
  zombie_walker: 'assets/sprites/zombie_walker.png',
  zombie_runner: 'assets/sprites/zombie_runner.png',
  zombie_brute: 'assets/sprites/zombie_brute.png',
  tileset: 'assets/sprites/tileset.png',
  muzzle_flash: 'assets/sprites/muzzle_flash.png',
};

const SOUND_MANIFEST = {
  shot_pistol: ['assets/sfx/shot_pistol.mp3', 'assets/sfx/shot_pistol.wav'],
  shot_smg: ['assets/sfx/shot_smg.mp3', 'assets/sfx/shot_smg.wav'],
  shot_shotgun: ['assets/sfx/shot_shotgun.mp3', 'assets/sfx/shot_shotgun.wav'],
  shot_rifle: ['assets/sfx/shot_rifle.mp3', 'assets/sfx/shot_rifle.wav'],
  zombie_hit: ['assets/sfx/zombie_hit.mp3', 'assets/sfx/zombie_hit.wav'],
  zombie_death: ['assets/sfx/zombie_death.mp3', 'assets/sfx/zombie_death.wav'],
  zombie_groan: ['assets/sfx/zombie_groan.mp3', 'assets/sfx/zombie_groan.wav'],
  player_hurt: ['assets/sfx/player_hurt.mp3', 'assets/sfx/player_hurt.wav'],
  pickup: ['assets/sfx/pickup.mp3', 'assets/sfx/pickup.wav'],
  wave_start: ['assets/sfx/wave_start.mp3', 'assets/sfx/wave_start.wav'],
  ambient: ['assets/sfx/ambient.mp3', 'assets/sfx/ambient.wav'],
};

const images = {};   // key -> HTMLImageElement | null (null = missing, use fallback drawing)
const sounds = {};   // key -> HTMLAudioElement[] (pool) | [] if missing

function loadImage(key, path) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { images[key] = img; resolve(); };
    img.onerror = () => { images[key] = null; resolve(); }; // missing asset is OK
    img.src = path;
  });
}

function probeAudio(paths) {
  // Try each candidate extension; resolve with a working <audio> template or null.
  return new Promise(resolve => {
    let i = 0;
    const tryNext = () => {
      if (i >= paths.length) return resolve(null);
      const a = new Audio();
      const path = paths[i++];
      a.oncanplaythrough = () => resolve(a);
      a.onerror = tryNext;
      a.src = path;
    };
    tryNext();
  });
}

async function loadAll(onProgress) {
  const imageKeys = Object.keys(IMAGE_MANIFEST);
  const soundKeys = Object.keys(SOUND_MANIFEST);
  const total = imageKeys.length + soundKeys.length;
  let done = 0;
  const bump = () => { done++; if (onProgress) onProgress(done, total); };

  await Promise.all(imageKeys.map(k => loadImage(k, IMAGE_MANIFEST[k]).then(bump)));
  await Promise.all(soundKeys.map(async k => {
    const template = await probeAudio(SOUND_MANIFEST[k]);
    sounds[k] = template ? { src: template.src, pool: [] } : null;
    bump();
  }));
}

function getImage(key) {
  return images[key] || null;
}

// Simple pooled playback so overlapping sfx (e.g. rapid gunfire) don't cut each other off.
function playSound(key, { volume = 1, loop = false, rate = 1 } = {}) {
  const entry = sounds[key];
  if (!entry) return null; // asset not present — silently no-op
  let audio = entry.pool.find(a => a.paused || a.ended);
  if (!audio) {
    audio = new Audio(entry.src);
    entry.pool.push(audio);
    if (entry.pool.length > 8) entry.pool.shift();
  }
  audio.currentTime = 0;
  audio.volume = volume;
  audio.loop = loop;
  audio.playbackRate = rate;
  audio.play().catch(() => {}); // autoplay policies etc — non-fatal
  return audio;
}

window.Assets = { loadAll, getImage, playSound, IMAGE_MANIFEST, SOUND_MANIFEST };
