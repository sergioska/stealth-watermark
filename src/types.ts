export interface WatermarkOptions {
  alpha?: number;
  channel?: 0 | 1 | 2;
  q?: number;          // quantization step QIM
  seed?: number;       // permutation positions
  reps?: number;       // repetitions for robustness
  bands?: "HL" | "HL+LH"; // "HL" | "HL+LH"
  dctUV?: { u: number, v: number }; // DCT UV parameters
}

export interface WatermarkResult {
  image: Buffer;
}