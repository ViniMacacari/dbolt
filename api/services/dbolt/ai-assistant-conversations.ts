import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONVERSATIONS_FILENAME = 'conversations.json';
const DEFAULT_CONVERSATION_TITLE = 'New chat';
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES_PER_CONVERSATION = 120;
const MAX_TITLE_LENGTH = 60;
const MAX_MESSAGE_LENGTH = 20000;

export type AiAssistantConversationRole = 'user' | 'assistant';

export interface AiAssistantConversationMessage {
  id: string;
  role: AiAssistantConversationRole;
  content: string;
  createdAt: string;
  error?: boolean;
}

export interface AiAssistantConversation {
  id: string;
  title: string;
  messages: AiAssistantConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AiAssistantConversationsState {
  activeConversationId: string;
  conversations: AiAssistantConversation[];
}

export interface AiAssistantConversationUpdate {
  title?: string;
  messages?: AiAssistantConversationMessage[];
}

class AiAssistantConversationsService {
  private readonly basePath: string;

  constructor() {
    this.basePath = join(homedir(), 'Documents', 'dbolt', 'ai-assistant');
  }

  async getState(): Promise<AiAssistantConversationsState> {
    const state = await this.readStateFile();
    await this.writeStateFile(state);
    return state;
  }

  async createConversation(title?: string): Promise<AiAssistantConversationsState> {
    const state = await this.readStateFile();
    const conversation = this.createConversationRecord(title);

    state.conversations = [
      conversation,
      ...state.conversations
    ].slice(0, MAX_CONVERSATIONS);
    state.activeConversationId = conversation.id;

    await this.writeStateFile(state);
    return state;
  }

  async setActiveConversation(conversationId: string): Promise<AiAssistantConversationsState> {
    const state = await this.readStateFile();

    if (!state.conversations.some((conversation) => conversation.id === conversationId)) {
      throw new Error('AI conversation was not found.');
    }

    state.activeConversationId = conversationId;
    await this.writeStateFile(state);
    return state;
  }

  async updateConversation(
    conversationId: string,
    update: AiAssistantConversationUpdate
  ): Promise<AiAssistantConversationsState> {
    const state = await this.readStateFile();
    const conversation = state.conversations.find((item) => item.id === conversationId);

    if (!conversation) {
      throw new Error('AI conversation was not found.');
    }

    if (Array.isArray(update.messages)) {
      conversation.messages = this.normalizeMessages(update.messages);
    }

    if (typeof update.title === 'string') {
      conversation.title = this.normalizeTitle(update.title);
    } else {
      conversation.title = this.deriveTitle(conversation);
    }

    conversation.updatedAt = new Date().toISOString();
    await this.writeStateFile(state);
    return state;
  }

  async deleteConversation(conversationId: string): Promise<AiAssistantConversationsState> {
    const state = await this.readStateFile();
    state.conversations = state.conversations.filter((conversation) => conversation.id !== conversationId);

    if (state.conversations.length === 0) {
      const conversation = this.createConversationRecord();
      state.conversations = [conversation];
      state.activeConversationId = conversation.id;
    } else if (state.activeConversationId === conversationId) {
      state.activeConversationId = state.conversations[0].id;
    }

    await this.writeStateFile(state);
    return state;
  }

  async deleteAllConversations(): Promise<AiAssistantConversationsState> {
    const state = this.defaultState();
    await this.writeStateFile(state);
    return state;
  }

  private async readStateFile(): Promise<AiAssistantConversationsState> {
    await this.ensureDirectoryExists();

    try {
      const payload = await fs.readFile(this.getConversationsFilePath(), 'utf8');
      const parsed = JSON.parse(payload) as Partial<AiAssistantConversationsState>;
      return this.normalizeState(parsed);
    } catch (error: unknown) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;

      if (errorCode === 'ENOENT') {
        return this.defaultState();
      }

      throw error;
    }
  }

  private async writeStateFile(state: AiAssistantConversationsState): Promise<void> {
    await this.ensureDirectoryExists();
    await fs.writeFile(this.getConversationsFilePath(), JSON.stringify(state, null, 2), 'utf8');
  }

  private normalizeState(parsed: Partial<AiAssistantConversationsState>): AiAssistantConversationsState {
    const conversations = Array.isArray(parsed.conversations)
      ? parsed.conversations
        .map((conversation) => this.normalizeConversation(conversation))
        .filter((conversation): conversation is AiAssistantConversation => Boolean(conversation))
        .slice(0, MAX_CONVERSATIONS)
      : [];

    if (conversations.length === 0) {
      return this.defaultState();
    }

    const activeConversationId = typeof parsed.activeConversationId === 'string' &&
      conversations.some((conversation) => conversation.id === parsed.activeConversationId)
      ? parsed.activeConversationId
      : conversations[0].id;

    return {
      activeConversationId,
      conversations
    };
  }

  private normalizeConversation(value: unknown): AiAssistantConversation | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const id = typeof record['id'] === 'string' && record['id'].trim()
      ? record['id'].trim()
      : this.createId();
    const createdAt = this.normalizeDate(record['createdAt']);
    const updatedAt = this.normalizeDate(record['updatedAt'], createdAt);
    const messages = Array.isArray(record['messages'])
      ? this.normalizeMessages(record['messages'])
      : [];
    const title = this.normalizeTitle(String(record['title'] || '')) ||
      this.titleFromMessages(messages) ||
      DEFAULT_CONVERSATION_TITLE;

    return {
      id,
      title,
      messages,
      createdAt,
      updatedAt
    };
  }

  private normalizeMessages(messages: unknown[]): AiAssistantConversationMessage[] {
    return messages
      .map((message) => this.normalizeMessage(message))
      .filter((message): message is AiAssistantConversationMessage => Boolean(message))
      .slice(-MAX_MESSAGES_PER_CONVERSATION);
  }

  private normalizeMessage(value: unknown): AiAssistantConversationMessage | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const role = record['role'] === 'assistant' ? 'assistant' : record['role'] === 'user' ? 'user' : null;
    const content = typeof record['content'] === 'string'
      ? record['content'].slice(0, MAX_MESSAGE_LENGTH)
      : '';

    if (!role || !content.trim()) {
      return null;
    }

    return {
      id: typeof record['id'] === 'string' && record['id'].trim()
        ? record['id'].trim()
        : this.createId(),
      role,
      content,
      createdAt: this.normalizeDate(record['createdAt']),
      error: record['error'] === true ? true : undefined
    };
  }

  private createConversationRecord(title?: string): AiAssistantConversation {
    const now = new Date().toISOString();

    return {
      id: this.createId(),
      title: this.normalizeTitle(title || '') || DEFAULT_CONVERSATION_TITLE,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
  }

  private defaultState(): AiAssistantConversationsState {
    const conversation = this.createConversationRecord();

    return {
      activeConversationId: conversation.id,
      conversations: [conversation]
    };
  }

  private deriveTitle(conversation: AiAssistantConversation): string {
    if (conversation.title && conversation.title !== DEFAULT_CONVERSATION_TITLE) {
      return conversation.title;
    }

    return this.titleFromMessages(conversation.messages) || DEFAULT_CONVERSATION_TITLE;
  }

  private titleFromMessages(messages: AiAssistantConversationMessage[]): string {
    const firstUserMessage = messages.find((message) => message.role === 'user' && !message.error);
    return firstUserMessage ? this.normalizeTitle(firstUserMessage.content) : '';
  }

  private normalizeTitle(value: string): string {
    const title = value
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TITLE_LENGTH);

    return title || '';
  }

  private normalizeDate(value: unknown, fallback = new Date().toISOString()): string {
    if (typeof value !== 'string') {
      return fallback;
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
  }

  private createId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  }

  private async ensureDirectoryExists(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  private getConversationsFilePath(): string {
    return join(this.basePath, CONVERSATIONS_FILENAME);
  }
}

export default new AiAssistantConversationsService();
