import AiAssistantAgent, {
  type AiAssistantAgentChatMessage,
  type AiAssistantProgressReporter
} from './ai-assistant-agent.js';
import AiAssistantSettings from './ai-assistant-settings.js';
import DatabaseMemory from './database-memory.js';
import type { AiReadonlyDatabaseContext } from './ai-assistant-readonly-database.js';
import type { DatabaseMemoryScope } from '../../utils/database-memory-storage.js';

export interface AiAssistantChatMessage extends AiAssistantAgentChatMessage { }

export interface AiAssistantChatRequest {
  messages: AiAssistantChatMessage[];
  readonlyContext?: AiReadonlyDatabaseContext;
  currentSql?: string;
  autoApplyCurrentSql?: boolean;
  appLanguage?: string;
  useDatabaseMemory?: boolean;
  databaseMemoryScope?: DatabaseMemoryScope;
}

export interface AiAssistantChatResult {
  message: string;
  model: string;
}

class AiAssistantService {
  async chat(
    request: AiAssistantChatRequest,
    reportProgress?: AiAssistantProgressReporter
  ): Promise<AiAssistantChatResult> {
    const settings = await AiAssistantSettings.getResolvedSettings();
    const databaseMemoryPrompt = request.useDatabaseMemory === false
      ? ''
      : await DatabaseMemory.buildPromptBlock(request.databaseMemoryScope).catch(() => '');

    return await AiAssistantAgent.chat(
      { ...request, databaseMemoryPrompt },
      settings,
      reportProgress
    );
  }
}

export default new AiAssistantService();
