// 抠图：把 ZR 图标外围的纯黑背景变为透明，图标本身（含内部黑色）保持不变
// 无第三方依赖：自带 PNG 解码 / 编码
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || path.join(__dirname, '..', 'src-tauri', 'icons', '微信图片_20261008104554_15_49.png');
const OUT = process.argv[3] || path.join(__dirname, 'app-icon-cutout.png');
const T = Number(process.argv[4] || 48); // 亮度阈值：低于它的“背景”像素做透明渐隐

/* ---------------- PNG 解码 ---------------- */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported png bitDepth=${bitDepth} interlace=${interlace}`);
  const ch = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0;
  if (!ch) throw new Error('unsupported colorType ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    cur.set(raw.subarray(p, p + stride)); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = cur[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const s = x * ch;
      if (ch === 3) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = 255; }
      else if (ch === 4) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = cur[s + 3]; }
      else { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = ch === 2 ? cur[s + 1] : 255; }
    }
    prev.set(cur);
  }
  return { w, h, data: out };
}

/* ---------------- 抠图 ---------------- */
const { w, h, data } = decodePNG(fs.readFileSync(SRC));
const N = w * h;
const lum = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const o = i * 4;
  // 感知亮度（整数近似），用来区分“近黑背景”与图标内容
  lum[i] = (data[o] * 77 + data[o + 1] * 151 + data[o + 2] * 28) >> 8;
}

// 从四周边界做 4 邻域泛洪，只吃掉与外界连通的暗像素（内部黑色被亮线包围，不会被吃掉）
const isBg = new Uint8Array(N);
const stack = new Int32Array(N);
let sp = 0;
const push = (idx) => { if (!isBg[idx] && lum[idx] <= T) { isBg[idx] = 1; stack[sp++] = idx; } };
for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
while (sp > 0) {
  const idx = stack[--sp];
  const x = idx % w, y = (idx - x) / w;
  if (x > 0) push(idx - 1);
  if (x < w - 1) push(idx + 1);
  if (y > 0) push(idx - w);
  if (y < h - 1) push(idx + w);
}

// 背景像素按亮度做透明渐隐：越黑越透明，接近阈值处与图标自然衔接，避免硬边
let bgCount = 0;
for (let i = 0; i < N; i++) {
  if (isBg[i]) {
    bgCount++;
    data[i * 4 + 3] = Math.round(Math.min(1, lum[i] / T) * 255);
  }
}

/* ---------------- PNG 编码 ---------------- */
function crc32(b) {
  let crc = 0xffffffff;
  for (let n = 0; n < b.length; n++) {
    crc ^= b[n];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, d) {
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length, 0);
  const t = Buffer.from(type, 'ascii');
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([t, d])), 0);
  return Buffer.concat([len, t, d, cb]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8; ihdr[9] = 6;
const stride = w * 4;
const rawOut = Buffer.alloc((stride + 1) * h);
for (let y = 0; y < h; y++) {
  rawOut[y * (stride + 1)] = 0;
  Buffer.from(data.buffer, y * stride, stride).copy(rawOut, y * (stride + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(rawOut, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync(OUT, png);
console.log(`src=${w}x${h} T=${T} bg=${(bgCount / N * 100).toFixed(1)}% -> ${OUT} (${png.length} bytes)`);
