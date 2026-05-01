import { LocalSecretsService } from './LocalSecretsService';
import type { SecretsService } from './SecretsService';

export const secrets: SecretsService = new LocalSecretsService();
export type { SecretsService };

export const SECRET_KEY = (provider: string) => `provider:${provider}`;
