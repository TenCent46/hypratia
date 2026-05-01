export interface EmbeddingProvider {
  name(): string;
  dim(): number;
  embed(text: string): Promise<number[]>;
}
