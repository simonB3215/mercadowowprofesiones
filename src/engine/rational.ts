/**
 * Aritmética racional exacta sobre BigInt.
 * Los precios se guardan en cobre entero; cualquier operación derivada
 * (comisiones, divisiones por unidades, ROI) se mantiene como fracción exacta.
 */
export class Q {
  readonly n: bigint;
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    if (d === 0n) throw new RangeError('Denominador cero');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n < 0n ? -n : n, d);
    this.n = g > 1n ? n / g : n;
    this.d = g > 1n ? d / g : d;
  }

  static of(n: bigint | number, d: bigint | number = 1n): Q {
    return new Q(toBig(n), toBig(d));
  }

  static zero = new Q(0n, 1n);
  static one = new Q(1n, 1n);

  /** Acepta "0.05", "0,05", "5", "-3/4", "12.5". Lanza error si el formato es inválido. */
  static parse(input: string | number): Q {
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new RangeError('Número no finito');
      if (Number.isInteger(input)) return Q.of(BigInt(input));
      return Q.parse(String(input));
    }
    const s = input.trim().replace(',', '.');
    const frac = /^(-?\d+)\s*\/\s*(\d+)$/.exec(s);
    if (frac) return Q.of(BigInt(frac[1]), BigInt(frac[2]));
    const dec = /^(-?)(\d*)(?:\.(\d+))?$/.exec(s);
    if (!dec || (dec[2] === '' && !dec[3])) throw new RangeError(`Número inválido: "${input}"`);
    const intPart = dec[2] || '0';
    const fracPart = dec[3] ?? '';
    const n = BigInt(intPart + fracPart) * (dec[1] === '-' ? -1n : 1n);
    return Q.of(n, 10n ** BigInt(fracPart.length));
  }

  add(o: Q): Q {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Q): Q {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Q | bigint | number): Q {
    const q = o instanceof Q ? o : Q.of(o);
    return new Q(this.n * q.n, this.d * q.d);
  }
  div(o: Q | bigint | number): Q {
    const q = o instanceof Q ? o : Q.of(o);
    if (q.n === 0n) throw new RangeError('División por cero');
    return new Q(this.n * q.d, this.d * q.n);
  }
  neg(): Q {
    return new Q(-this.n, this.d);
  }
  cmp(o: Q): number {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  eq(o: Q): boolean {
    return this.n === o.n && this.d === o.d;
  }
  sign(): number {
    return this.n === 0n ? 0 : this.n > 0n ? 1 : -1;
  }
  isZero(): boolean {
    return this.n === 0n;
  }
  isInteger(): boolean {
    return this.d === 1n;
  }
  /** Menor entero >= valor. */
  ceil(): bigint {
    const q = this.n / this.d;
    return this.n > 0n && this.n % this.d !== 0n ? q + 1n : q;
  }
  floor(): bigint {
    const q = this.n / this.d;
    return this.n < 0n && this.n % this.d !== 0n ? q - 1n : q;
  }
  /** Indica si la expansión decimal termina (denominador solo con factores 2 y 5). */
  isTerminating(): boolean {
    let d = this.d;
    while (d % 2n === 0n) d /= 2n;
    while (d % 5n === 0n) d /= 5n;
    return d === 1n;
  }
  /** Representación decimal truncada a `digits` cifras (solo para mostrar). */
  toDecimal(digits = 4): string {
    const neg = this.n < 0n;
    const a = neg ? -this.n : this.n;
    const scale = 10n ** BigInt(digits);
    const scaled = (a * scale) / this.d;
    const ip = scaled / scale;
    let fp = (scaled % scale).toString().padStart(digits, '0').replace(/0+$/, '');
    const str = fp ? `${ip}.${fp}` : `${ip}`;
    return (neg && scaled !== 0n ? '-' : '') + str;
  }
  toFraction(): string {
    return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`;
  }
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }
  toJSON(): { n: string; d: string } {
    return { n: this.n.toString(), d: this.d.toString() };
  }
  static fromJSON(j: { n: string; d: string }): Q {
    return Q.of(BigInt(j.n), BigInt(j.d));
  }
}

function toBig(v: bigint | number): bigint {
  if (typeof v === 'bigint') return v;
  if (!Number.isInteger(v)) throw new RangeError(`Se esperaba entero: ${v}`);
  return BigInt(v);
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}

export const COPPER_PER_GOLD = 10000n;
export const gold = (g: bigint | number | string): Q =>
  (typeof g === 'string' ? Q.parse(g) : Q.of(g)).mul(COPPER_PER_GOLD);
