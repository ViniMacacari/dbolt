export interface AiAssistantToolBudgetState {
  maxIterations: number;
  maxToolCalls: number;
  maxToolCallsPerIteration: number;
  maxToolResultChars: number;
  maxToolTranscriptChars: number;
  iterationsUsed: number;
  toolCallsUsed: number;
}

class AiAssistantToolBudgetService {
  createState(): AiAssistantToolBudgetState {
    return {
      maxIterations: 4,
      maxToolCalls: 4,
      maxToolCallsPerIteration: 2,
      maxToolResultChars: 9000,
      maxToolTranscriptChars: 18000,
      iterationsUsed: 0,
      toolCallsUsed: 0
    };
  }

  beginIteration(state: AiAssistantToolBudgetState): boolean {
    if (state.iterationsUsed >= state.maxIterations) {
      return false;
    }

    state.iterationsUsed += 1;
    return true;
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

    return `${value.slice(0, maxChars)}\n...conteudo truncado pelo orçamento da IA...`;
  }

  compactTranscript(sections: string[], state: AiAssistantToolBudgetState): string {
    const transcript = sections.join('\n\n');

    if (transcript.length <= state.maxToolTranscriptChars) {
      return transcript;
    }

    return this.limitText(transcript.slice(-state.maxToolTranscriptChars), state.maxToolTranscriptChars);
  }
}

export default new AiAssistantToolBudgetService();
