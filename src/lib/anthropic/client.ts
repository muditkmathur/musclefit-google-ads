import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing required env var: ANTHROPIC_API_KEY");
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export const OVERVIEW_MODEL = "claude-sonnet-5" as const;
