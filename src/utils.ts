// Safe UTF-8 (supports emoji/accents)
export function stringToBytes(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

export function bytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

export function toBits(bytes: number[]): number[] {
  const bits: number[] = [];
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }
  return bits;
}

export function fromBits(bits: number[], strict = false): number[] {
  if (strict && bits.length % 8 !== 0) {
    throw new Error(`fromBits: lunghezza non multipla di 8 (${bits.length})`);
  }
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    if (i + 8 > bits.length) break; // ignore any stray bits
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | (bits[i + k] & 1);
    out.push(b);
  }
  return out;
}

export function u32ToBits(n: number): number[] {
  const bits: number[] = [];
  for (let i = 31; i >= 0; i--) bits.push((n >>> i) & 1);
  return bits;
}

export function bitsToU32(bits: number[], start = 0): number {
  if (start + 32 > bits.length) {
    throw new Error(`bitsToU32: servono 32 bit da start=${start}, disponibili=${bits.length - start}`);
  }
  let n = 0;
  //for (let i = 0; i < 32; i++) n = (n << 1) | (bits[start + i] & 1);
  for (let i = 0; i < 32; i++) {
    const bit = bits[start + i];
    if (bit === undefined) break;
    const shifted = n << 1;
    const masked  = bit & 1;
    n = shifted | masked;
  }
  
  return n >>> 0;
}

export function posMod(a: number, m: number) {
  return ((a % m) + m) % m;
}

// Simple and deterministic PRNG for shuffling (mulberry32)
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makePermutation(n: number, seed?: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  if (seed == null) return arr;
  const rnd = mulberry32(seed >>> 0);
  // Fisher–Yates
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}