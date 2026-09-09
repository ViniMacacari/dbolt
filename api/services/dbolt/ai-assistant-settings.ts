import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import SecureStorage from './secure-storage.js';
import OpenAiOAuth from './ai-assistant-openai-oauth.js';

const SETTINGS_FILENAME = 'settings.json';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENAI_OAUTH_BASE_URL = 'https://openai-oauth.local/v1/responses';
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
const DEFAULT_OPENROUTER_MODEL = '~openai/gpt-latest';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const DEFAULT_OPENAI_OAUTH_MODEL = 'gpt-5.6-sol';

export type AiAssistantProvider = 'openai' | 'openai-oauth' | 'gemini' | 'anthropic' | 'openrouter';
export type AiAssistantApiKeyProvider = Exclude<AiAssistantProvider, 'openai-oauth'>;

export interface AiAssistantLimits {
  maxApiCallsPerMessage: number;
  maxDatabaseRequestsPerMessage: number;
  maxDatabaseRequestsPerApiCall: number;
  maxContextMessages: number;
  maxToolResultChars: number;
  maxToolTranscriptChars: number;
}

const DEFAULT_LIMITS: AiAssistantLimits = {
  maxApiCallsPerMessage: 4,
  maxDatabaseRequestsPerMessage: 4,
  maxDatabaseRequestsPerApiCall: 2,
  maxContextMessages: 10,
  maxToolResultChars: 24000,
  maxToolTranscriptChars: 48000
};

export interface AiAssistantPublicSettings {
  provider: AiAssistantProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  hasApiKeys: Record<AiAssistantApiKeyProvider, boolean>;
  openAiOAuthConnected: boolean;
  openAiOAuthRecommendationDismissed: boolean;
  maskedApiKey?: string;
  limits: AiAssistantLimits;
}

export interface AiAssistantSettingsInput {
  provider?: AiAssistantProvider;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  apiKeys?: Partial<Record<AiAssistantApiKeyProvider, string>>;
  clearApiKeys?: Partial<Record<AiAssistantApiKeyProvider, boolean>>;
  openAiOAuthRecommendationDismissed?: boolean;
  limits?: Partial<AiAssistantLimits>;
}

export interface AiAssistantResolvedSettings {
  provider: AiAssistantProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  limits: AiAssistantLimits;
}

interface StoredAiAssistantSettings {
  provider: AiAssistantProvider;
  baseUrl: string;
  model: string;
  encryptedApiKeys?: Partial<Record<AiAssistantApiKeyProvider, string>>;
  encryptedApiKey?: string;
  openAiOAuthRecommendationDismissed?: boolean;
  limits?: AiAssistantLimits;
  updatedAt?: string;
}

class AiAssistantSettingsService {
  private readonly basePath: string;

  constructor() {
    this.basePath = join(homedir(), 'Documents', 'dbolt', 'ai-assistant');
  }

  async getSettings(): Promise<AiAssistantPublicSettings> {
    const storedSettings = await this.readSettingsFile();
    return await this.toPublicSettings(storedSettings);
  }

  async saveSettings(input: AiAssistantSettingsInput): Promise<AiAssistantPublicSettings> {
    const storedSettings = await this.readSettingsFile();
    const provider = this.normalizeProvider(input.provider ?? storedSettings.provider);
    const encryptedApiKeys = {
      ...(storedSettings.encryptedApiKeys || {})
    };
    const model = typeof input.model === 'string'
      ? input.model
      : provider === storedSettings.provider
        ? storedSettings.model
        : this.defaultModelForProvider(provider);

    const nextSettings: StoredAiAssistantSettings = {
      ...storedSettings,
      provider,
      encryptedApiKeys,
      baseUrl: this.resolveBaseUrl(provider, storedSettings, input.baseUrl),
      model: this.normalizeModel(model),
      limits: this.normalizeLimits({
        ...(storedSettings.limits || {}),
        ...(input.limits || {})
      }),
      openAiOAuthRecommendationDismissed: typeof input.openAiOAuthRecommendationDismissed === 'boolean'
        ? input.openAiOAuthRecommendationDismissed
        : storedSettings.openAiOAuthRecommendationDismissed,
      updatedAt: new Date().toISOString()
    };

    const hasOpenAiOAuthSession = provider === 'openai-oauth'
      ? Boolean(await OpenAiOAuth.getSession().catch(() => null))
      : false;

    if (provider === 'openai-oauth' && typeof input.model === 'string' && hasOpenAiOAuthSession) {
      await this.validateOpenAiOAuthModel(nextSettings.model);
    }

    if (input.clearApiKey && provider !== 'openai-oauth') {
      delete encryptedApiKeys[provider];
    } else if (provider !== 'openai-oauth' && typeof input.apiKey === 'string' && input.apiKey.trim()) {
      encryptedApiKeys[provider] = await SecureStorage.encryptString(input.apiKey.trim());
    }

    await this.applyApiKeyUpdates(encryptedApiKeys, input.apiKeys, input.clearApiKeys);

    delete nextSettings.encryptedApiKey;
    await this.writeSettingsFile(nextSettings);

    return await this.toPublicSettings(nextSettings);
  }

  async getResolvedSettings(): Promise<AiAssistantResolvedSettings> {
    const storedSettings = await this.readSettingsFile();

    if (storedSettings.provider === 'openai-oauth') {
      if (!await OpenAiOAuth.getSession()) {
        throw new Error('Sign in with ChatGPT before using OpenAI OAuth.');
      }

      return {
        provider: storedSettings.provider,
        baseUrl: DEFAULT_OPENAI_OAUTH_BASE_URL,
        model: storedSettings.model,
        apiKey: '',
        limits: this.normalizeLimits(storedSettings.limits)
      };
    }

    const encryptedApiKey = storedSettings.encryptedApiKeys?.[storedSettings.provider];

    if (!encryptedApiKey) {
      throw new Error('AI assistant API key is not configured.');
    }

    const apiKey = await SecureStorage.decryptString(encryptedApiKey);

    return {
      provider: storedSettings.provider,
      baseUrl: storedSettings.baseUrl,
      model: storedSettings.model,
      apiKey,
      limits: this.normalizeLimits(storedSettings.limits)
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
        baseUrl: this.normalizeBaseUrl(parsed.baseUrl || this.defaultBaseUrlForProvider(provider)),
        model: this.normalizeModel(parsed.model || this.defaultModelForProvider(provider)),
        encryptedApiKeys,
        limits: this.normalizeLimits(parsed.limits),
        openAiOAuthRecommendationDismissed: parsed.openAiOAuthRecommendationDismissed === true,
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
      encryptedApiKeys: {},
      openAiOAuthRecommendationDismissed: false,
      limits: DEFAULT_LIMITS
    };
  }

  private async toPublicSettings(settings: StoredAiAssistantSettings): Promise<AiAssistantPublicSettings> {
    const hasApiKeys = {
      openai: Boolean(settings.encryptedApiKeys?.openai),
      gemini: Boolean(settings.encryptedApiKeys?.gemini),
      anthropic: Boolean(settings.encryptedApiKeys?.anthropic),
      openrouter: Boolean(settings.encryptedApiKeys?.openrouter)
    };
    const openAiOAuthConnected = Boolean(await OpenAiOAuth.getSession().catch(() => null));
    const hasActiveCredential = settings.provider === 'openai-oauth'
      ? openAiOAuthConnected
      : hasApiKeys[settings.provider];

    return {
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      hasApiKey: hasActiveCredential,
      hasApiKeys,
      openAiOAuthConnected,
      openAiOAuthRecommendationDismissed: settings.openAiOAuthRecommendationDismissed === true,
      maskedApiKey: settings.provider !== 'openai-oauth' && hasApiKeys[settings.provider]
        ? '••••••••'
        : undefined,
      limits: this.normalizeLimits(settings.limits)
    };
  }

  private async applyApiKeyUpdates(
    encryptedApiKeys: Partial<Record<AiAssistantApiKeyProvider, string>>,
    apiKeys: Partial<Record<AiAssistantApiKeyProvider, string>> | undefined,
    clearApiKeys: Partial<Record<AiAssistantApiKeyProvider, boolean>> | undefined
  ): Promise<void> {
    const providers: AiAssistantApiKeyProvider[] = ['openai', 'gemini', 'anthropic', 'openrouter'];

    providers.forEach((provider) => {
      if (clearApiKeys?.[provider]) {
        delete encryptedApiKeys[provider];
      }
    });

    for (const provider of providers) {
      const apiKey = apiKeys?.[provider];
      if (typeof apiKey === 'string' && apiKey.trim()) {
        encryptedApiKeys[provider] = await SecureStorage.encryptString(apiKey.trim());
      }
    }
  }

  private normalizeProvider(provider: unknown): AiAssistantProvider {
    if (provider === 'openai-oauth') {
      return 'openai-oauth';
    }

    if (provider === 'gemini') {
      return 'gemini';
    }

    if (provider === 'anthropic') {
      return 'anthropic';
    }

    if (provider === 'openrouter') {
      return 'openrouter';
    }

    return 'openai';
  }

  private defaultModelForProvider(provider: AiAssistantProvider): string {
    if (provider === 'openai-oauth') {
      return DEFAULT_OPENAI_OAUTH_MODEL;
    }

    if (provider === 'anthropic') {
      return DEFAULT_ANTHROPIC_MODEL;
    }

    if (provider === 'openrouter') {
      return DEFAULT_OPENROUTER_MODEL;
    }

    return provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL;
  }

  private defaultBaseUrlForProvider(provider: AiAssistantProvider): string {
    if (provider === 'openai-oauth') return DEFAULT_OPENAI_OAUTH_BASE_URL;
    return provider === 'openrouter' ? DEFAULT_OPENROUTER_BASE_URL : DEFAULT_OPENAI_BASE_URL;
  }

  private resolveBaseUrl(
    provider: AiAssistantProvider,
    storedSettings: StoredAiAssistantSettings,
    inputBaseUrl: string | undefined
  ): string {
    if (provider === 'openai-oauth') {
      return DEFAULT_OPENAI_OAUTH_BASE_URL;
    }

    if (provider !== 'openai' && provider !== 'openrouter') {
      return storedSettings.baseUrl || DEFAULT_OPENAI_BASE_URL;
    }

    if (typeof inputBaseUrl === 'string' && inputBaseUrl.trim()) {
      return this.normalizeBaseUrl(inputBaseUrl);
    }

    if (provider === storedSettings.provider && storedSettings.baseUrl) {
      return this.normalizeBaseUrl(storedSettings.baseUrl);
    }

    return this.defaultBaseUrlForProvider(provider);
  }

  private normalizeModel(model: string): string {
    const normalized = model.trim();

    if (!normalized) {
      throw new Error('AI model was not provided.');
    }

    return normalized;
  }

  private async validateOpenAiOAuthModel(model: string): Promise<void> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(model)) {
      throw new Error('Invalid OpenAI OAuth model.');
    }

    const availableModels = await OpenAiOAuth.listModels();
    if (!availableModels.includes(model)) {
      throw new Error('The selected model is not available for this ChatGPT account.');
    }
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const trimmedUrl = baseUrl.trim().replace(/\/+$/, '');

    if (!trimmedUrl) {
      throw new Error('AI endpoint was not provided.');
    }

    const parsedUrl = new URL(trimmedUrl);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('AI endpoint must use HTTP or HTTPS.');
    }

    if (parsedUrl.pathname === '/v1' || parsedUrl.pathname === '/api/v1') {
      return `${trimmedUrl}/chat/completions`;
    }

    return trimmedUrl;
  }

  private normalizeLimits(limits: Partial<AiAssistantLimits> | undefined): AiAssistantLimits {
    return {
      maxApiCallsPerMessage: this.normalizeIntegerLimit(limits?.maxApiCallsPerMessage, DEFAULT_LIMITS.maxApiCallsPerMessage, 1, 10),
      maxDatabaseRequestsPerMessage: this.normalizeIntegerLimit(limits?.maxDatabaseRequestsPerMessage, DEFAULT_LIMITS.maxDatabaseRequestsPerMessage, 0, 20),
      maxDatabaseRequestsPerApiCall: this.normalizeIntegerLimit(limits?.maxDatabaseRequestsPerApiCall, DEFAULT_LIMITS.maxDatabaseRequestsPerApiCall, 1, 5),
      maxContextMessages: this.normalizeIntegerLimit(limits?.maxContextMessages, DEFAULT_LIMITS.maxContextMessages, 1, 20),
      maxToolResultChars: this.normalizeIntegerLimit(limits?.maxToolResultChars, DEFAULT_LIMITS.maxToolResultChars, 1000, 50000),
      maxToolTranscriptChars: this.normalizeIntegerLimit(limits?.maxToolTranscriptChars, DEFAULT_LIMITS.maxToolTranscriptChars, 4000, 100000)
    };
  }

  private normalizeIntegerLimit(
    value: unknown,
    fallback: number,
    min: number,
    max: number
  ): number {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      return fallback;
    }

    return Math.min(Math.max(Math.floor(numberValue), min), max);
  }
}

export default new AiAssistantSettingsService();
