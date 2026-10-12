/**
 * Standalone Icon Generator.
 * Generates valid RGBA PNG icons for 16, 32, 48, and 128 px using Node.js zlib.
 * No external dependencies required.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const iconsDir = path.resolve(__dirname, '../src/assets/icons');

// CRC32 Table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function createPng(size) {
  // Brand color #8356E4 -> R: 131, G: 86, B: 228
  const bgR = 131, bgG = 86, bgB = 228;

  // Scanline: 1 filter byte (0) + 4 bytes per pixel (RGBA)
  const rowSize = 1 + size * 4;
  const rawData = Buffer.alloc(rowSize * size);

  const radius = size * 0.22;
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None

    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Rounded rectangle test
      const dx = Math.abs(x - (size - 1) / 2);
      const dy = Math.abs(y - (size - 1) / 2);
      const halfW = (size - 2) / 2;
      const halfH = (size - 2) / 2;

      let inBox = false;
      if (dx <= halfW - radius && dy <= halfH) inBox = true;
      else if (dx <= halfW && dy <= halfH - radius) inBox = true;
      else {
        const cornerDx = dx - (halfW - radius);
        const cornerDy = dy - (halfH - radius);
        if (cornerDx * cornerDx + cornerDy * cornerDy <= radius * radius) {
          inBox = true;
        }
      }

      if (!inBox) {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
        continue;
      }

      // Check inner icon: person silhouette or 'L' mark
      // Head circle
      const headCx = cx;
      const headCy = size * 0.36;
      const headR = size * 0.16;
      const distHead = Math.hypot(x - headCx, y - headCy);

      // Body arc
      const bodyCy = size * 0.82;
      const bodyRx = size * 0.32;
      const bodyRy = size * 0.24;
      const normX = (x - headCx) / bodyRx;
      const normY = (y - bodyCy) / bodyRy;
      const distBody = normX * normX + normY * normY;

      let isWhite = false;
      if (distHead <= headR) {
        isWhite = true;
      } else if (distBody <= 1 && y >= size * 0.52 && y <= size * 0.78) {
        isWhite = true;
      }

      if (isWhite) {
        rawData[pxOffset] = 255;
        rawData[pxOffset + 1] = 255;
        rawData[pxOffset + 2] = 255;
        rawData[pxOffset + 3] = 255;
      } else {
        rawData[pxOffset] = bgR;
        rawData[pxOffset + 1] = bgG;
        rawData[pxOffset + 2] = bgB;
        rawData[pxOffset + 3] = 255;
      }
    }
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT (Deflated scanlines)
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 32, 48, 128].forEach((size) => {
  const pngBuf = createPng(size);
  const outFile = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outFile, pngBuf);
  console.log(`Generated ${outFile} (${size}x${size}, ${pngBuf.length} bytes)`);
});
