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
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface AnthropicMessageResponse {
  model?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
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
          ...messages
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(await this.extractErrorMessage(response));
    }

    const completion = (await response.json()) as ChatCompletionResponse;
    const content = completion.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('The AI did not return a valid response.');
    }

    return {
      content,
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
            parts: [{ text: systemPrompt }]
          },
          contents: messages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }]
          })),
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

    if (!content) {
      throw new Error('The AI did not return a valid response.');
    }

    return {
      content,
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
        messages: this.normalizeAnthropicMessages(messages),
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

    if (!content) {
      throw new Error('The AI did not return a valid response.');
    }

    return {
      content,
      model: completion.model || model
    };
  }

  private normalizeAnthropicMessages(messages: AiModelMessage[]): AiModelMessage[] {
    const normalizedMessages: AiModelMessage[] = [];

    for (const message of messages) {
      if (normalizedMessages.length === 0 && message.role === 'assistant') {
        continue;
      }

      const previousMessage = normalizedMessages[normalizedMessages.length - 1];

      if (previousMessage?.role === message.role) {
        previousMessage.content = `${previousMessage.content}\n\n${message.content}`;
        continue;
      }

      normalizedMessages.push({ ...message });
    }

    return normalizedMessages;
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
