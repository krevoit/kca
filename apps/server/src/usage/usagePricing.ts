/**
 * Model rate lookup and cost arithmetic.
 *
 * Rates come from LiteLLM's `model_prices_and_context_window.json`, the same
 * table `ccusage` prices against. Everything here is pure: fetching and caching
 * the table lives in `UsageService`.
 *
 * @module usagePricing
 */
import type {
  UsageCostSource,
  UsageModelPriceOverride,
  UsageTokenTotals,
} from "@t3tools/contracts";

/**
 * The subset of a LiteLLM entry we price against. All values are USD per token.
 *
 * LiteLLM also publishes tiered variants (`*_above_272k_tokens`, `*_flex`,
 * `*_priority`, `*_batches`). We deliberately price at the base tier: the
 * transcripts don't record which tier served a request, so anything else would
 * be a guess dressed up as precision.
 */
export interface ModelRate {
  readonly inputCostPerToken: number;
  readonly outputCostPerToken: number;
  readonly cacheReadCostPerToken: number;
  readonly cacheCreationCostPerToken: number;
}

export type RateTable = ReadonlyMap<string, ModelRate>;

/** Custom IDs keep their case, provider prefix, and variant suffix. */
export function createOverrideRateTable(
  overrides: Readonly<Record<string, UsageModelPriceOverride>>,
): RateTable {
  return new Map(
    Object.entries(overrides).map(([model, prices]) => [
      model.trim(),
      {
        inputCostPerToken: prices.inputCostPerMillionTokens / 1_000_000,
        outputCostPerToken: prices.outputCostPerMillionTokens / 1_000_000,
        cacheReadCostPerToken:
          (prices.cacheReadCostPerMillionTokens ?? prices.inputCostPerMillionTokens) / 1_000_000,
        cacheCreationCostPerToken:
          (prices.cacheWriteCostPerMillionTokens ?? prices.inputCostPerMillionTokens) / 1_000_000,
      },
    ]),
  );
}

/** Raw shape of one LiteLLM entry, narrowed to the fields we read. */
interface LiteLlmEntry {
  readonly input_cost_per_token?: unknown;
  readonly output_cost_per_token?: unknown;
  readonly cache_read_input_token_cost?: unknown;
  readonly cache_creation_input_token_cost?: unknown;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Projects the LiteLLM document into a rate table.
 *
 * Entries without both an input and an output rate are dropped: a half-priced
 * model would silently under-report cost, which is worse than reporting the
 * model as unpriced.
 *
 * Entries keep their full normalized key; a bare name is aliased only when no
 * canonical entry exists and every qualified entry has the same rate.
 */
export function parseRateTable(document: unknown): RateTable {
  const table = new Map<string, ModelRate>();
  if (typeof document !== "object" || document === null) return table;

  for (const [name, raw] of Object.entries(document as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as LiteLlmEntry;
    const input = finiteNumber(entry.input_cost_per_token);
    const output = finiteNumber(entry.output_cost_per_token);
    if (input === null || output === null) continue;

    const key = normalizeRateKey(name);
    if (key.length === 0) continue;
    table.set(key, {
      inputCostPerToken: input,
      outputCostPerToken: output,
      // Anthropic bills cache reads at a discount and cache writes at a
      // premium. When a model omits them, cached input is priced as plain
      // input rather than as free.
      cacheReadCostPerToken: finiteNumber(entry.cache_read_input_token_cost) ?? input,
      cacheCreationCostPerToken: finiteNumber(entry.cache_creation_input_token_cost) ?? input,
    });
  }

  // `null` marks a bare name claimed at conflicting rates: no alias for it.
  const aliasCandidates = new Map<string, ModelRate | null>();
  for (const [key, rate] of table) {
    const alias = bareModelName(key);
    if (alias.length === 0 || alias === key || table.has(alias)) continue;
    const held = aliasCandidates.get(alias);
    if (held === undefined) {
      aliasCandidates.set(alias, rate);
    } else if (held !== null && !sameRate(held, rate)) {
      aliasCandidates.set(alias, null);
    }
  }
  for (const [alias, rate] of aliasCandidates) {
    if (rate !== null) table.set(alias, rate);
  }

  return table;
}

function sameRate(a: ModelRate, b: ModelRate): boolean {
  return (
    a.inputCostPerToken === b.inputCostPerToken &&
    a.outputCostPerToken === b.outputCostPerToken &&
    a.cacheReadCostPerToken === b.cacheReadCostPerToken &&
    a.cacheCreationCostPerToken === b.cacheCreationCostPerToken
  );
}

/**
 * Built-in rates for paid models the LiteLLM table does not carry (yet).
 *
 * Meta's Muse Spark Contributor tier (`*-contributor` model IDs, served
 * through providers like OpenCode): $0.10 input / $0.20 output / $0.002 cached
 * input per million tokens. The standard tier: $1.25 / $4.25 / $0.15. Cache
 * creation is unpublished, so it prices at the input rate per the codebase
 * convention. Rates verified September 2026 against Meta's Model API pricing.
 *
 * These sit UNDER the fetched table: if LiteLLM ever lists the same model,
 * its entry wins. User price overrides still win over everything.
 */
const BUILTIN_RATES_PER_MILLION: ReadonlyArray<{
  readonly models: ReadonlyArray<string>;
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
}> = [
  {
    models: ["muse-spark-1.2-contributor", "muse-spark-1.3-contributor"],
    input: 0.1,
    output: 0.2,
    cacheRead: 0.002,
  },
  {
    models: ["muse-spark-1.2", "muse-spark-1.3"],
    input: 1.25,
    output: 4.25,
    cacheRead: 0.15,
  },
];

export function builtinRateTable(): RateTable {
  const table = new Map<string, ModelRate>();
  for (const entry of BUILTIN_RATES_PER_MILLION) {
    for (const model of entry.models) {
      table.set(model, {
        inputCostPerToken: entry.input / 1_000_000,
        outputCostPerToken: entry.output / 1_000_000,
        cacheReadCostPerToken: entry.cacheRead / 1_000_000,
        // Unpublished: price cache creation at the input rate.
        cacheCreationCostPerToken: entry.input / 1_000_000,
      });
    }
  }
  return table;
}

/** Layers the built-in rates under a fetched table without mutating either. */
export function withBuiltinRates(table: RateTable): RateTable {
  return new Map([...builtinRateTable(), ...table]);
}

function normalizeRateKey(model: string): string {
  return model.trim().toLowerCase();
}

function bareModelName(key: string): string {
  const slash = key.lastIndexOf("/");
  return slash === -1 ? key : key.slice(slash + 1);
}

/**
 * Drops a bracketed variant suffix such as `claude-fable-5-1[1m]`, which
 * Claude Code writes for the 1M context tier. The rate table only knows the
 * base name, and we price at the base tier anyway.
 */
function stripVariantSuffix(key: string): string {
  const bracket = key.indexOf("[");
  return bracket === -1 ? key : key.slice(0, bracket);
}

/**
 * Drops a `-free` free-tier suffix such as `muse-spark-1.3-contributor-free`.
 * Free-tier models report no usable rate of their own, so they price at their
 * paid counterpart's API rates rather than showing $0.00. Only a fallback:
 * an explicit table entry for the full `-free` name still wins.
 */
function stripFreeTierSuffix(key: string): string {
  return key.endsWith("-free") ? key.slice(0, -"-free".length) : key;
}

/**
 * Models we never price, regardless of the table.
 *
 * `<synthetic>` marks locally generated messages that were never billed. Bare
 * family names ("opus", "sonnet") are genuinely ambiguous across generations,
 * so we report them as unpriced instead of guessing a generation.
 */
const UNPRICEABLE_MODELS = new Set([
  "<synthetic>",
  "synthetic",
  "opus",
  "sonnet",
  "haiku",
  "fable",
]);

function isPriceableKey(key: string): boolean {
  const bareName = bareModelName(key);
  return bareName.length > 0 && !UNPRICEABLE_MODELS.has(bareName);
}

export function lookupRate(table: RateTable, model: string): ModelRate | null {
  const key = stripVariantSuffix(normalizeRateKey(model));
  if (!isPriceableKey(key)) return null;
  const freeTierFallback = stripFreeTierSuffix(key);
  const fallbackRate =
    freeTierFallback !== key && isPriceableKey(freeTierFallback)
      ? table.get(freeTierFallback)
      : undefined;
  return table.get(key) ?? fallbackRate ?? null;
}

export interface PricedUsage {
  readonly costUsd: number;
  readonly costSource: UsageCostSource;
}

/**
 * Prices a bucket's tokens.
 *
 * `reasoningTokens` is intentionally not charged separately: it is already
 * counted inside `outputTokens`.
 */
export function priceUsage(
  table: RateTable,
  model: string,
  totals: UsageTokenTotals,
  reportedCostUsd: number | null,
  overrides?: RateTable,
): PricedUsage {
  const override = overrides?.get(model.trim());
  if (override === undefined && reportedCostUsd !== null && Number.isFinite(reportedCostUsd)) {
    return { costUsd: reportedCostUsd, costSource: "providerReported" };
  }

  const rate = override ?? lookupRate(table, model);
  if (rate === null) return { costUsd: 0, costSource: "unpriced" };

  const costUsd =
    totals.uncachedInputTokens * rate.inputCostPerToken +
    totals.cachedInputTokens * rate.cacheReadCostPerToken +
    totals.cacheCreationTokens * rate.cacheCreationCostPerToken +
    totals.outputTokens * rate.outputCostPerToken;

  return { costUsd, costSource: "modelPriced" };
}

/**
 * What the cached input would have cost at full input rates, minus what it
 * actually cost. Drives the "cache savings" figure.
 */
export function cacheSavingsUsd(
  table: RateTable,
  model: string,
  totals: UsageTokenTotals,
  overrides?: RateTable,
): number {
  const rate = overrides?.get(model.trim()) ?? lookupRate(table, model);
  if (rate === null) return 0;
  return totals.cachedInputTokens * (rate.inputCostPerToken - rate.cacheReadCostPerToken);
}
