import type {
  AiAssistantProvider,
  AiAssistantResolvedSettings
} from './ai-assistant-settings.js';

export interface AiModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiModelCompletion {
  content: string;
  model: string;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      function_call?: {
        name?: string;
        arguments?: unknown;
      };
      tool_calls?: Array<{
        function?: {
          name?: string;
          arguments?: unknown;
        };
      }>;
    };
  }>;
}

interface ChatCompletionErrorResponse {
  error?: {
    message?: string;
  };
  message?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: {
          name?: string;
          args?: Record<string, unknown>;
        };
      }>;
    };
    safetyRatings?: Array<{
      category?: string;
      probability?: string;
    }>;
  }>;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{
    text: string;
  }>;
}

interface AnthropicMessageResponse {
  model?: string;
  content?: Array<{
    type?: string;
    text?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
}

interface NativeDatabaseActionCall {
  name?: string;
  arguments?: Record<string, unknown>;
}

class AiAssistantModelClient {
  async complete(
    settings: AiAssistantResolvedSettings,
    systemPrompt: string,
    messages: AiModelMessage[]
  ): Promise<AiModelCompletion> {
    if (settings.provider === 'gemini') {
      return await this.completeWithGemini(settings.model, settings.apiKey, systemPrompt, messages);
    }

    if (settings.provider === 'anthropic') {
      return await this.completeWithAnthropic(settings.model, settings.apiKey, systemPrompt, messages);
    }

    return await this.completeWithOpenAiCompatible(
      settings.baseUrl,
      settings.model,
      settings.apiKey,
      systemPrompt,
      messages
    );
  }

  getProviderLabel(provider: AiAssistantProvider): string {
    if (provider === 'anthropic') {
      return 'Claude';
    }

    return provider === 'gemini' ? 'Gemini' : 'OpenAI compatible';
  }

  private async completeWithOpenAiCompatible(
    baseUrl: string,
    model: string,
    apiKey: string,
    systemPrompt: string,
    messages: AiModelMessage[]
  ): Promise<AiModelCompletion> {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          ...this.normalizeChatMessages(messages)
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(await this.extractErrorMessage(response));
    }

    const completion = (await response.json()) as ChatCompletionResponse;
    const content = completion.choices?.[0]?.message?.content?.trim();
    const nativeCallJson = this.readOpenAiNativeCallsAsJson(completion);

    if (!content && !nativeCallJson) {
      throw new Error('The AI did not return a valid response.');
    }

    return {
      content: content || nativeCallJson,
      model: completion.model || model
    };
  }

  private async completeWithGemini(
    model: string,
    apiKey: string,
    systemPrompt: string,
    messages: AiModelMessage[]
  ): Promise<AiModelCompletion> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: this.buildGeminiSystemPrompt(systemPrompt) }]
          },
          contents: this.normalizeGeminiMessages(messages),
          toolConfig: {
            functionCallingConfig: {
              mode: 'NONE'
            }
          },
          generationConfig: {
            temperature: 0.2
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(await this.extractErrorMessage(response));
    }

    const completion = (await response.json()) as GeminiGenerateContentResponse;
    const content = completion.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();
    const functionCallJson = this.readGeminiFunctionCallsAsJson(completion);

    if (!content && !functionCallJson) {
      throw new Error(this.buildEmptyGeminiResponseMessage(completion));
    }

    return {
      content: content || functionCallJson,
      model
    };
  }

  private async completeWithAnthropic(
    model: string,
    apiKey: string,
    systemPrompt: string,
    messages: AiModelMessage[]
  ): Promise<AiModelCompletion> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: this.normalizeChatMessages(messages),
        max_tokens: 4096,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(await this.extractErrorMessage(response));
    }

    const completion = (await response.json()) as AnthropicMessageResponse;
    const content = completion.content
      ?.filter((part) => part.type === 'text' || !part.type)
      .map((part) => part.text || '')
      .join('')
      .trim();
    const nativeCallJson = this.readAnthropicNativeCallsAsJson(completion);

    if (!content && !nativeCallJson) {
      throw new Error('The AI did not return a valid response.');
    }

    return {
      content: content || nativeCallJson,
      model: completion.model || model
    };
  }

  private normalizeChatMessages(messages: AiModelMessage[]): AiModelMessage[] {
    const normalizedMessages: AiModelMessage[] = [];

    for (const message of messages) {
      const content = message.content.trim();
      if (!content) {
        continue;
      }

      if (normalizedMessages.length === 0 && message.role === 'assistant') {
        continue;
      }

      const previousMessage = normalizedMessages[normalizedMessages.length - 1];

      if (previousMessage?.role === message.role) {
        previousMessage.content = `${previousMessage.content}\n\n${content}`;
        continue;
      }

      normalizedMessages.push({
        role: message.role,
        content
      });
    }

    return normalizedMessages;
  }

  private normalizeGeminiMessages(messages: AiModelMessage[]): GeminiContent[] {
    const normalizedMessages: GeminiContent[] = [];

    for (const message of messages) {
      const content = message.content.trim();
      if (!content) {
        continue;
      }

      const role = message.role === 'assistant' ? 'model' : 'user';
      if (normalizedMessages.length === 0 && role === 'model') {
        continue;
      }

      const previousMessage = normalizedMessages[normalizedMessages.length - 1];
      if (previousMessage?.role === role) {
        previousMessage.parts[0].text = `${previousMessage.parts[0].text}\n\n${content}`;
        continue;
      }

      normalizedMessages.push({
        role,
        parts: [{ text: content }]
      });
    }

    const lastMessage = normalizedMessages[normalizedMessages.length - 1];
    if (lastMessage?.role === 'model') {
      normalizedMessages.push({
        role: 'user',
        parts: [{ text: 'Continue.' }]
      });
    }

    return normalizedMessages;
  }

  private buildGeminiSystemPrompt(systemPrompt: string): string {
    return [
      systemPrompt,
      'Gemini transport rule: return plain text only. Do not emit native call parts. When DBOLT asks for database actions, write the database action JSON as text.'
    ].join('\n\n');
  }

  private readGeminiFunctionCallsAsJson(completion: GeminiGenerateContentResponse): string {
    const calls = completion.candidates?.[0]?.content?.parts
      ?.map((part) => part.functionCall)
      .filter((call): call is { name?: string; args?: Record<string, unknown> } => Boolean(call?.name))
      .map((call) => ({
        name: call.name,
        arguments: call.args || {}
      })) || [];

    return this.buildDatabaseActionsJson(calls);
  }

  private readOpenAiNativeCallsAsJson(completion: ChatCompletionResponse): string {
    const message = completion.choices?.[0]?.message;
    const calls: NativeDatabaseActionCall[] = [];

    for (const toolCall of message?.tool_calls || []) {
      if (!toolCall.function?.name) {
        continue;
      }

      calls.push({
        name: toolCall.function.name,
        arguments: this.parseNativeCallArguments(toolCall.function.arguments)
      });
    }

    if (message?.function_call?.name) {
      calls.push({
        name: message.function_call.name,
        arguments: this.parseNativeCallArguments(message.function_call.arguments)
      });
    }

    return this.buildDatabaseActionsJson(calls);
  }

  private readAnthropicNativeCallsAsJson(completion: AnthropicMessageResponse): string {
    const calls = completion.content
      ?.filter((part) => part.type === 'tool_use' && part.name)
      .map((part) => ({
        name: part.name,
        arguments: part.input || {}
      })) || [];

    return this.buildDatabaseActionsJson(calls);
  }

  private buildDatabaseActionsJson(calls: NativeDatabaseActionCall[]): string {
    if (calls.length === 0) {
      return '';
    }

    return JSON.stringify({
      databaseActions: calls.map((call) => ({
        name: call.name,
        arguments: call.arguments || {}
      }))
    });
  }

  private parseNativeCallArguments(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    if (typeof value !== 'string' || !value.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch (_error: unknown) {
      return {};
    }
  }

  private buildEmptyGeminiResponseMessage(completion: GeminiGenerateContentResponse): string {
    const candidate = completion.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const safetyCategories = candidate?.safetyRatings
      ?.filter((rating) => rating.probability && rating.probability !== 'NEGLIGIBLE')
      .map((rating) => `${rating.category || 'unknown'}:${rating.probability}`)
      .join(', ');

    if (finishReason) {
      return safetyCategories
        ? `The AI did not return a valid response. Gemini finish reason: ${finishReason}. Safety ratings: ${safetyCategories}.`
        : `The AI did not return a valid response. Gemini finish reason: ${finishReason}.`;
    }

    return 'The AI did not return a valid response.';
  }

  private async extractErrorMessage(response: Response): Promise<string> {
    const fallbackMessage = `Failed to call the AI provider (${response.status}).`;
    const responseText = await response.text().catch(() => '');

    if (!responseText) {
      return fallbackMessage;
    }

    try {
      const parsed = JSON.parse(responseText) as ChatCompletionErrorResponse;
      return parsed.error?.message || parsed.message || fallbackMessage;
    } catch (_error: unknown) {
      return responseText.slice(0, 500) || fallbackMessage;
    }
  }
}

export default new AiAssistantModelClient();
