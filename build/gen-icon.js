#!/usr/bin/env node
/**
 * Generates the Neon Flappy app icon (512×512) using the Canvas API,
 * then creates all required sizes for macOS .iconset,
 * and calls iconutil to produce icon.icns.
 * Also creates icon.ico for Windows via a RIFF/BMP approach.
 *
 * Run from inside neon-flappy/: node build/gen-icon.js
 */

const { createCanvas } = require("canvas");
const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Draw the 512×512 icon canvas ──────────────────────────────
function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext("2d");
  const s      = size / 512; // scale factor

  // Background gradient (dark purple)
  const bg = ctx.createRadialGradient(size * 0.5, size * 0.35, size * 0.05,
                                       size * 0.5, size * 0.5,  size * 0.72);
  bg.addColorStop(0,   "#2a1060");
  bg.addColorStop(0.6, "#130833");
  bg.addColorStop(1,   "#0a0118");

  // Rounded-rect clip for iOS-style icon
  const r = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.clip();

  // Stars
  for (let i = 0; i < 36; i++) {
    const sx = (Math.sin(i * 137.5) * 0.5 + 0.5) * size;
    const sy = (Math.cos(i * 97.3)  * 0.5 + 0.5) * size;
    const sr = (0.6 + (i % 3) * 0.7) * s;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 4) * 0.15})`;
    ctx.fill();
  }

  // ── Pipes (two pairs) ──────────────────────────────────────
  function drawPipe(x, topH, gapH) {
    const pw = 58 * s;
    const px = x - pw / 2;
    const capH = 18 * s, capOvr = 6 * s;

    ctx.shadowColor = "#ff2d9b";
    ctx.shadowBlur  = 18 * s;

    // Top pipe body
    const tg = ctx.createLinearGradient(px, 0, px + pw, 0);
    tg.addColorStop(0,   "#7a0040");
    tg.addColorStop(0.4, "#cc1066");
    tg.addColorStop(0.6, "#ff2d9b");
    tg.addColorStop(1,   "#7a0040");
    ctx.fillStyle = tg;
    ctx.fillRect(px, 0, pw, topH);

    // Top cap
    ctx.fillRect(px - capOvr, topH - capH, pw + capOvr * 2, capH);

    // Bottom pipe body
    const botY = topH + gapH;
    ctx.fillStyle = tg;
    ctx.fillRect(px, botY, pw, size - botY);

    // Bottom cap
    ctx.fillRect(px - capOvr, botY, pw + capOvr * 2, capH);

    ctx.shadowBlur = 0;
  }

  drawPipe(160 * s, 120 * s, 130 * s);
  drawPipe(370 * s, 200 * s, 130 * s);

  // ── Bird (glowing cyan oval) ───────────────────────────────
  const bx = 256 * s, by = 268 * s;
  const bw = 52 * s, bh = 36 * s;

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(-0.18); // slight upward tilt

  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur  = 36 * s;

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2);
  const bodyGrad = ctx.createRadialGradient(
    -bw * 0.2, -bh * 0.3, 1,
     bw * 0.1,  bh * 0.1, bw
  );
  bodyGrad.addColorStop(0,   "#a0ffff");
  bodyGrad.addColorStop(0.4, "#00f0ff");
  bodyGrad.addColorStop(1,   "#007899");
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Wing
  ctx.strokeStyle = "rgba(0,240,255,0.55)";
  ctx.lineWidth   = 3 * s;
  ctx.beginPath();
  ctx.ellipse(-bw * 0.1, bh * 0.35, bw * 0.55, bh * 0.42, 0.2, 0, Math.PI * 2);
  ctx.stroke();

  // Eye
  ctx.shadowBlur = 0;
  ctx.fillStyle  = "#fff";
  ctx.beginPath();
  ctx.arc(bw * 0.46, -bh * 0.22, 7 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0118";
  ctx.beginPath();
  ctx.arc(bw * 0.52, -bh * 0.22, 4 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // ── Title text ─────────────────────────────────────────────
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur  = 22 * s;
  ctx.fillStyle   = "#00f0ff";
  ctx.font        = `900 ${52 * s}px "Segoe UI", Roboto, system-ui, sans-serif`;
  ctx.textAlign   = "center";
  ctx.fillText("NEON FLAPPY", size / 2, 460 * s);
  ctx.shadowBlur  = 0;

  return canvas;
}

// ── Write PNG ─────────────────────────────────────────────────
const buildDir  = path.join(__dirname);

const canvas512 = drawIcon(512);
const png512    = canvas512.toBuffer("image/png");
fs.writeFileSync(path.join(buildDir, "icon.png"), png512);
console.log("✅ icon.png (512×512) written");

// ── macOS iconset ─────────────────────────────────────────────
const iconsetDir = path.join(buildDir, "icon.iconset");
if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir);

const macSizes = [16, 32, 64, 128, 256, 512];
for (const sz of macSizes) {
  const buf = drawIcon(sz).toBuffer("image/png");
  fs.writeFileSync(path.join(iconsetDir, `icon_${sz}x${sz}.png`), buf);
  if (sz <= 256) {
    fs.writeFileSync(path.join(iconsetDir, `icon_${sz}x${sz}@2x.png`),
                     drawIcon(sz * 2).toBuffer("image/png"));
  }
}
console.log("✅ icon.iconset populated");

// Convert to .icns using macOS iconutil
try {
  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(buildDir, "icon.icns")}"`, { stdio: "inherit" });
  console.log("✅ icon.icns created");
} catch (e) {
  console.warn("⚠️  iconutil failed (non-mac or missing). icon.icns skipped.");
}

// ── Windows .ico ─────────────────────────────────────────────
// Write 16/32/48/256 PNGs and pack into an ICO with a tiny DIY writer
const icoSizes  = [16, 32, 48, 256];
const pngBuffers = icoSizes.map(sz => drawIcon(sz).toBuffer("image/png"));

// ICO format: ICONDIR + ICONDIRENTRYs + image data
const ICONDIR_SIZE  = 6;
const ENTRY_SIZE    = 16;
const headerSize    = ICONDIR_SIZE + ENTRY_SIZE * icoSizes.length;

let imageOffset = headerSize;
const offsets   = [];
pngBuffers.forEach(buf => { offsets.push(imageOffset); imageOffset += buf.length; });

const icoBuffer = Buffer.alloc(imageOffset);
// ICONDIR
icoBuffer.writeUInt16LE(0,               0); // reserved
icoBuffer.writeUInt16LE(1,               2); // type: 1 = ICO
icoBuffer.writeUInt16LE(icoSizes.length, 4); // count

icoSizes.forEach((sz, i) => {
  const base = ICONDIR_SIZE + i * ENTRY_SIZE;
  icoBuffer.writeUInt8 (sz >= 256 ? 0 : sz, base + 0); // width  (0 = 256)
  icoBuffer.writeUInt8 (sz >= 256 ? 0 : sz, base + 1); // height
  icoBuffer.writeUInt8 (0,                  base + 2); // color count
  icoBuffer.writeUInt8 (0,                  base + 3); // reserved
  icoBuffer.writeUInt16LE(1,                base + 4); // planes
  icoBuffer.writeUInt16LE(32,               base + 6); // bpp
  icoBuffer.writeUInt32LE(pngBuffers[i].length, base + 8);  // size
  icoBuffer.writeUInt32LE(offsets[i],            base + 12); // offset
});

pngBuffers.forEach((buf, i) => buf.copy(icoBuffer, offsets[i]));
fs.writeFileSync(path.join(buildDir, "icon.ico"), icoBuffer);
console.log("✅ icon.ico created");
