import { promises as fs } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type {
  OpenAIOAuthRequest,
  OpenAIOAuthSession,
  OpenAIOAuthTransport
} from '@openai-oauth/core';

import SecureStorage from './secure-storage.js';

const OAUTH_CALLBACK_HOST = '127.0.0.1';
const OAUTH_CALLBACK_PORT = 1455;
const OAUTH_CALLBACK_PATH = '/auth/callback';
const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`;
const OAUTH_SESSION_FILENAME = 'openai-oauth.json';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_WINDOW_MS = 2 * 60 * 1000;

type OpenAiOAuthCoreModule = typeof import('@openai-oauth/core');

interface StoredOpenAiOAuthSession {
  version: 1;
  encryptedSession: string;
}

interface PendingOpenAiOAuthLogin {
  request: OpenAIOAuthRequest;
  server: Server;
  authorizationUrl: string;
  timeout: ReturnType<typeof setTimeout>;
  completing: boolean;
}

interface OpenAiOAuthModelsResponse {
  data?: Array<{ id?: unknown }>;
  error?: { message?: unknown };
}

export interface OpenAiOAuthStatus {
  connected: boolean;
  signingIn: boolean;
  secureStorageAvailable: boolean;
  error?: string;
}

export interface OpenAiOAuthLoginStart {
  connected: boolean;
  authorizationUrl?: string;
}

const importEsmModule = new Function(
  'specifier',
  'return import(specifier)'
) as (specifier: string) => Promise<OpenAiOAuthCoreModule>;

class AiAssistantOpenAiOAuthService {
  private readonly basePath = join(homedir(), 'Documents', 'dbolt', 'ai-assistant');
  private coreModulePromise: Promise<OpenAiOAuthCoreModule> | null = null;
  private sessionLoaded = false;
  private session: OpenAIOAuthSession | null = null;
  private pendingLogin: PendingOpenAiOAuthLogin | null = null;
  private refreshPromise: Promise<OpenAIOAuthSession> | null = null;
  private transport: OpenAIOAuthTransport | null = null;
  private lastLoginError = '';

  async getStatus(): Promise<OpenAiOAuthStatus> {
    try {
      const session = await this.getSession();
      return {
        connected: Boolean(session),
        signingIn: this.pendingLogin !== null,
        secureStorageAvailable: SecureStorage.isSecurePersistenceAvailable(),
        error: this.lastLoginError || undefined
      };
    } catch (error: unknown) {
      return {
        connected: false,
        signingIn: this.pendingLogin !== null,
        secureStorageAvailable: SecureStorage.isSecurePersistenceAvailable(),
        error: this.safeErrorMessage(error, 'Could not restore the ChatGPT session.')
      };
    }
  }

  async startLogin(): Promise<OpenAiOAuthLoginStart> {
    if (!SecureStorage.isSecurePersistenceAvailable()) {
      throw new Error('Secure credential storage is unavailable. ChatGPT login was not started.');
    }

    if (await this.getSession().catch(() => null)) {
      return { connected: true };
    }

    if (this.pendingLogin) {
      return {
        connected: false,
        authorizationUrl: this.pendingLogin.authorizationUrl
      };
    }

    this.lastLoginError = '';
    const core = await this.loadCoreModule();
    const oauthRequest = await core.createOpenAIOAuthRequest({
      redirectUri: OAUTH_REDIRECT_URI
    });
    const server = createServer((request, response) => {
      void this.handleCallback(request, response);
    });

    await this.listenForCallback(server);

    const timeout = setTimeout(() => {
      this.failPendingLogin('ChatGPT login timed out. Try again.');
    }, LOGIN_TIMEOUT_MS);

    this.pendingLogin = {
      request: oauthRequest,
      server,
      authorizationUrl: oauthRequest.authorizationUrl,
      timeout,
      completing: false
    };

    return {
      connected: false,
      authorizationUrl: oauthRequest.authorizationUrl
    };
  }

  async disconnect(): Promise<OpenAiOAuthStatus> {
    this.closePendingLogin();
    this.session = null;
    this.sessionLoaded = true;
    this.transport = null;
    this.lastLoginError = '';

    try {
      await fs.rm(this.getSessionFilePath(), { force: true });
    } catch (error: unknown) {
      throw new Error(this.safeErrorMessage(error, 'Could not remove the saved ChatGPT session.'));
    }

    return await this.getStatus();
  }

  async listModels(): Promise<string[]> {
    const transport = await this.getTransport();
    const response = await transport.request('/v1/models', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    const payload = await this.readModelsResponse(response);

    if (!response.ok) {
      const reason = typeof payload.error?.message === 'string'
        ? payload.error.message
        : `OpenAI OAuth model discovery failed (${response.status}).`;
      throw new Error(reason);
    }

    const models = (payload.data || [])
      .map((item) => typeof item.id === 'string' ? item.id.trim() : '')
      .filter((model) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(model));

    return [...new Set(models)].slice(0, 100);
  }

  async getTransport(): Promise<OpenAIOAuthTransport> {
    if (!await this.getSession()) {
      throw new Error('Sign in with ChatGPT before using OpenAI OAuth.');
    }

    if (!this.transport) {
      const core = await this.loadCoreModule();
      this.transport = core.createOpenAIOAuthTransport({
        auth: async () => await this.getSession()
      });
    }

    return this.transport;
  }

  async getSession(): Promise<OpenAIOAuthSession | null> {
    await this.loadStoredSession();

    if (!this.session || !this.shouldRefresh(this.session)) {
      return this.session;
    }

    if (!this.session.refreshToken) {
      return this.session;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshSession(this.session)
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return await this.refreshPromise;
  }

  private async handleCallback(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const pendingLogin = this.pendingLogin;
    const requestUrl = new URL(request.url || '/', OAUTH_REDIRECT_URI);

    if (request.method !== 'GET' || requestUrl.pathname !== OAUTH_CALLBACK_PATH) {
      this.respondToBrowser(response, 404, 'Página não encontrada.');
      return;
    }

    if (!pendingLogin) {
      this.respondToBrowser(response, 410, 'Esta tentativa de login não está mais ativa.');
      return;
    }

    const returnedState = requestUrl.searchParams.get('state') || '';
    if (!this.statesMatch(returnedState, pendingLogin.request.state)) {
      this.respondToBrowser(response, 400, 'Não foi possível validar esta tentativa de login.');
      return;
    }

    if (pendingLogin.completing) {
      this.respondToBrowser(response, 409, 'Este login já está sendo concluído.');
      return;
    }

    const oauthError = requestUrl.searchParams.get('error');
    const code = requestUrl.searchParams.get('code') || '';

    if (oauthError || !code || code.length > 4096) {
      const message = oauthError === 'access_denied'
        ? 'O login foi cancelado.'
        : 'O ChatGPT não autorizou o login.';
      this.respondToBrowser(response, 400, message);
      this.failPendingLogin(message);
      return;
    }

    pendingLogin.completing = true;

    try {
      const core = await this.loadCoreModule();
      const abortController = new AbortController();
      const exchangeTimeout = setTimeout(() => abortController.abort(), 30_000);
      let tokenResponse;

      try {
        tokenResponse = await core.exchangeOpenAIOAuthCode({
          code,
          codeVerifier: pendingLogin.request.codeVerifier,
          redirectUri: pendingLogin.request.redirectUri,
          signal: abortController.signal
        });
      } finally {
        clearTimeout(exchangeTimeout);
      }

      const accountId = tokenResponse.accountId ||
        core.deriveAccountId(tokenResponse.idToken) ||
        core.deriveAccountId(tokenResponse.accessToken);

      if (!accountId) {
        throw new Error('The ChatGPT account identifier was not returned.');
      }

      const session: OpenAIOAuthSession = {
        accessToken: tokenResponse.accessToken,
        accountId,
        isFedRamp: tokenResponse.isFedRamp,
        idToken: tokenResponse.idToken,
        refreshToken: tokenResponse.refreshToken,
        expiresAt: this.expiresAtFromSeconds(tokenResponse.expiresIn),
        lastRefresh: new Date().toISOString()
      };

      await this.persistSession(session);
      this.session = session;
      this.sessionLoaded = true;
      this.transport = null;
      this.lastLoginError = '';
      this.respondToBrowser(response, 200, 'Login concluído. Você já pode voltar ao DBolt.');
      this.closePendingLogin();
    } catch (_error: unknown) {
      const message = 'Não foi possível concluir o login com o ChatGPT.';
      this.respondToBrowser(response, 500, message);
      this.failPendingLogin(message);
    }
  }

  private async refreshSession(session: OpenAIOAuthSession): Promise<OpenAIOAuthSession> {
    const refreshToken = session.refreshToken;
    if (!refreshToken) return session;

    const core = await this.loadCoreModule();
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 30_000);

    try {
      const tokenResponse = await core.refreshOpenAIOAuthTokens({
        refreshToken,
        signal: abortController.signal
      });
      const refreshedSession: OpenAIOAuthSession = {
        accessToken: tokenResponse.accessToken,
        accountId: tokenResponse.accountId ||
          core.deriveAccountId(tokenResponse.idToken) ||
          core.deriveAccountId(tokenResponse.accessToken) ||
          session.accountId,
        isFedRamp: tokenResponse.isFedRamp ?? session.isFedRamp,
        idToken: tokenResponse.idToken || session.idToken,
        refreshToken: tokenResponse.refreshToken || refreshToken,
        expiresAt: this.expiresAtFromSeconds(tokenResponse.expiresIn),
        lastRefresh: new Date().toISOString()
      };

      await this.persistSession(refreshedSession);
      this.session = refreshedSession;
      return refreshedSession;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async loadStoredSession(): Promise<void> {
    if (this.sessionLoaded) return;
    this.sessionLoaded = true;

    try {
      const payload = await fs.readFile(this.getSessionFilePath(), 'utf8');
      const stored = JSON.parse(payload) as Partial<StoredOpenAiOAuthSession>;

      if (stored.version !== 1 || typeof stored.encryptedSession !== 'string') {
        throw new Error('Saved ChatGPT session has an invalid format.');
      }

      const decrypted = await SecureStorage.decryptString(stored.encryptedSession);
      const session = JSON.parse(decrypted) as Partial<OpenAIOAuthSession>;

      if (!this.isValidSession(session)) {
        throw new Error('Saved ChatGPT session is incomplete.');
      }

      this.session = session;
    } catch (error: unknown) {
      if (this.readErrorCode(error) === 'ENOENT') {
        this.session = null;
        return;
      }

      throw error;
    }
  }

  private async persistSession(session: OpenAIOAuthSession): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true, mode: 0o700 });
    const encryptedSession = await SecureStorage.encryptStringSecurely(JSON.stringify(session));
    const payload: StoredOpenAiOAuthSession = {
      version: 1,
      encryptedSession
    };

    await fs.writeFile(
      this.getSessionFilePath(),
      JSON.stringify(payload, null, 2),
      { encoding: 'utf8', mode: 0o600 }
    );
    await fs.chmod(this.getSessionFilePath(), 0o600).catch(() => undefined);
  }

  private async loadCoreModule(): Promise<OpenAiOAuthCoreModule> {
    if (!this.coreModulePromise) {
      this.coreModulePromise = importEsmModule('@openai-oauth/core');
    }

    return await this.coreModulePromise;
  }

  private async listenForCallback(server: Server): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      server.once('error', onError);
      server.listen(OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_HOST, () => {
        server.removeListener('error', onError);
        resolve();
      });
    }).catch((error: unknown) => {
      server.close();
      const message = this.readErrorCode(error) === 'EADDRINUSE'
        ? `Port ${OAUTH_CALLBACK_PORT} is already in use. Close the other login process and try again.`
        : this.safeErrorMessage(error, 'Could not start the secure login callback.');
      throw new Error(message);
    });
  }

  private closePendingLogin(): void {
    const pendingLogin = this.pendingLogin;
    if (!pendingLogin) return;

    clearTimeout(pendingLogin.timeout);
    pendingLogin.server.close();
    this.pendingLogin = null;
  }

  private failPendingLogin(message: string): void {
    this.lastLoginError = message;
    this.closePendingLogin();
  }

  private respondToBrowser(response: ServerResponse, status: number, message: string): void {
    const safeMessage = this.escapeHtml(message);
    const success = status >= 200 && status < 300;
    const title = success ? 'ChatGPT conectado' : 'Não foi possível conectar';
    const color = success ? '#8bc7a4' : '#ffb4b4';

    response.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    response.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{background:#131313;color:#f2f2f2;font-family:system-ui,sans-serif;display:grid;min-height:100vh;margin:0;place-items:center}.card{background:#1d1b1b;border:1px solid #383434;border-radius:16px;max-width:420px;padding:28px;text-align:center}h1{color:${color};font-size:20px;margin:0 0 10px}p{color:#b8b8b8;line-height:1.5;margin:0}</style></head><body><main class="card"><h1>${title}</h1><p>${safeMessage}</p></main></body></html>`);
  }

  private statesMatch(returnedState: string, expectedState: string): boolean {
    const returned = Buffer.from(returnedState, 'utf8');
    const expected = Buffer.from(expectedState, 'utf8');

    if (returned.length !== expected.length || returned.length === 0) {
      return false;
    }

    return timingSafeEqual(returned, expected);
  }

  private shouldRefresh(session: OpenAIOAuthSession): boolean {
    if (!session.expiresAt) return false;
    const expiresAt = Date.parse(session.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt <= Date.now() + TOKEN_REFRESH_WINDOW_MS;
  }

  private expiresAtFromSeconds(expiresIn: number | undefined): string | undefined {
    if (!Number.isFinite(expiresIn) || Number(expiresIn) <= 0) return undefined;
    return new Date(Date.now() + Number(expiresIn) * 1000).toISOString();
  }

  private isValidSession(session: Partial<OpenAIOAuthSession>): session is OpenAIOAuthSession {
    return typeof session.accessToken === 'string' && session.accessToken.length > 0 &&
      typeof session.accountId === 'string' && session.accountId.length > 0;
  }

  private async readModelsResponse(response: Response): Promise<OpenAiOAuthModelsResponse> {
    try {
      return await response.json() as OpenAiOAuthModelsResponse;
    } catch (_error: unknown) {
      return {};
    }
  }

  private getSessionFilePath(): string {
    return join(this.basePath, OAUTH_SESSION_FILENAME);
  }

  private readErrorCode(error: unknown): unknown {
    return typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  }

  private safeErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof Error) || !error.message.trim()) return fallback;
    return error.message.replace(/[\r\n]+/g, ' ').slice(0, 300);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export default new AiAssistantOpenAiOAuthService();
