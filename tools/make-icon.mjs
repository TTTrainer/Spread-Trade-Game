// Draws the app icon from a pixel map (original art) and writes build/icon.png and build/icon.ico.
// No image libraries: PNG is encoded by hand with zlib; the ICO wraps PNG images (Windows Vista+).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const MAP = [
  '................',
  '..############..',
  '.#............#.',
  '.#..........Mm#.',
  '.#.........M..#.',
  '.#..c.....M...#.',
  '.#..cc...M....#.',
  '.#..c.c.M.....#.',
  '.#..c..M......#.',
  '.#..c.........#.',
  '.#..ccccccccc.#.',
  '.#............#.',
  '.#.aaaaa.ggggg#.',
  '.#............#.',
  '..############..',
  '................',
];
const COLORS = {
  '.': [11, 8, 32, 255],
  '#': [91, 75, 196, 255],
  c: [62, 242, 255, 255],
  M: [255, 62, 165, 255],
  m: [255, 191, 62, 255],
  a: [255, 79, 109, 255],
  g: [77, 255, 154, 255],
};

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const scale = size / 16;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const ch = MAP[Math.floor(y / scale)][Math.floor(x / scale)];
      const [r, g, b, a] = COLORS[ch] ?? COLORS['.'];
      // Scanline shading for the CRT look.
      const dim = size >= 64 && Math.floor(y / (scale / 4)) % 4 === 3 ? 0.82 : 1;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(r * dim);
      raw[o + 1] = Math.round(g * dim);
      raw[o + 2] = Math.round(b * dim);
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir[o] = size >= 256 ? 0 : size;
    dir[o + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

mkdirSync('build', { recursive: true });
const sizes = [16, 32, 48, 64, 128, 256];
const images = sizes.map((size) => ({ size, data: png(size) }));
writeFileSync('build/icon.png', png(512));
writeFileSync('build/icon.ico', ico(images));
console.log('wrote build/icon.png and build/icon.ico');
