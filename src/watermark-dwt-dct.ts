// watermark_dwt_dct.ts
import * as JimpNS from "jimp";
const Jimp: any = (JimpNS as any).Jimp ?? (JimpNS as any).default ?? (JimpNS as any);

import { PNG } from "pngjs";
import type { WatermarkOptions, WatermarkResult } from "./types";
import {
  stringToBytes, bytesToString, toBits, u32ToBits,
  makePermutation, posMod, fromBits, bitsToU32
} from "./utils";
import { haarDWT, haarIDWT } from "./dwt";

/* ---------- Export helpers (come nella tua impl principale) ---------- */
function encodePngFromBitmap(img: any): Buffer {
  const { width, height, data } = img.bitmap;
  const png = new PNG({ width, height });
  (png as any).data = Buffer.from(data);
  return PNG.sync.write(png);
}
async function encodeJpegFromBitmap(img: any, quality = 90): Promise<Buffer> {
  const { default: jpeg } = await import("jpeg-js");
  const { width, height, data } = img.bitmap;
  return jpeg.encode({ data: Buffer.from(data), width, height }, quality).data;
}
async function readImageCompat(imageBuffer: Buffer): Promise<any> {
  try { return await Jimp.read({ data: imageBuffer, mime: "image/png" }); } catch {}
  try { return await Jimp.read({ data: imageBuffer, mime: "image/jpeg" }); } catch {}
  return await Jimp.read(imageBuffer);
}
function ensureEvenDimensions(img: any) {
  const evenW = img.bitmap.width & ~1;
  const evenH = img.bitmap.height & ~1;
  if (evenW !== img.bitmap.width || evenH !== img.bitmap.height) {
    // @ts-ignore
    img.crop({ x: 0, y: 0, w: evenW, h: evenH });
  }
  return { width: img.bitmap.width, height: img.bitmap.height };
}

/* ------------------------- QIM (magnitudine) ------------------------- */
function qimEncodeMag(c: number, q: number, bit: 0 | 1): number {
  const s = c < 0 ? -1 : 1;
  const a = Math.abs(c);
  const base = Math.floor(a / q) * q;
  const tgt = bit === 1 ? base + 0.75 * q : base + 0.25 * q;
  return s * tgt;
}
function qimDecodeMag(c: number, q: number): 0 | 1 {
  const a = Math.abs(c);
  const r = posMod(a, q); // [0, q)
  return r >= q / 2 ? 1 : 0;
}

/* -------------------------- Repetition coding ------------------------ */
function repeatBits(bits: number[], reps: number): number[] {
  if (reps <= 1) return bits.slice();
  const out: number[] = [];
  for (const b of bits) for (let r = 0; r < reps; r++) out.push(b & 1);
  return out;
}
function decodeRepeatedBits(bits: number[], reps: number): number[] {
  if (reps <= 1) return bits.slice();
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += reps) {
    let s = 0;
    for (let r = 0; r < reps && i + r < bits.length; r++) s += bits[i + r]!;
    out.push(s > reps / 2 ? 1 : 0);
  }
  return out;
}

/* --------------------------- DCT 8×8 tables -------------------------- */
const N = 8;
const ALPHA = new Array(N).fill(0).map((_, u) => (u === 0 ? 1 / Math.SQRT2 : 1));
const COS_XU = Array.from({ length: N }, (_, x) =>
  Array.from({ length: N }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)))
);
const COS_YV = COS_XU; // same shape

function dct2_8x8(block: number[][]): number[][] {
  const F = Array.from({ length: N }, () => Array(N).fill(0));
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) {
        const cxu = COS_XU[x][u];
        for (let y = 0; y < N; y++) {
          sum += block[x][y] * cxu * COS_YV[y][v];
        }
      }
      F[u][v] = 0.25 * ALPHA[u] * ALPHA[v] * sum;
    }
  }
  return F;
}
function idct2_8x8(F: number[][]): number[][] {
  const f = Array.from({ length: N }, () => Array(N).fill(0));
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      let sum = 0;
      for (let u = 0; u < N; u++) {
        const cu = ALPHA[u];
        const cxu = COS_XU[x][u];
        for (let v = 0; v < N; v++) {
          sum += cu * ALPHA[v] * F[u][v] * cxu * COS_YV[y][v];
        }
      }
      f[x][y] = 0.25 * sum;
    }
  }
  return f;
}

/* -------------------------- Block utilities -------------------------- */
type BandName = "HL" | "LH";
function splitBlocks8(band: number[][]) {
  const H = band.length, W = band[0]!.length;
  const H8 = (H / 8) | 0, W8 = (W / 8) | 0; // num blocks
  const usedH = H8 * 8, usedW = W8 * 8;
  return { H, W, H8, W8, usedH, usedW };
}
function getBlock(band: number[][], bi: number, bj: number): number[][] {
  const block = Array.from({ length: N }, () => Array(N).fill(0));
  const x0 = bi * 8, y0 = bj * 8;
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) block[x][y] = band[x0 + x]![y0 + y]!;
  return block;
}
function setBlock(band: number[][], bi: number, bj: number, block: number[][]) {
  const x0 = bi * 8, y0 = bj * 8;
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) band[x0 + x]![y0 + y] = block[x][y]!;
}

/* ---------------------- Indice → (banda, blocco) --------------------- */
function makeLocatorBlocks(HL: number[][], LH: number[][] | null, useBoth: boolean) {
  const { H8, W8 } = splitBlocks8(HL);
  const capBlocksHL = H8 * W8; // 1 bit/block
  return function loc(idx: number): { band: BandName; bi: number; bj: number } {
    if (!useBoth || !LH) {
      const bi = Math.floor(idx / W8), bj = idx % W8;
      return { band: "HL", bi, bj };
    } else {
      if (idx < capBlocksHL) {
        const bi = Math.floor(idx / W8), bj = idx % W8;
        return { band: "HL", bi, bj };
      } else {
        const k = idx - capBlocksHL;
        const { H8: H8L, W8: W8L } = splitBlocks8(LH);
        const bi = Math.floor(k / W8L), bj = k % W8L;
        return { band: "LH", bi, bj };
      }
    }
  };
}

/* ============================== EMBED ================================= */
export async function addWatermark(
  imageBuffer: Buffer,
  watermarkText: string,
  options: WatermarkOptions = {}
): Promise<WatermarkResult> {
  const channel = options.channel ?? 0;
  const q = options.q ?? 18;                  // DCT lavora bene anche con q un filo più alto
  const seed = options.seed ?? 1234;
  const reps = (options as any).reps ?? 5;
  const bands = (options as any).bands ?? "HL";      // "HL" | "HL+LH"
  const output = (options as any).output ?? "png";   // "png" | "jpeg"
  const jpegQuality = (options as any).jpegQuality ?? 92;
  const blockSize = (options as any).blockSize ?? 8; // tenuto a 8
  const dctUV = (options as any).dctUV ?? { u: 2, v: 3 }; // mid-frequency

  if (blockSize !== 8) throw new Error("This reference impl supports blockSize=8 only.");

  const img = await readImageCompat(imageBuffer);
  const { width, height } = ensureEvenDimensions(img);

  // Estrai canale
  const mat: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      row.push(img.bitmap.data[idx + channel]!);
    }
    mat.push(row);
  }

  // 1-level DWT
  let [LL, HL, LH, HH] = haarDWT(mat);

  // Capacità = #blocchi (HL) [+ #blocchi (LH) se bands=HL+LH)] * 1 bit/block
  const { H8: H8_HL, W8: W8_HL, usedH: usedH_HL, usedW: usedW_HL } = splitBlocks8(HL);
  const capBlocksHL = H8_HL * W8_HL;

  const useBoth = bands === "HL+LH";
  let capBlocksTotal = capBlocksHL;
  let H8_LH = 0, W8_LH = 0, usedH_LH = 0, usedW_LH = 0;
  if (useBoth) {
    const s = splitBlocks8(LH);
    H8_LH = s.H8; W8_LH = s.W8; usedH_LH = s.usedH; usedW_LH = s.usedW;
    capBlocksTotal += H8_LH * W8_LH;
  }

  // Payload
  const wmBytes = stringToBytes(watermarkText);
  const wmBits = toBits(wmBytes);
  const header = u32ToBits(wmBytes.length >>> 0);
  const payload = repeatBits(header.concat(wmBits), reps);

  if (payload.length > capBlocksTotal) {
    throw new Error(`Payload troppo lungo: ${payload.length} bit > capacità ${capBlocksTotal} bit (1 bit per blocco, bands=${bands}).`);
  }

  // Ordine casuale dei blocchi
  const order = makePermutation(capBlocksTotal, seed);
  const locate = makeLocatorBlocks(HL, useBoth ? LH : null, useBoth);

  // EMBED: visita i primi payload.length blocchi nell'ordine
  for (let p = 0; p < payload.length; p++) {
    const { band, bi, bj } = locate(order[p]!);
    if (band === "HL") {
      if (bi >= H8_HL || bj >= W8_HL) continue;
      const B = getBlock(HL, bi, bj);
      const F = dct2_8x8(B);
      const bit = payload[p] as 0 | 1;
      F[dctUV.u][dctUV.v] = qimEncodeMag(F[dctUV.u][dctUV.v], q, bit);
      const bNew = idct2_8x8(F);
      setBlock(HL, bi, bj, bNew);
    } else {
      if (bi >= H8_LH || bj >= W8_LH) continue;
      const B = getBlock(LH, bi, bj);
      const F = dct2_8x8(B);
      const bit = payload[p] as 0 | 1;
      F[dctUV.u][dctUV.v] = qimEncodeMag(F[dctUV.u][dctUV.v], q, bit);
      const bNew = idct2_8x8(F);
      setBlock(LH, bi, bj, bNew);
    }
  }

  // IDWT
  const newMat = haarIDWT(LL, HL, LH, HH);

  // Scrivi canale e clamp
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const v = Math.round(newMat[y]![x]!);
      img.bitmap.data[idx + channel] = Math.max(0, Math.min(255, v));
    }
  }

  // Export
  const buffer = (options as any).output === "jpeg"
    ? await encodeJpegFromBitmap(img, jpegQuality)
    : encodePngFromBitmap(img);

  return { image: buffer };
}

/* ============================== EXTRACT =============================== */
export async function extractWatermark(
  imageBuffer: Buffer,
  options: WatermarkOptions = {}
): Promise<string> {
  const channel = options.channel ?? 0;
  const q = options.q ?? 18;
  const seed = options.seed ?? 1234;
  const reps = (options as any).reps ?? 5;
  const bands = (options as any).bands ?? "HL";     // "HL" | "HL+LH"
  const dctUV = (options as any).dctUV ?? { u: 2, v: 3 };

  const img = await readImageCompat(imageBuffer);
  const { width, height } = ensureEvenDimensions(img);

  // Estrai canale
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
  const [, HL, LH] = haarDWT(mat);

  // Capacità (blocchi)
  const { H8: H8_HL, W8: W8_HL } = splitBlocks8(HL);
  const capBlocksHL = H8_HL * W8_HL;
  const useBoth = bands === "HL+LH";

  let capBlocksTotal = capBlocksHL;
  let H8_LH = 0, W8_LH = 0;
  if (useBoth) {
    const s = splitBlocks8(LH);
    H8_LH = s.H8; W8_LH = s.W8;
    capBlocksTotal += H8_LH * W8_LH;
  }

  const order = makePermutation(capBlocksTotal, seed);
  const locate = makeLocatorBlocks(HL, useBoth ? LH : null, useBoth);

  // Leggi header ridondato: 32*reps blocchi
  const headerRepBits: number[] = [];
  for (let p = 0; p < 32 * reps; p++) {
    const { band, bi, bj } = locate(order[p]!);
    let coeff: number;
    if (band === "HL") {
      if (bi >= H8_HL || bj >= W8_HL) { headerRepBits.push(0); continue; }
      const F = dct2_8x8(getBlock(HL, bi, bj));
      coeff = F[dctUV.u][dctUV.v];
    } else {
      if (bi >= H8_LH || bj >= W8_LH) { headerRepBits.push(0); continue; }
      const F = dct2_8x8(getBlock(LH, bi, bj));
      coeff = F[dctUV.u][dctUV.v];
    }
    headerRepBits.push(qimDecodeMag(coeff, q));
  }
  const headerBits = decodeRepeatedBits(headerRepBits, reps);
  const byteLen = bitsToU32(headerBits, 0);

  const totalRepBits = (32 + byteLen * 8) * reps;
  if (byteLen === 0 || totalRepBits > capBlocksTotal) {
    throw new Error(
      `Lunghezza watermark non valida: ${byteLen} (cap blocchi=${capBlocksTotal}, reps=${reps}, bands=${bands})`
    );
  }

  // Leggi tutto header+payload ridondato
  const payloadRepBits: number[] = [];
  for (let p = 0; p < totalRepBits; p++) {
    const { band, bi, bj } = locate(order[p]!);
    let coeff: number;
    if (band === "HL") {
      if (bi >= H8_HL || bj >= W8_HL) { payloadRepBits.push(0); continue; }
      const F = dct2_8x8(getBlock(HL, bi, bj));
      coeff = F[dctUV.u][dctUV.v];
    } else {
      if (bi >= H8_LH || bj >= W8_LH) { payloadRepBits.push(0); continue; }
      const F = dct2_8x8(getBlock(LH, bi, bj));
      coeff = F[dctUV.u][dctUV.v];
    }
    payloadRepBits.push(qimDecodeMag(coeff, q));
  }

  const payloadBits = decodeRepeatedBits(payloadRepBits, reps);
  const neededDataBits = byteLen * 8;
  const dataBits = payloadBits.slice(32, 32 + neededDataBits);

  const bytes = fromBits(dataBits, true);
  if (bytes.length !== byteLen) throw new Error(`Estrazione fallita: attesi ${byteLen} byte, ottenuti ${bytes.length}`);
  return bytesToString(bytes);
}
