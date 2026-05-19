import AiAssistantSettings from './ai-assistant-settings.js';
import AiAssistantReadonlyDatabase, {
  type AiReadonlyDatabaseContext
} from './ai-assistant-readonly-database.js';

export interface AiAssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiAssistantChatRequest {
  messages: AiAssistantChatMessage[];
  readonlyContext?: AiReadonlyDatabaseContext;
}

export interface AiAssistantChatResult {
  message: string;
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

class AiAssistantService {
  async chat(request: AiAssistantChatRequest): Promise<AiAssistantChatResult> {
    const messages = this.normalizeMessages(request.messages);
    const settings = await AiAssistantSettings.getResolvedSettings();
    const readonlyLookupContext = await AiAssistantReadonlyDatabase.buildPromptContext(
      request.readonlyContext,
      messages.filter((message) => message.role === 'user')
    );
    const systemPrompt = [
      this.getSystemPrompt(),
      readonlyLookupContext
    ].filter(Boolean).join('\n\n');

    if (settings.provider === 'gemini') {
      return await this.chatWithGemini(settings.model, settings.apiKey, systemPrompt, messages);
    }

    return await this.chatWithOpenAiCompatible(
      settings.baseUrl,
      settings.model,
      settings.apiKey,
      systemPrompt,
      messages
    );
  }

  private async chatWithOpenAiCompatible(
    baseUrl: string,
    model: string,
    apiKey: string,
    systemPrompt: string,
    messages: AiAssistantChatMessage[]
  ): Promise<AiAssistantChatResult> {
    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        ...messages
      ],
      temperature: 0.2
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await this.extractErrorMessage(response));
    }

    const completion = (await response.json()) as ChatCompletionResponse;
    const message = completion.choices?.[0]?.message?.content?.trim();

    if (!message) {
      throw new Error('A IA não retornou uma resposta válida.');
    }

    return {
      message,
      model: completion.model || model
    };
  }

  private async chatWithGemini(
    model: string,
    apiKey: string,
    systemPrompt: string,
    messages: AiAssistantChatMessage[]
  ): Promise<AiAssistantChatResult> {
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
    const message = completion.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!message) {
      throw new Error('A IA não retornou uma resposta válida.');
    }

    return {
      message,
      model
    };
  }

  private normalizeMessages(messages: AiAssistantChatMessage[] = []): AiAssistantChatMessage[] {
    const maxMessages = 6;
    const normalizedMessages = messages
      .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
      .map((message) => ({
        role: message.role,
        content: this.truncateText(
          String(message.content || '').trim(),
          this.getMessagePromptLimit(message.role)
        )
      }))
      .filter((message) => message.content.length > 0);

    if (normalizedMessages.length === 0) {
      throw new Error('Mensagem do chat não informada.');
    }

    return normalizedMessages.slice(-maxMessages);
  }

  private getSystemPrompt(): string {
    return [
      'Você é o assistente de IA do DBOLT Database Manager.',
      'Responda em português do Brasil, com foco em SQL, modelagem, investigação de schema e produtividade.',
      'Quando houver dados readonly consultados pelo DBOLT, trate-os como a fonte factual da resposta.',
      'Não invente tabelas, colunas ou resultados que não estejam nos dados consultados.',
      'Não solicite senhas, tokens ou chaves da API.',
      'Se sugerir SQL destrutivo ou de alteração, deixe o risco explícito e prefira alternativas de leitura.'
    ].join(' ');
  }

  private truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength)}...`;
  }

  private getMessagePromptLimit(role: 'user' | 'assistant'): number {
    return role === 'assistant' ? 900 : 1400;
  }

  private async extractErrorMessage(response: Response): Promise<string> {
    const fallbackMessage = `Falha ao chamar a IA (${response.status}).`;
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

export default new AiAssistantService();
