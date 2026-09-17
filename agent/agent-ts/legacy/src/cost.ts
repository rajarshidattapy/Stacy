// Model pricing table extracted from harness-docs/Model Pricing.md
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWritePerMillion: number;
  cacheReadPerMillion: number;
  webSearchPerRequest: number;
}

export const PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5-20251001": {
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    cacheWritePerMillion: 1.25,
    cacheReadPerMillion: 0.1,
    webSearchPerRequest: 0.01,
  },
  "claude-sonnet-4-6": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
    webSearchPerRequest: 0.01,
  },
  "claude-opus-4-7": {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.5,
    webSearchPerRequest: 0.01,
  },
  // OpenAI approximate pricing
  "gpt-4.1": {
    inputPerMillion: 2.0,
    outputPerMillion: 8.0,
    cacheWritePerMillion: 0.5,
    cacheReadPerMillion: 0.5,
    webSearchPerRequest: 0.01,
  },
  "gpt-4.1-mini": {
    inputPerMillion: 0.4,
    outputPerMillion: 1.6,
    cacheWritePerMillion: 0.1,
    cacheReadPerMillion: 0.1,
    webSearchPerRequest: 0.01,
  },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens = 0,
  cacheReadTokens = 0,
  webSearchRequests = 0,
): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  const cost =
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion +
    (cacheCreationTokens / 1_000_000) * pricing.cacheWritePerMillion +
    (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion +
    webSearchRequests * pricing.webSearchPerRequest;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export interface UsageRecord {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  web_search_requests?: number;
}

export class CostTracker {
  totalCostUsd = 0;
  totalInputTokens = 0;
  totalOutputTokens = 0;
  totalCacheReadTokens = 0;
  totalCacheCreationTokens = 0;
  readonly modelUsage: Record<string, { input: number; output: number; cost: number }> = {};
  readonly turnCosts: number[] = [];

  record(model: string, usage: UsageRecord): number {
    const inputTok = usage.input_tokens ?? 0;
    const outputTok = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheCreate = usage.cache_creation_input_tokens ?? 0;
    const webSearch = usage.web_search_requests ?? 0;

    const cost = calculateCost(model, inputTok, outputTok, cacheCreate, cacheRead, webSearch);
    this.totalCostUsd += cost;
    this.totalInputTokens += inputTok;
    this.totalOutputTokens += outputTok;
    this.totalCacheReadTokens += cacheRead;
    this.totalCacheCreationTokens += cacheCreate;

    if (!this.modelUsage[model]) {
      this.modelUsage[model] = { input: 0, output: 0, cost: 0 };
    }
    this.modelUsage[model].input += inputTok;
    this.modelUsage[model].output += outputTok;
    this.modelUsage[model].cost += cost;

    this.turnCosts.push(cost);
    return cost;
  }

  formatTurn(turnCost: number): string {
    return `Turn: $${turnCost.toFixed(4)} | Session: $${this.totalCostUsd.toFixed(4)}`;
  }

  checkBudget(maxCostUsd: number, maxTokens: number): { exceeded: boolean; warning: boolean; message: string } {
    const totalTokens = this.totalInputTokens + this.totalOutputTokens;
    if (this.totalCostUsd >= maxCostUsd) {
      return {
        exceeded: true,
        warning: false,
        message: `Budget exceeded: $${this.totalCostUsd.toFixed(4)} >= $${maxCostUsd}`,
      };
    }
    if (totalTokens >= maxTokens) {
      return {
        exceeded: true,
        warning: false,
        message: `Token limit exceeded: ${totalTokens.toLocaleString()} >= ${maxTokens.toLocaleString()}`,
      };
    }
    const pct = this.totalCostUsd / maxCostUsd;
    if (pct >= 0.8) {
      return {
        exceeded: false,
        warning: true,
        message: `Budget warning: $${this.totalCostUsd.toFixed(4)} (${Math.round(pct * 100)}% of $${maxCostUsd})`,
      };
    }
    return { exceeded: false, warning: false, message: "" };
  }

  summary() {
    return {
      totalCostUsd: this.totalCostUsd,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCacheReadTokens: this.totalCacheReadTokens,
      totalCacheCreationTokens: this.totalCacheCreationTokens,
      modelUsage: this.modelUsage,
    };
  }
}
