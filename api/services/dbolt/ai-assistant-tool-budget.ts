export interface AiAssistantToolBudgetState {
  maxApiCallsPerMessage: number;
  maxToolCalls: number;
  maxToolCallsPerIteration: number;
  maxToolResultChars: number;
  maxToolTranscriptChars: number;
  maxCurrentSqlChars: number;
  maxPromptChars: number;
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
  maxCurrentSqlChars?: number;
  maxPromptChars?: number;
}

export interface AiAssistantPromptAllocation {
  currentSqlChars: number;
  transcriptChars: number;
}

const SECTION_SEPARATOR = '\n\n';
const TRANSCRIPT_OMISSION_MARKER = '...earlier read-only results omitted by the AI budget...';
const TEXT_TRUNCATION_MARKER = '\n...content truncated by the AI budget...';
const CURRENT_SQL_CHARS_CEILING = 18000;
const PROMPT_CHARS_FLOOR = 32000;
const PROMPT_CHARS_TRANSCRIPT_FACTOR = 3;

class AiAssistantToolBudgetService {
  createState(input: AiAssistantToolBudgetInput = {}): AiAssistantToolBudgetState {
    const maxToolTranscriptChars = this.normalizeInteger(input.maxToolTranscriptChars, 18000, 4000, 100000);

    return {
      maxApiCallsPerMessage: this.normalizeInteger(input.maxApiCallsPerMessage, 4, 1, 10),
      maxToolCalls: this.normalizeInteger(input.maxDatabaseRequestsPerMessage, 4, 0, 20),
      maxToolCallsPerIteration: this.normalizeInteger(input.maxDatabaseRequestsPerApiCall, 2, 1, 5),
      maxToolResultChars: this.normalizeInteger(input.maxToolResultChars, 9000, 1000, 50000),
      maxToolTranscriptChars,
      maxCurrentSqlChars: this.normalizeInteger(
        input.maxCurrentSqlChars,
        Math.min(CURRENT_SQL_CHARS_CEILING, maxToolTranscriptChars),
        1000,
        40000
      ),
      maxPromptChars: this.normalizeInteger(
        input.maxPromptChars,
        Math.max(PROMPT_CHARS_FLOOR, maxToolTranscriptChars * PROMPT_CHARS_TRANSCRIPT_FACTOR),
        16000,
        400000
      ),
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
    if (maxChars <= 0) {
      return '';
    }

    if (value.length <= maxChars) {
      return value;
    }

    if (maxChars <= TEXT_TRUNCATION_MARKER.length) {
      return value.slice(0, maxChars);
    }

    return `${value.slice(0, maxChars - TEXT_TRUNCATION_MARKER.length)}${TEXT_TRUNCATION_MARKER}`;
  }

  allocatePromptSpace(
    availableChars: number,
    currentSqlChars: number,
    transcriptChars: number
  ): AiAssistantPromptAllocation {
    const available = Math.max(0, availableChars);

    if (currentSqlChars + transcriptChars <= available) {
      return { currentSqlChars, transcriptChars };
    }

    const half = Math.floor(available / 2);

    if (currentSqlChars <= half) {
      return {
        currentSqlChars,
        transcriptChars: Math.max(0, available - currentSqlChars)
      };
    }

    if (transcriptChars <= half) {
      return {
        currentSqlChars: Math.max(0, available - transcriptChars),
        transcriptChars
      };
    }

    return {
      currentSqlChars: half,
      transcriptChars: available - half
    };
  }

  compactTranscript(
    sections: string[],
    state: AiAssistantToolBudgetState,
    maxChars?: number
  ): string {
    const limit = Math.min(
      Number.isFinite(maxChars as number) ? Math.max(0, maxChars as number) : state.maxToolTranscriptChars,
      state.maxToolTranscriptChars
    );

    if (limit <= 0 || sections.length === 0) {
      return '';
    }

    const transcript = sections.join(SECTION_SEPARATOR);

    if (transcript.length <= limit) {
      return transcript;
    }

    if (sections.length === 1) {
      return this.limitText(sections[0], limit);
    }

    return this.buildBoundedTranscript(sections, limit);
  }

  private buildBoundedTranscript(sections: string[], limit: number): string {
    const recent: string[] = [];
    let used = 0;

    for (let index = sections.length - 1; index >= 1; index--) {
      const cost = sections[index].length + SECTION_SEPARATOR.length;

      if (used + cost > limit) {
        break;
      }

      recent.unshift(sections[index]);
      used += cost;
    }

    const droppedSections = sections.length - 1 - recent.length;
    const markerCost = droppedSections > 0
      ? TRANSCRIPT_OMISSION_MARKER.length + SECTION_SEPARATOR.length
      : 0;
    const headBudget = limit - used - markerCost - SECTION_SEPARATOR.length;
    const head = headBudget > 0 ? this.limitText(sections[0], headBudget) : '';
    const parts = [
      ...(head ? [head] : []),
      ...(droppedSections > 0 || !head ? [TRANSCRIPT_OMISSION_MARKER] : []),
      ...recent
    ];

    return parts.join(SECTION_SEPARATOR).slice(0, limit);
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
