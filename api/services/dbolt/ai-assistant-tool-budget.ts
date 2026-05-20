export interface AiAssistantToolBudgetState {
  maxApiCallsPerMessage: number;
  maxToolCalls: number;
  maxToolCallsPerIteration: number;
  maxToolResultChars: number;
  maxToolTranscriptChars: number;
  apiCallsUsed: number;
  iterationsUsed: number;
  toolCallsUsed: number;
}

export interface AiAssistantToolBudgetInput {
  maxApiCallsPerMessage?: number;
  maxDatabaseRequestsPerMessage?: number;
  maxDatabaseRequestsPerApiCall?: number;
  maxToolResultChars?: number;
  maxToolTranscriptChars?: number;
}

class AiAssistantToolBudgetService {
  createState(input: AiAssistantToolBudgetInput = {}): AiAssistantToolBudgetState {
    return {
      maxApiCallsPerMessage: this.normalizeInteger(input.maxApiCallsPerMessage, 4, 1, 10),
      maxToolCalls: this.normalizeInteger(input.maxDatabaseRequestsPerMessage, 4, 0, 20),
      maxToolCallsPerIteration: this.normalizeInteger(input.maxDatabaseRequestsPerApiCall, 2, 1, 5),
      maxToolResultChars: this.normalizeInteger(input.maxToolResultChars, 9000, 1000, 50000),
      maxToolTranscriptChars: this.normalizeInteger(input.maxToolTranscriptChars, 18000, 4000, 100000),
      apiCallsUsed: 0,
      iterationsUsed: 0,
      toolCallsUsed: 0
    };
  }

  beginIteration(state: AiAssistantToolBudgetState): boolean {
    if (state.iterationsUsed >= state.maxApiCallsPerMessage) {
      return false;
    }

    state.iterationsUsed += 1;
    return true;
  }

  getRemainingApiCalls(state: AiAssistantToolBudgetState): number {
    return Math.max(0, state.maxApiCallsPerMessage - state.apiCallsUsed);
  }

  canCallModel(state: AiAssistantToolBudgetState): boolean {
    return this.getRemainingApiCalls(state) > 0;
  }

  registerApiCall(state: AiAssistantToolBudgetState): void {
    state.apiCallsUsed += 1;
  }

  getRemainingToolCalls(state: AiAssistantToolBudgetState): number {
    return Math.max(0, state.maxToolCalls - state.toolCallsUsed);
  }

  canRunTool(state: AiAssistantToolBudgetState): boolean {
    return this.getRemainingToolCalls(state) > 0;
  }

  registerToolCall(state: AiAssistantToolBudgetState): void {
    state.toolCallsUsed += 1;
  }

  limitText(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
      return value;
    }

    return `${value.slice(0, maxChars)}\n...content truncated by the AI budget...`;
  }

  compactTranscript(sections: string[], state: AiAssistantToolBudgetState): string {
    const transcript = sections.join('\n\n');

    if (transcript.length <= state.maxToolTranscriptChars) {
      return transcript;
    }

    return this.limitText(transcript.slice(-state.maxToolTranscriptChars), state.maxToolTranscriptChars);
  }

  private normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      return fallback;
    }

    return Math.min(Math.max(Math.floor(numberValue), min), max);
  }
}

export default new AiAssistantToolBudgetService();
