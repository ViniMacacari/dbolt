import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import SecureStorage from './secure-storage.js';

const SETTINGS_FILENAME = 'settings.json';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export type AiAssistantProvider = 'openai' | 'gemini';

export interface AiAssistantPublicSettings {
  provider: AiAssistantProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  hasApiKeys: Record<AiAssistantProvider, boolean>;
  maskedApiKey?: string;
}

export interface AiAssistantSettingsInput {
  provider?: AiAssistantProvider;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface AiAssistantResolvedSettings {
  provider: AiAssistantProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface StoredAiAssistantSettings {
  provider: AiAssistantProvider;
  baseUrl: string;
  model: string;
  encryptedApiKeys?: Partial<Record<AiAssistantProvider, string>>;
  encryptedApiKey?: string;
  updatedAt?: string;
}

class AiAssistantSettingsService {
  private readonly basePath: string;

  constructor() {
    this.basePath = join(homedir(), 'Documents', 'dbolt', 'ai-assistant');
  }

  async getSettings(): Promise<AiAssistantPublicSettings> {
    const storedSettings = await this.readSettingsFile();
    return this.toPublicSettings(storedSettings);
  }

  async saveSettings(input: AiAssistantSettingsInput): Promise<AiAssistantPublicSettings> {
    const storedSettings = await this.readSettingsFile();
    const provider = this.normalizeProvider(input.provider ?? storedSettings.provider);
    const encryptedApiKeys = {
      ...(storedSettings.encryptedApiKeys || {})
    };

    const nextSettings: StoredAiAssistantSettings = {
      ...storedSettings,
      provider,
      encryptedApiKeys,
      baseUrl: provider === 'openai'
        ? this.normalizeBaseUrl(input.baseUrl ?? storedSettings.baseUrl)
        : storedSettings.baseUrl,
      model: this.normalizeModel(input.model ?? storedSettings.model),
      updatedAt: new Date().toISOString()
    };

    if (input.clearApiKey) {
      delete encryptedApiKeys[provider];
    } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
      encryptedApiKeys[provider] = await SecureStorage.encryptString(input.apiKey.trim());
    }

    delete nextSettings.encryptedApiKey;
    await this.writeSettingsFile(nextSettings);

    return this.toPublicSettings(nextSettings);
  }

  async getResolvedSettings(): Promise<AiAssistantResolvedSettings> {
    const storedSettings = await this.readSettingsFile();
    const encryptedApiKey = storedSettings.encryptedApiKeys?.[storedSettings.provider];

    if (!encryptedApiKey) {
      throw new Error('API key do assistente de IA não configurada.');
    }

    const apiKey = await SecureStorage.decryptString(encryptedApiKey);

    return {
      provider: storedSettings.provider,
      baseUrl: storedSettings.baseUrl,
      model: storedSettings.model,
      apiKey
    };
  }

  private async readSettingsFile(): Promise<StoredAiAssistantSettings> {
    await this.ensureDirectoryExists();

    try {
      const payload = await fs.readFile(this.getSettingsFilePath(), 'utf8');
      const parsed = JSON.parse(payload) as Partial<StoredAiAssistantSettings>;
      const provider = this.normalizeProvider(parsed.provider);
      const legacyEncryptedApiKey = parsed.encryptedApiKey;
      const encryptedApiKeys = {
        ...(parsed.encryptedApiKeys || {})
      };

      if (legacyEncryptedApiKey && !encryptedApiKeys.openai) {
        encryptedApiKeys.openai = legacyEncryptedApiKey;
      }

      return {
        provider,
        baseUrl: this.normalizeBaseUrl(parsed.baseUrl || DEFAULT_OPENAI_BASE_URL),
        model: this.normalizeModel(parsed.model || this.defaultModelForProvider(provider)),
        encryptedApiKeys,
        updatedAt: parsed.updatedAt
      };
    } catch (error: unknown) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;

      if (errorCode === 'ENOENT') {
        return this.defaultSettings();
      }

      throw error;
    }
  }

  private async writeSettingsFile(settings: StoredAiAssistantSettings): Promise<void> {
    await this.ensureDirectoryExists();
    await fs.writeFile(this.getSettingsFilePath(), JSON.stringify(settings, null, 2), 'utf8');
  }

  private async ensureDirectoryExists(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  private getSettingsFilePath(): string {
    return join(this.basePath, SETTINGS_FILENAME);
  }

  private defaultSettings(): StoredAiAssistantSettings {
    return {
      provider: 'openai',
      baseUrl: DEFAULT_OPENAI_BASE_URL,
      model: DEFAULT_OPENAI_MODEL,
      encryptedApiKeys: {}
    };
  }

  private toPublicSettings(settings: StoredAiAssistantSettings): AiAssistantPublicSettings {
    const hasApiKeys = {
      openai: Boolean(settings.encryptedApiKeys?.openai),
      gemini: Boolean(settings.encryptedApiKeys?.gemini)
    };

    return {
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      hasApiKey: hasApiKeys[settings.provider],
      hasApiKeys,
      maskedApiKey: hasApiKeys[settings.provider] ? '••••••••' : undefined
    };
  }

  private normalizeProvider(provider: unknown): AiAssistantProvider {
    if (provider === 'gemini') {
      return 'gemini';
    }

    return 'openai';
  }

  private defaultModelForProvider(provider: AiAssistantProvider): string {
    return provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL;
  }

  private normalizeModel(model: string): string {
    const normalized = model.trim();

    if (!normalized) {
      throw new Error('Modelo da IA não informado.');
    }

    return normalized;
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const trimmedUrl = baseUrl.trim().replace(/\/+$/, '');

    if (!trimmedUrl) {
      throw new Error('Endpoint da IA não informado.');
    }

    const parsedUrl = new URL(trimmedUrl);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Endpoint da IA precisa usar HTTP ou HTTPS.');
    }

    if (parsedUrl.pathname === '/v1') {
      return `${trimmedUrl}/chat/completions`;
    }

    return trimmedUrl;
  }
}

export default new AiAssistantSettingsService();
