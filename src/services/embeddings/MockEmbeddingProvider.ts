import type { EmbeddingProvider } from './EmbeddingProvider';

const DIM = 64;

function hash(seed: number, input: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  name(): string {
    return 'mock';
  }
  dim(): number {
    return DIM;
  }
  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(DIM).fill(0);
    for (let i = 0; i < DIM; i++) {
      const h = hash(0x9e3779b1 + i, text);
      v[i] = ((h % 2000) - 1000) / 1000;
    }
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    return v.map((x) => x / n);
  }
}
