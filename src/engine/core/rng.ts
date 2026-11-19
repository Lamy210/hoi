// PCG32決定論的乱数（O'Neill）— docs/08 §1の規律に従う。
// Math.randomはシミュレーション内で禁止。状態は2×64bit（hi/lo各32bitペア）で保持し、
// セーブ・復元が可能。BigIntは演算内部のみで使用し、外部に持ち出さない。

export interface RngState {
  sHi: number;
  sLo: number;
  iHi: number;
  iLo: number;
}

const MULT = 0x5851f42d4c957f2dn;
const MASK64 = (1n << 64n) - 1n;

function pack(hi: number, lo: number): bigint {
  return ((BigInt(hi >>> 0) & 0xffffffffn) << 32n) | (BigInt(lo >>> 0) & 0xffffffffn);
}

function unpack(v: bigint): [number, number] {
  return [Number((v >> 32n) & 0xffffffffn), Number(v & 0xffffffffn)];
}

export class PCG32 {
  private state: bigint;
  private inc: bigint;

  private constructor(state: bigint, inc: bigint) {
    this.state = state;
    this.inc = inc | 1n;
  }

  /** シード（32bit）とストリーム番号（32bit・奇数化される）から生成 */
  static fromSeed(seed: number, seq: number): PCG32 {
    const initseq = (BigInt(seq >>> 0) << 1n) | 1n;
    const rng = new PCG32(0n, initseq);
    rng.nextUint();
    rng.state = (rng.state + BigInt(seed >>> 0)) & MASK64;
    rng.nextUint();
    return rng;
  }

  static fromParts(s: RngState): PCG32 {
    return new PCG32(pack(s.sHi, s.sLo), pack(s.iHi, s.iLo));
  }

  toParts(): RngState {
    const [sHi, sLo] = unpack(this.state);
    const [iHi, iLo] = unpack(this.inc);
    return { sHi, sLo, iHi, iLo };
  }

  /** 32bit整数（0〜2^32-1）を返す */
  nextUint(): number {
    this.state = (this.state * MULT + this.inc) & MASK64;
    // xorshift出力（標準PCG-XSH-RR）
    const xorshifted = Number(((this.state >> 18n) ^ this.state) & 0xffffffffn);
    const rot = Number((this.state >> 59n) & 31n);
    return ((xorshifted >>> rot) | (xorshifted << ((32 - rot) >>> 0))) >>> 0;
  }

  /** [0,1) の一様乱数（53bit分解能: 2回のnextUintを使用） */
  nextFloat(): number {
    const a = this.nextUint();
    const b = this.nextUint();
    return (a * 2097152 + (b >>> 11)) / 9007199254740992;
  }

  /** [0,n) の一様整数 */
  nextInt(n: number): number {
    return Math.floor(this.nextFloat() * n) % n;
  }

  /** [lo,hi) の一様浮動小数 */
  nextRange(lo: number, hi: number): number {
    return lo + (hi - lo) * this.nextFloat();
  }
}

/** システム名・スコープから決定論的に子ストリームを派生する（INV: 同一シード→同一系列） */
export function deriveStream(worldSeed: number, systemName: string, scope: string): PCG32 {
  const h = fnv1a32(systemName + '\x1f' + scope);
  const seed = (worldSeed ^ h) >>> 0;
  return PCG32.fromSeed(seed, (h * 2 + 1) >>> 0);
}

/** FNV-1a 32bit（文字列ハッシュ・状態ハッシュの基底） */
export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= str.charCodeAt(i) >>> 8;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 数値の状態ハッシュ混合（f64のビット列を決定論的に混合する） */
export function mixFloat(h: number, v: number): number {
  const buf = new ArrayBuffer(8);
  const f = new Float64Array(buf);
  const u = new Uint32Array(buf);
  f[0] = v;
  h ^= u[0];
  h = Math.imul(h, 16777619);
  h ^= u[1];
  h = Math.imul(h, 16777619);
  return h >>> 0;
}

export function mixInt(h: number, v: number): number {
  h ^= v >>> 0;
  h = Math.imul(h, 16777619);
  return h >>> 0;
}

export function mixStr(h: number, s: string): number {
  return mixInt(h, fnv1a32(s));
}

export function mixBool(h: number, b: boolean): number {
  return mixInt(h, b ? 1 : 0);
}
