export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type ToolSpec = {
  name: string;
  description?: string;
  // JSON Schema object for parameters
  parameters: Record<string, any>;
};

export type StreamEvent =
  | { type: "text-delta"; value: string }
  | { type: "tool-call-delta"; value: { id: string; name?: string; argumentsDelta?: string } }
  | { type: "usage"; value: { promptTokens: number; completionTokens: number } }
  | { type: "done" };

export type CompleteOpts = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  toolChoice?: "auto" | { type: "function"; name: string };
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, any>;
};

export interface Provider {
  name: "gemini" | "openai";
  complete(opts: CompleteOpts): Promise<{
    text?: string;
    toolCalls?: { id: string; name: string; arguments: string }[];
    usage?: { promptTokens: number; completionTokens: number };
  }>;
  stream(opts: CompleteOpts): AsyncIterable<StreamEvent>;
}
