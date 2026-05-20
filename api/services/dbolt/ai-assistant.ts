import AiAssistantAgent, {
  type AiAssistantAgentChatMessage
} from './ai-assistant-agent.js';
import AiAssistantSettings from './ai-assistant-settings.js';
import type { AiReadonlyDatabaseContext } from './ai-assistant-readonly-database.js';

export interface AiAssistantChatMessage extends AiAssistantAgentChatMessage { }

export interface AiAssistantChatRequest {
  messages: AiAssistantChatMessage[];
  readonlyContext?: AiReadonlyDatabaseContext;
  appLanguage?: string;
}

export interface AiAssistantChatResult {
  message: string;
  model: string;
}

class AiAssistantService {
  async chat(request: AiAssistantChatRequest): Promise<AiAssistantChatResult> {
    const settings = await AiAssistantSettings.getResolvedSettings();
    return await AiAssistantAgent.chat(request, settings);
  }
}

export default new AiAssistantService();
