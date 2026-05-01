export interface SecretsService {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  list(): Promise<string[]>;
}
