import { describe, expect, it } from "@effect/vitest";

import {
  builtinRateTable,
  cacheSavingsUsd,
  createOverrideRateTable,
  lookupRate,
  parseRateTable,
  priceUsage,
  withBuiltinRates,
} from "./usagePricing.ts";

const rate = (input: number, cacheRead?: number) => ({
  input_cost_per_token: input,
  output_cost_per_token: input * 5,
  ...(cacheRead === undefined ? {} : { cache_read_input_token_cost: cacheRead }),
});

describe("usage pricing", () => {
  const totals = {
    uncachedInputTokens: 1_000_000,
    cachedInputTokens: 1_000_000,
    cacheCreationTokens: 1_000_000,
    outputTokens: 1_000_000,
    reasoningTokens: 500_000,
  };
  const record = (model: string, reportedCostUsd: number | null = null, fast = false) => ({
    model,
    totals,
    reportedCostUsd,
    fast,
  });

  it("uses custom token rates ahead of public and provider-reported costs", () => {
    const table = parseRateTable({ "example-model": rate(1) });
    const overrides = createOverrideRateTable({
      "example-model": {
        inputCostPerMillionTokens: 2,
        outputCostPerMillionTokens: 8,
        cacheReadCostPerMillionTokens: 0.5,
        cacheWriteCostPerMillionTokens: 3,
      },
    });

    for (const reportedCostUsd of [null, 99]) {
      expect(priceUsage(table, record("example-model", reportedCostUsd), overrides)).toEqual({
        costUsd: 13.5,
        costSource: "modelPriced",
      });
    }
    expect(cacheSavingsUsd(table, record("example-model"), overrides)).toBe(1.5);
  });

  it("prices unknown models offline and uses input prices for omitted cache rates", () => {
    const table = parseRateTable({});
    const overrides = createOverrideRateTable({
      "example-model": { inputCostPerMillionTokens: 2, outputCostPerMillionTokens: 8 },
    });

    expect(priceUsage(table, record("example-model"), overrides)).toEqual({
      costUsd: 14,
      costSource: "modelPriced",
    });
    expect(cacheSavingsUsd(table, record("example-model"), overrides)).toBe(0);
  });

  it("preserves explicit zero rates and matches only the exact trimmed model ID", () => {
    const table = parseRateTable({});
    const overrides = createOverrideRateTable({
      " vendor/example-model[1m] ": {
        inputCostPerMillionTokens: 0,
        outputCostPerMillionTokens: 0,
      },
    });
    expect(priceUsage(table, record(" vendor/example-model[1m] ", 99), overrides)).toEqual({
      costUsd: 0,
      costSource: "modelPriced",
    });
    for (const model of [
      "example-model[1m]",
      "vendor/example-model",
      "vendor/Example-model[1m]",
      "other/example-model[1m]",
    ]) {
      expect(priceUsage(table, record(model), overrides).costSource).toBe("unpriced");
      expect(priceUsage(table, record(model, 99), overrides)).toEqual({
        costUsd: 99,
        costSource: "providerReported",
      });
    }
  });

  it("prices fast-mode requests at the model's published fast multiple", () => {
    const table = parseRateTable({
      "claude-opus-5-5": { ...rate(4e-6, 2e-7), provider_specific_entry: { fast: 2, us: 1.1 } },
      "claude-fable-5-1": { ...rate(1e-5, 2.5e-7), provider_specific_entry: { us: 1.1 } },
    });
    const overrides = createOverrideRateTable({
      "claude-opus-5-5": { inputCostPerMillionTokens: 4, outputCostPerMillionTokens: 20 },
    });
    const cost = (model: string, fast: boolean, custom?: typeof overrides) =>
      priceUsage(table, record(model, null, fast), custom).costUsd;

    expect(cost("claude-opus-5-5", true)).toBeCloseTo(2 * cost("claude-opus-5-5", false));
    expect(cacheSavingsUsd(table, record("claude-opus-5-5", null, true))).toBeCloseTo(
      2 * cacheSavingsUsd(table, record("claude-opus-5-5")),
    );
    // No published fast tier, and custom prices, both stay at the standard rate.
    expect(cost("claude-fable-5-1", true)).toBe(cost("claude-fable-5-1", false));
    expect(cost("claude-opus-5-5", true, overrides)).toBe(
      cost("claude-opus-5-5", false, overrides),
    );
  });

  it("keeps the canonical Fable rate separate from DeepInfra in either order", () => {
    const canonical = ["claude-fable-5", rate(1e-5, 1e-6)] as const;
    const deepInfra = ["deepinfra/anthropic/claude-fable-5", rate(1e-5)] as const;

    for (const entries of [
      [canonical, deepInfra],
      [deepInfra, canonical],
    ]) {
      const table = parseRateTable(Object.fromEntries(entries));

      expect(lookupRate(table, "claude-fable-5")?.cacheReadCostPerToken).toBe(1e-6);
      expect(lookupRate(table, "deepinfra/anthropic/claude-fable-5")?.cacheReadCostPerToken).toBe(
        1e-5,
      );
      expect(lookupRate(table, "other/claude-fable-5")).toBeNull();
    }
  });

  it("prices a bracketed context-tier variant at the base model's rate", () => {
    const table = parseRateTable({ "claude-fable-5-1": rate(1e-5, 2.5e-7) });

    expect(lookupRate(table, "claude-fable-5-1[1m]")).toEqual(
      lookupRate(table, "claude-fable-5-1"),
    );
    expect(lookupRate(table, "anthropic/Claude-Fable-5-1[1m]")).toBeNull();
  });

  it("adds a bare alias when every qualified entry has the same rate", () => {
    const table = parseRateTable({
      "provider-a/example-model": rate(1),
      "provider-b/example-model": rate(1),
    });

    expect(lookupRate(table, "example-model")).toEqual(
      lookupRate(table, "provider-a/example-model"),
    );
  });

  it("leaves an ambiguous bare name unpriced", () => {
    const table = parseRateTable({
      "provider-a/example-model": rate(1),
      "provider-b/example-model": rate(3),
    });

    expect(lookupRate(table, "provider-a/example-model")?.inputCostPerToken).toBe(1);
    expect(lookupRate(table, "provider-b/example-model")?.inputCostPerToken).toBe(3);
    expect(lookupRate(table, "example-model")).toBeNull();
  });

  it("prices contributor-tier Muse Spark models at API rates", () => {
    const table = withBuiltinRates(parseRateTable({}));

    // 1M tokens each at $0.10 in / $0.20 out / $0.002 cached / $0.10 creation.
    const priced = priceUsage(table, "muse-spark-1.3-contributor", totals, null);
    expect(priced.costSource).toBe("modelPriced");
    expect(priced.costUsd).toBeCloseTo(0.1 + 0.002 + 0.1 + 0.2, 12);
    expect(priceUsage(table, "muse-spark-1.2-contributor", totals, null)?.costSource).toBe(
      "modelPriced",
    );
    expect(cacheSavingsUsd(table, "muse-spark-1.3-contributor", totals)).toBeCloseTo(
      1_000_000 * ((0.1 - 0.002) / 1_000_000),
      12,
    );
  });

  it("lets fetched rates win over built-in ones", () => {
    const table = withBuiltinRates(parseRateTable({ "muse-spark-1.3-contributor": rate(7) }));

    expect(lookupRate(table, "muse-spark-1.3-contributor")?.inputCostPerToken).toBe(7);
    expect(builtinRateTable().get("muse-spark-1.3-contributor")?.inputCostPerToken).toBe(
      0.1 / 1_000_000,
    );
  });

  it("prices free-tier models at their paid counterpart's rate", () => {
    const table = withBuiltinRates(parseRateTable({ "deepseek-v4-flash": rate(1) }));

    expect(lookupRate(table, "muse-spark-1.3-contributor-free")).toEqual(
      lookupRate(table, "muse-spark-1.3-contributor"),
    );
    expect(lookupRate(table, "deepseek-v4-flash-free")).toEqual(
      lookupRate(table, "deepseek-v4-flash"),
    );

    // Same 1M-token totals as the contributor test: $0.402, not $0.00.
    const priced = priceUsage(table, "muse-spark-1.3-contributor-free", totals, null);
    expect(priced.costSource).toBe("modelPriced");
    expect(priced.costUsd).toBeCloseTo(0.1 + 0.002 + 0.1 + 0.2, 12);
  });

  it("prefers an explicit free-tier rate over the paid fallback", () => {
    const table = parseRateTable({
      "example-model": rate(1),
      "example-model-free": rate(9),
    });

    expect(lookupRate(table, "example-model-free")?.inputCostPerToken).toBe(9);
    expect(lookupRate(table, "other-model-free")).toBeNull();
  });

  it("prices aliased models at their target's rate, including the free variant", () => {
    const table = parseRateTable({
      "zai/glm-5.3-flash": {
        input_cost_per_token: 0.15e-6,
        output_cost_per_token: 0.5e-6,
        cache_read_input_token_cost: 0.03e-6,
      },
    });

    // x-preview-f is served free through OpenCode; both spellings price at
    // GLM 5.3 Flash rates rather than showing unpriced.
    expect(lookupRate(table, "x-preview-f")).toEqual(lookupRate(table, "zai/glm-5.3-flash"));
    expect(lookupRate(table, "x-preview-f-free")).toEqual(lookupRate(table, "zai/glm-5.3-flash"));

    const priced = priceUsage(table, "x-preview-f-free", totals, null);
    expect(priced.costSource).toBe("modelPriced");
    // 1M tokens each at $0.15 in / $0.50 out / $0.03 cached / $0.15 creation.
    expect(priced.costUsd).toBeCloseTo(0.15 + 0.03 + 0.15 + 0.5, 12);
  });

  it("prefers an explicit entry over a rate alias", () => {
    const table = parseRateTable({
      "zai/glm-5.3-flash": rate(2),
      "x-preview-f-free": rate(9),
    });

    expect(lookupRate(table, "x-preview-f-free")?.inputCostPerToken).toBe(9);
  });

  it("keeps unpriceable names unpriced even with a free-tier suffix", () => {
    const table = withBuiltinRates(parseRateTable({}));

    expect(lookupRate(table, "sonnet-free")).toBeNull();
    expect(lookupRate(table, "free")).toBeNull();
    expect(lookupRate(table, "muse-spark-1.3-contributor-free")).not.toBeNull();
  });
});
