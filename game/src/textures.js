// Procedural canvas textures: the yard's look comes from paint, not files.
// Asphalt with lane paint, corrugated container steel, hazard stripes and the
// big site letters. All generated at boot, no network, no image files.
import * as THREE from 'three';

function canvasTexture(width, height, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(ctx, width, height, count, alpha) {
  for (let i = 0; i < count; i += 1) {
    const v = Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgba(${v},${v},${v + 8},${alpha})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
  }
}

export function asphaltTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#48484e';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 2600, 0.25);
    // Faint expansion joints.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(w, i * 128); ctx.stroke();
    }
    // Worn tyre tracks.
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(120, 0, 26, h);
    ctx.fillRect(360, 0, 26, h);
  }, 7, 5);
}

export function containerTexture(base, rib) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x, 0, 5, h);
      ctx.fillStyle = rib;
      ctx.fillRect(x + 5, 0, 3, h);
    }
    // Rust streaks from the top edge.
    for (let i = 0; i < 26; i += 1) {
      const x = Math.random() * w;
      ctx.fillStyle = 'rgba(60,30,10,0.25)';
      ctx.fillRect(x, 0, 3 + Math.random() * 5, 20 + Math.random() * 70);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, w, 6);
    ctx.fillRect(0, h - 6, w, 6);
  });
}

export function hazardTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e8b31a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#17181c';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, h);
      ctx.closePath(); ctx.fill();
    }
  }, 4, 1);
}

export function siteTexture(letter, colour) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = colour;
    ctx.font = '900 150px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, w / 2, h / 2 + 8);
  });
}

export function crateTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#7a5c38';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.beginPath();
    ctx.moveTo(4, 4); ctx.lineTo(w - 4, h - 4);
    ctx.moveTo(w - 4, 4); ctx.lineTo(4, h - 4);
    ctx.stroke();
    speckle(ctx, w, h, 300, 0.2);
  });
}
