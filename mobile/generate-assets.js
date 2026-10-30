const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  let c = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 1);
  }
  return (c ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(width, height, colorFn) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const rawScanlines = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = colorFn(x, y, width, height);
      const idx = 1 + x * 4;
      row[idx] = r;
      row[idx + 1] = g;
      row[idx + 2] = b;
      row[idx + 3] = a;
    }
    rawScanlines.push(row);
  }

  const idatData = zlib.deflateSync(Buffer.concat(rawScanlines));
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function generateWav(durationSec = 0.5, freq = 880) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // subchunk1 size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(1, 22);  // 1 channel
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);  // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const data = Buffer.alloc(dataSize);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * Math.exp(-3 * t);
    const intSample = Math.floor(sample * 32767);
    data.writeInt16LE(intSample, i * 2);
  }

  return Buffer.concat([header, data]);
}

const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

// 1. App Icon: 512x512 deep blue with medical cross/shield styling
const iconBuffer = createPng(512, 512, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const dist = Math.hypot(x - cx, y - cy);
  // Rounded background
  const inCrossH = (y >= cy - 40 && y <= cy + 40 && x >= cx - 120 && x <= cx + 120);
  const inCrossV = (x >= cx - 40 && x <= cx + 40 && y >= cy - 120 && y <= cy + 120);
  if (inCrossH || inCrossV) {
    return [37, 99, 235, 255]; // Medical Blue #2563EB
  }
  if (dist < 230) {
    return [15, 23, 42, 255]; // Deep Slate #0F172A
  }
  return [15, 23, 42, 255];
});
fs.writeFileSync(path.join(assetsDir, 'icon.png'), iconBuffer);
console.log('✓ Created assets/icon.png (512x512)');

// 2. Adaptive Icon: 512x512 foreground
const adaptiveBuffer = createPng(512, 512, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const inCrossH = (y >= cy - 35 && y <= cy + 35 && x >= cx - 100 && x <= cx + 100);
  const inCrossV = (x >= cx - 35 && x <= cx + 35 && y >= cy - 100 && y <= cy + 100);
  if (inCrossH || inCrossV) {
    return [37, 99, 235, 255];
  }
  return [15, 23, 42, 255];
});
fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.png'), adaptiveBuffer);
console.log('✓ Created assets/adaptive-icon.png (512x512)');

// 3. Splash: 1024x1024 deep dark background with centered emblem
const splashBuffer = createPng(1024, 1024, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const inCrossH = (y >= cy - 30 && y <= cy + 30 && x >= cx - 90 && x <= cx + 90);
  const inCrossV = (x >= cx - 30 && x <= cx + 30 && y >= cy - 90 && y <= cy + 90);
  if (inCrossH || inCrossV) {
    return [37, 99, 235, 255];
  }
  return [15, 23, 42, 255];
});
fs.writeFileSync(path.join(assetsDir, 'splash.png'), splashBuffer);
console.log('✓ Created assets/splash.png (1024x1024)');

// 4. Notification icon: 96x96 monochrome silhouette
const notifBuffer = createPng(96, 96, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const inCrossH = (y >= cy - 8 && y <= cy + 8 && x >= cx - 28 && x <= cx + 28);
  const inCrossV = (x >= cx - 8 && x <= cx + 8 && y >= cy - 28 && y <= cy + 28);
  if (inCrossH || inCrossV) {
    return [255, 255, 255, 255]; // White monochrome silhouette
  }
  return [0, 0, 0, 0]; // Transparent background required for Android notifications
});
fs.writeFileSync(path.join(assetsDir, 'notification-icon.png'), notifBuffer);
console.log('✓ Created assets/notification-icon.png (96x96)');

// 5. Alarm Chime sound
const wavBuffer = generateWav(1.0, 784); // G5 note chime
fs.writeFileSync(path.join(assetsDir, 'alarm_chime.wav'), wavBuffer);
console.log('✓ Created assets/alarm_chime.wav (1.0s chime)');
