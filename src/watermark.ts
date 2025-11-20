import * as JimpNS from "jimp";
const Jimp: any = (JimpNS as any).Jimp ?? (JimpNS as any).default ?? (JimpNS as any);

import { PNG } from "pngjs";
import jpeg from "jpeg-js";

import { WatermarkOptions, WatermarkResult } from "./types";
import {
  stringToBytes,
  bytesToString,
  toBits,
  u32ToBits,
  makePermutation,
  posMod,
  fromBits,
  bitsToU32,
} from "./utils";
import { haarDWT, haarIDWT } from "./dwt";

function encodePngFromBitmap(img: any): Buffer {
  const { width, height, data } = img.bitmap; // RGBA
  const png = new PNG({ width, height });
  (png as any).data = Buffer.from(data);
  return PNG.sync.write(png);
}

function encodeJpegFromBitmap(img: any, quality = 90): Buffer {
  const { width, height, data } = img.bitmap; // RGBA
  return jpeg.encode({ data: Buffer.from(data), width, height }, quality).data;
}

function qimEncode(c: number, q: number, bit: 0 | 1): number {
  const base = Math.floor(c / q) * q;
  return bit === 1 ? base + 0.98 * q : base + 0.25 * q;
}
function qimDecode(c: number, q: number): 0 | 1 {
  const r = posMod(c, q);
  return r >= q / 2 ? 1 : 0;
}

function repeatBits(bits: number[], reps: number): number[] {
  if (reps <= 1) return bits.slice();
  const out: number[] = [];
  for (const b of bits) for (let r = 0; r < reps; r++) out.push(b & 1);
  return out;
}
function decodeRepeatedBits(bits: number[], reps: number): number[] {
  console.log("decodeRepeatedBits: bits.length", bits.length, "reps", reps);
  if (reps <= 1) return bits.slice();
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += reps) {
    let s = 0;
    for (let r = 0; r < reps && i + r < bits.length; r++) s += bits[i + r]!;
    out.push(s > reps / 2 ? 1 : 0);
  }
  return out;
}

async function readImageCompat(imageBuffer: Buffer): Promise<any> {
  try { return await Jimp.read({ data: imageBuffer, mime: "image/png" }); } catch {}
  try { return await Jimp.read({ data: imageBuffer, mime: "image/jpeg" }); } catch {}
  return await Jimp.read(imageBuffer);
}

function ensureEvenDimensions(img: any): { width: number; height: number } {
  let { width, height } = img.bitmap;
  const evenW = width & ~1;
  const evenH = height & ~1;
  if (evenW !== width || evenH !== height) {
    // @ts-ignore
    img.crop({ x: 0, y: 0, w: evenW, h: evenH });
    width = evenW;
    height = evenH;
  }
  return { width, height };
}

export async function addWatermark(
  imageBuffer: Buffer,
  watermarkText: string,
  options: WatermarkOptions = {}
): Promise<WatermarkResult> {
  const channel = options.channel ?? 0;
  const q = options.q ?? 12;
  const seed = options.seed ?? 1234;
  const reps = (options as any).reps ?? 3; // redundancy (3 recommended)
  const bands = (options as any).bands ?? "HL"; // "HL" | "HL+LH"

  const img = await readImageCompat(imageBuffer);
  const { width, height } = ensureEvenDimensions(img);

  // Extract target channel
  const mat: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      row.push(img.bitmap.data[idx + channel]!);
    }
    mat.push(row);
  }

  // DWT
  let [LL, HL, LH, HH] = haarDWT(mat);

  // Build payload: [header(32 bit = len bytes)] + [data]
  const wmBytes = stringToBytes(watermarkText);
  console.log("wmBytes", wmBytes);
  const wmBits = toBits(wmBytes);
  console.log("wmBits", wmBits);
  const header = u32ToBits(wmBytes.length >>> 0);

  const payloadNoRedundancy = header.concat(wmBits);
  const payload = repeatBits(payloadNoRedundancy, reps);

  const h = HL.length, w = HL[0]!.length;
  const capHL = h * w;
  const useBoth = bands === "HL+LH";
  const capacity = useBoth ? capHL * 2 : capHL;

  if (payload.length > capacity) {
    throw new Error(
      `Watermark troppo lungo: payload=${payload.length} bit, capacità HL=${capacity} bit (reps=${reps})`
    );
  }

  // Consistent permutation between embed/extract
  const order = makePermutation(capacity, seed);

  function locFromIdx(idx: number) {
    if (!useBoth) {
      const i = Math.floor(idx / w), j = idx % w;
      return { band: "HL" as const, i, j };
    } else {
      if (idx < capHL) {
        const i = Math.floor(idx / w), j = idx % w;
        return { band: "HL" as const, i, j };
      } else {
        const k = idx - capHL;
        const i = Math.floor(k / w), j = k % w;
        return { band: "LH" as const, i, j };
      }
    }
  }

  // QIM write
  for (let p = 0; p < payload.length; p++) {
    const idx = order[p]!;
    const { band, i, j } = locFromIdx(idx);
    const c = band === "HL" ? HL[i]![j]! : LH[i]![j]!;
    const bit = (payload[p]! as 0 | 1);
    const v = qimEncode(c, q, bit);
    if (band === "HL") HL[i]![j] = v; else LH[i]![j] = v;
  }

  // IDWT
  const newMat = haarIDWT(LL, HL, LH, HH);

  // Reinsert channel and clamp
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const v = Math.round(newMat[y]![x]!);
      img.bitmap.data[idx + channel] = Math.max(0, Math.min(255, v));
    }
  }

  const output = (options as any).output ?? "png";      // "png" | "jpeg"
  const jpegQuality = (options as any).jpegQuality ?? 95;

  const buffer: Buffer =
    output === "jpeg" ? encodeJpegFromBitmap(img, jpegQuality)
                      : encodePngFromBitmap(img);

  return { image: buffer };
}

export async function extractWatermark(
  imageBuffer: Buffer,
  options: WatermarkOptions = {}
): Promise<string> {
  const channel = options.channel ?? 0;
  const q = options.q ?? 12;
  const seed = options.seed ?? 1234;
  const reps = (options as any).reps ?? 3;
  const bands = (options as any).bands ?? "HL"; // "HL" | "HL+LH"

  const img = await readImageCompat(imageBuffer);
  const { width, height } = ensureEvenDimensions(img);

  // Extract channel
  const mat: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      row.push(img.bitmap.data[idx + channel]!);
    }
    mat.push(row);
  }

  // DWT → HL
  const [, HL, LH] = haarDWT(mat);
  const h = HL.length, w = HL[0]!.length;
  const capHL = h * w;
  const useBoth = bands === "HL+LH";
  const capacity = useBoth ? capHL * 2 : capHL;

  const order = makePermutation(capacity, seed);

  function locFromIdx(idx: number) {
    if (!useBoth) {
      const i = Math.floor(idx / w), j = idx % w;
      return { band: "HL" as const, i, j };
    } else {
      if (idx < capHL) {
        const i = Math.floor(idx / w), j = idx % w;
        return { band: "HL" as const, i, j };
      } else {
        const k = idx - capHL;
        const i = Math.floor(k / w), j = k % w;
        return { band: "LH" as const, i, j };
      }
    }
  }

  // 1) Read redundant header (32 * reps bit), then majority
  const headerRepBits: number[] = [];
  for (let p = 0; p < 32 * reps; p++) {
    const idx = order[p]!;
    const { band, i, j } = locFromIdx(idx);
    const c = band === "HL" ? HL[i]![j]! : LH[i]![j]!;
    headerRepBits.push(qimDecode(c, q));
  }
  const headerBits = decodeRepeatedBits(headerRepBits, reps);
  const byteLen = bitsToU32(headerBits, 0);

  // Calculate total bits to read (header+payload) (with redundancy)
  const totalRepBits = (32 + byteLen * 8) * reps;
  if (byteLen === 0 || totalRepBits > capacity) {
    throw new Error(
      `Lunghezza watermark non valida: ${byteLen} (capacità max ~ ${Math.floor((capacity / reps - 32) / 8)} byte con reps=${reps}): h,w: ${h},${w} capacity=${capacity}, totalRepBits: ${totalRepBits}, byteLen: ${byteLen}`
    );
  }
  console.log(`Lunghezza watermark: ${byteLen} (capacità max ~ ${Math.floor((capacity / reps - 32) / 8)} byte con reps=${reps}): h,w: ${h},${w} capacity=${capacity}, totalRepBits: ${totalRepBits}, byteLen: ${byteLen}`);

  // 2) Read redundant payload
  const payloadRepBits: number[] = headerRepBits.slice();
  for (let p = 32 * reps; p < totalRepBits; p++) {
    const idx = order[p]!;
    const { band, i, j } = locFromIdx(idx);
    const c = band === "HL" ? HL[i]![j]! : LH[i]![j]!;
    payloadRepBits.push(qimDecode(c, q));
  }

  // 3) Majority on all (header+data) → clean bits
  const payloadBits = decodeRepeatedBits(payloadRepBits, reps);

  // 4) Take exactly the data bits (after 32 header bits)
  const neededDataBits = byteLen * 8;
  const dataBits = payloadBits.slice(32, 32 + neededDataBits);

  // 5) Reconstruct bytes (strict) and string
  const bytes = fromBits(dataBits, true);
  if (bytes.length !== byteLen) {
    throw new Error(`Estrazione fallita: attesi ${byteLen} byte, ottenuti ${bytes.length}`);
  }
  return bytesToString(bytes);
}