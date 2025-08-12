export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ToolSpec {
  name: string;
  description?: string;
  parameters: Record<string, any>;
}

export interface CompleteOpts {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  toolChoice?: 'auto' | { type: 'function'; name: string };
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, any>;
}

export interface TextDeltaEvent {
  type: 'text-delta';
  textDelta: string;
}

export interface ToolCallDeltaEvent {
  type: 'tool-call-delta';
  toolCallId: string;
  name: string;
  argumentsDelta: string;
  index: number;
}

export interface UsageEvent {
  type: 'usage';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface DoneEvent {
  type: 'done';
}

export type StreamEvent =
  | TextDeltaEvent
  | ToolCallDeltaEvent
  | UsageEvent
  | DoneEvent;

export interface ProviderResult {
  message: ChatMessage & { toolCalls?: Array<{ id: string; name: string; arguments: any }>; };
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export interface Provider {
  complete(opts: CompleteOpts): Promise<ProviderResult>;
  stream(opts: CompleteOpts): AsyncIterable<StreamEvent>;
}
