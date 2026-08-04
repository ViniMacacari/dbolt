import { AiAssistantProvider } from './ai-assistant.model'

export interface AiAssistantModelOption {
  [key: string]: string | number
  label: string
  value: string
}

export const OPENAI_MODEL_OPTIONS: AiAssistantModelOption[] = [
  { label: 'GPT-5.5', value: 'gpt-5.5' },
  { label: 'GPT-5.4', value: 'gpt-5.4' },
  { label: 'GPT-5.4 mini', value: 'gpt-5.4-mini' },
  { label: 'GPT-5.4 nano', value: 'gpt-5.4-nano' },
  { label: 'GPT-5.2', value: 'gpt-5.2' },
  { label: 'GPT-5.1', value: 'gpt-5.1' },
  { label: 'GPT-5', value: 'gpt-5' },
  { label: 'GPT-5 mini', value: 'gpt-5-mini' },
  { label: 'GPT-5 nano', value: 'gpt-5-nano' },
  { label: 'GPT-4.1 mini', value: 'gpt-4.1-mini' },
  { label: 'GPT-4.1', value: 'gpt-4.1' },
  { label: 'GPT-4.1 nano', value: 'gpt-4.1-nano' },
  { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
  { label: 'GPT-4o', value: 'gpt-4o' },
  { label: 'o4-mini', value: 'o4-mini' }
]

export const GEMINI_MODEL_OPTIONS: AiAssistantModelOption[] = [
  { label: 'Gemini 3.5 Flash', value: 'gemini-3.5-flash' },
  { label: 'Gemini 3.1 Pro Preview', value: 'gemini-3.1-pro-preview' },
  { label: 'Gemini 3.1 Flash-Lite', value: 'gemini-3.1-flash-lite' },
  { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
  { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  { label: 'Gemini 2.5 Flash-Lite', value: 'gemini-2.5-flash-lite' }
]

export const ANTHROPIC_MODEL_OPTIONS: AiAssistantModelOption[] = [
  { label: 'Claude Opus 4.7', value: 'claude-opus-4-7' },
  { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
  { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' }
]

export function staticModelOptionsForProvider(
  provider: AiAssistantProvider,
  currentModel: string = ''
): AiAssistantModelOption[] {
  if (provider === 'openai') return [...OPENAI_MODEL_OPTIONS]
  if (provider === 'gemini') return [...GEMINI_MODEL_OPTIONS]
  if (provider === 'anthropic') return [...ANTHROPIC_MODEL_OPTIONS]

  return currentModel ? [modelOption(currentModel)] : []
}

export function modelOption(model: string): AiAssistantModelOption {
  return {
    label: formatAiModelLabel(model),
    value: model
  }
}

export function formatAiModelLabel(model: string): string {
  return model
    .split('-')
    .map((part) => part.toLowerCase() === 'gpt' ? 'GPT' : part)
    .join(' ')
}
