import {Buffer} from 'node:buffer';
import {inflateSync} from 'node:zlib';
import {decode, encode, convertIndexedToRgb, hasPngSignature} from 'fast-png';
import {decode as decodeJpeg} from 'jpeg-js';
import {LOGO_MAX_BYTES, LOGO_MAX_SIDE} from '@bienvu/contracts';
import {RequestFailure} from './http';

function dimensions(width: number, height: number) {
  if (width < 16 || height < 16 || width > LOGO_MAX_SIDE || height > LOGO_MAX_SIDE) throw new Error('DIMENSIONS');
}
const crcTable = Array.from({length: 256}, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function safePng(input: Buffer) {
  if (input.length < 33 || input.toString('ascii', 12, 16) !== 'IHDR' || input.readUInt32BE(8) !== 13) throw new Error('HEADER');
  const width = input.readUInt32BE(16), height = input.readUInt32BE(20);
  dimensions(width, height);
  const chunks: Buffer[] = [input.subarray(0, 8)], compressed: Buffer[] = [];
  const seen = new Set<string>();
  let ended = false;
  for (let offset = 8; offset < input.length;) {
    if (offset + 12 > input.length) throw new Error('TRUNCATED');
    const size = input.readUInt32BE(offset), end = offset + size + 12;
    if (end > input.length) throw new Error('TRUNCATED');
    const kind = input.toString('ascii', offset + 4, offset + 8);
    if (crc32(input.subarray(offset + 4, end - 4)) !== input.readUInt32BE(end - 4)) throw new Error('CRC');
    if (['acTL', 'fcTL', 'fdAT'].includes(kind)) throw new Error('ANIMATED');
    if (['IHDR', 'PLTE', 'tRNS', 'IEND'].includes(kind) && seen.has(kind)) throw new Error('DUPLICATE_CHUNK');
    seen.add(kind);
    if (['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(kind)) chunks.push(input.subarray(offset, end));
    else if (!(kind.charCodeAt(0) & 32)) throw new Error('UNKNOWN_CRITICAL_CHUNK');
    if (kind === 'IDAT') compressed.push(input.subarray(offset + 8, end - 4));
    if (kind === 'IEND') {if (end !== input.length || size !== 0) throw new Error('TRAILING_DATA'); ended = true;}
    offset = end;
  }
  if (!ended || !compressed.length) throw new Error('INCOMPLETE');
  const channels = ({0: 1, 2: 3, 3: 1, 4: 2, 6: 4} as Record<number, number>)[input[25]];
  const depth = input[24];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth) || input[28] > 1) throw new Error('FORMAT');
  if ([2, 4, 6].includes(input[25]) && depth < 8 || input[25] === 3 && depth === 16) throw new Error('DEPTH');
  const passes = input[28] === 0 ? [[0, 0, 1, 1]] : [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
  const expected = passes.reduce((total, [x,y,dx,dy]) => {
    const w = Math.max(0, Math.ceil((width - x) / dx)), h = Math.max(0, Math.ceil((height - y) / dy));
    return total + (w && h ? (Math.ceil(w * channels * depth / 8) + 1) * h : 0);
  }, 0);
  // Borne l'inflation AVANT le décodeur JS ; les chunks compressés de métadonnées
  // sont supprimés, ainsi que texte, profil ICC et tout contenu annexe.
  if (inflateSync(Buffer.concat(compressed), {maxOutputLength: expected}).length !== expected) throw new Error('PIXEL_DATA');
  const decoded = decode(Buffer.concat(chunks), {checkCrc: true});
  let data = decoded.palette ? convertIndexedToRgb(decoded) : decoded.data;
  if (!decoded.palette && decoded.depth < 8) {
    const unpacked = new Uint8Array(width * height), stride = Math.ceil(width * decoded.depth / 8);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
      unpacked[y * width + x] = (data[y * stride + Math.floor(x * decoded.depth / 8)] >>> (8 - decoded.depth - x * decoded.depth % 8)) & (2 ** decoded.depth - 1);
    data = unpacked;
  }
  const count = decoded.palette ? decoded.palette[0].length : decoded.channels;
  const depthMax = decoded.palette ? 255 : 2 ** decoded.depth - 1;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const index = i * count, out = i * 4;
    for (let c = 0; c < 3; c++) rgba[out + c] = Math.round(data[index + (count <= 2 ? 0 : c)] * 255 / depthMax);
    rgba[out + 3] = count === 2 || count === 4 ? Math.round(data[index + count - 1] * 255 / depthMax) : 255;
    if (decoded.transparency?.length && Array.from(decoded.transparency).every((value, c) => value === data[index + c])) rgba[out + 3] = 0;
  }
  return {width, height, data: rgba};
}

function safeJpeg(input: Buffer) {
  if (input[0] !== 255 || input[1] !== 216 || input.at(-2) !== 255 || input.at(-1) !== 217) throw new Error('JPEG');
  let found = false;
  for (let offset = 2; offset + 4 <= input.length;) {
    if (input[offset++] !== 255) throw new Error('JPEG_MARKER');
    while (input[offset] === 255) offset++;
    const marker = input[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    const size = input.readUInt16BE(offset);
    if (size < 2 || offset + size > input.length) throw new Error('JPEG_LENGTH');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      dimensions(input.readUInt16BE(offset + 5), input.readUInt16BE(offset + 3));
      if (found) throw new Error('MULTIPLE_FRAMES');
      found = true;
    }
    offset += size;
  }
  if (!found) throw new Error('JPEG_FRAME');
  return decodeJpeg(input, {useTArray: true, formatAsRGBA: true, tolerantDecoding: false,
    maxResolutionInMP: 1.05, maxMemoryUsageInMB: 32});
}

export async function normalizeLogo(bytes: Uint8Array, mime: string) {
  if (bytes.length > LOGO_MAX_BYTES) throw new RequestFailure('FILE_TOO_LARGE');
  try {
    const input = Buffer.from(bytes);
    const raster = mime === 'image/png' && hasPngSignature(input) ? safePng(input)
      : mime === 'image/jpeg' ? safeJpeg(input) : null;
    if (!raster) throw new Error('UNSUPPORTED');
    dimensions(raster.width, raster.height);
    const png = encode({width: raster.width, height: raster.height, data: raster.data, depth: 8, channels: 4}, {zlib: {level: 6}});
    if (png.length > LOGO_MAX_BYTES) throw new Error('OUTPUT_LIMIT');
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(png));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return {bytes: png, hash, width: raster.width, height: raster.height};
  } catch {throw new RequestFailure('INVALID_LOGO');}
}
