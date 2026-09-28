/**
 * Strategy classifier (§7). Rules come from the strategy_rules table and are
 * evaluated in sort order; the first rule whose conditions all match wins.
 * An empty condition list always matches ("Otherwise").
 */

export type RuleOp = "=" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "is_null" | "not_null";

export interface RuleCondition {
  field: string;
  op: RuleOp;
  value?: unknown;
}

export interface StrategyRule {
  sort_order: number;
  strategy_key: string;
  conditions: RuleCondition[];
  enabled?: boolean;
}

export type Facts = Record<string, unknown>;

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function matchCondition(facts: Facts, c: RuleCondition): boolean {
  const actual = facts[c.field];
  switch (c.op) {
    case "is_null":
      return actual === null || actual === undefined;
    case "not_null":
      return actual !== null && actual !== undefined;
    case "=":
      return actual === c.value || (toNumber(actual) !== null && toNumber(actual) === toNumber(c.value));
    case "!=":
      return !(actual === c.value || (toNumber(actual) !== null && toNumber(actual) === toNumber(c.value)));
    case "in":
      return Array.isArray(c.value) && c.value.includes(actual);
    default: {
      // numeric comparisons: a missing value never matches
      const a = toNumber(actual);
      const b = toNumber(c.value);
      if (a === null || b === null) return false;
      if (c.op === ">") return a > b;
      if (c.op === ">=") return a >= b;
      if (c.op === "<") return a < b;
      return a <= b;
    }
  }
}

export function classifyStrategy(facts: Facts, rules: StrategyRule[]): string | null {
  const ordered = [...rules].filter((r) => r.enabled !== false).sort((a, b) => a.sort_order - b.sort_order);
  for (const rule of ordered) {
    if (rule.conditions.every((c) => matchCondition(facts, c))) return rule.strategy_key;
  }
  return null;
}

/** Default rules — same as the seeded strategy_rules rows; used in tests and as a fallback. */
export const DEFAULT_RULES: StrategyRule[] = [
  { sort_order: 10, strategy_key: "auction_watch", conditions: [{ field: "years_in_default", op: ">=", value: 5 }] },
  {
    sort_order: 20,
    strategy_key: "large_vacant",
    conditions: [
      { field: "is_vacant", op: "=", value: true },
      { field: "acres", op: ">=", value: 5 },
    ],
  },
  { sort_order: 30, strategy_key: "improved", conditions: [{ field: "structure_value", op: ">", value: 0 }] },
  { sort_order: 40, strategy_key: "low_value_lot", conditions: [{ field: "land_value", op: "<", value: 5000 }] },
  { sort_order: 50, strategy_key: "vacant_lot_motivated", conditions: [] },
];

/** Corridor zone from miles to I-10 (mirrors public.corridor_zone_for). */
export function corridorZone(miles: number | null | undefined): "i10_corridor" | "i10_near" | "other" {
  if (miles === null || miles === undefined || !Number.isFinite(miles)) return "other";
  if (miles <= 2) return "i10_corridor";
  if (miles <= 5) return "i10_near";
  return "other";
}
