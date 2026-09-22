import { Category, CategoryId, Envelope, IncomeProfile, Merchant, PresetId } from "./types";

export const CATEGORIES: Category[] = [
  { id: "groceries", label: "Groceries", spendable: true },
  { id: "transport", label: "Gas & transport", spendable: true },
  { id: "dining", label: "Dining out", spendable: true },
  { id: "subscriptions", label: "Subscriptions", spendable: true },
  { id: "shopping", label: "Shopping", spendable: true },
  { id: "entertainment", label: "Entertainment", spendable: true },
  { id: "health", label: "Health", spendable: true },
  { id: "debt", label: "Debt payoff", spendable: false },
  { id: "emergency", label: "Emergency fund", spendable: false },
  { id: "unassigned", label: "Unassigned", spendable: false },
];

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export const MERCHANTS: Merchant[] = [
  { name: "Whole Foods Market", category: "groceries", mccLabel: "Grocery Stores", ambiguous: false, minAmount: 15, maxAmount: 120 },
  { name: "Trader Joe's", category: "groceries", mccLabel: "Grocery Stores", ambiguous: false, minAmount: 15, maxAmount: 90 },
  { name: "Shell", category: "transport", mccLabel: "Service Stations", ambiguous: false, minAmount: 20, maxAmount: 70, isPreAuthHold: true, holdAmount: 100 },
  { name: "Chevron", category: "transport", mccLabel: "Service Stations", ambiguous: false, minAmount: 20, maxAmount: 70, isPreAuthHold: true, holdAmount: 100 },
  { name: "Uber", category: "transport", mccLabel: "Transportation Services", ambiguous: false, minAmount: 8, maxAmount: 45 },
  { name: "Chipotle", category: "dining", mccLabel: "Eating Places", ambiguous: false, minAmount: 9, maxAmount: 25 },
  { name: "Starbucks", category: "dining", mccLabel: "Eating Places", ambiguous: false, minAmount: 4, maxAmount: 15 },
  { name: "Netflix", category: "subscriptions", mccLabel: "Digital Goods", ambiguous: false, minAmount: 15.49, maxAmount: 15.49, fixedAmount: 15.49 },
  { name: "Spotify", category: "subscriptions", mccLabel: "Digital Goods", ambiguous: false, minAmount: 11.99, maxAmount: 11.99, fixedAmount: 11.99 },
  { name: "Target", category: "shopping", mccLabel: "Discount Stores", ambiguous: true, minAmount: 15, maxAmount: 180 },
  { name: "Amazon", category: "shopping", mccLabel: "General Merchandise", ambiguous: true, minAmount: 10, maxAmount: 250 },
  { name: "AMC Theatres", category: "entertainment", mccLabel: "Motion Picture Theaters", ambiguous: false, minAmount: 12, maxAmount: 40 },
  { name: "CVS Pharmacy", category: "health", mccLabel: "Drug Stores", ambiguous: false, minAmount: 8, maxAmount: 70 },
  { name: "Planet Fitness", category: "health", mccLabel: "Membership Clubs", ambiguous: false, minAmount: 10, maxAmount: 10, fixedAmount: 10 },
];

export function findMerchant(name: string): Merchant | undefined {
  return MERCHANTS.find((m) => m.name === name);
}

interface PresetDef {
  id: PresetId;
  label: string;
  blurb: string;
}

export const PRESETS: PresetDef[] = [
  {
    id: "starter",
    label: "Starter (debt-focused)",
    blurb: "Lean discretionary spend, a real allocation to debt payoff, and a small starter emergency fund. Inspired by the debt-snowball method.",
  },
  {
    id: "balanced",
    label: "Balanced",
    blurb: "A general needs / wants / savings split. Good default if nothing else fits.",
  },
  {
    id: "percent",
    label: "Percent of income",
    blurb: "Set a percentage per category instead of a flat dollar figure. Recalculates automatically if income changes.",
  },
  {
    id: "custom",
    label: "Custom",
    blurb: "Start every envelope at zero and assign it yourself. Nothing is spendable until you give it a job.",
  },
];

// zero-based: every envelope amount is derived from monthly income so allocations always sum to it (minus unassigned buffer)
export function buildEnvelopesFromPreset(preset: PresetId, income: IncomeProfile): Envelope[] {
  const m = income.monthlyIncome || 0;
  const mk = (category: CategoryId, allocated: number): Envelope => ({
    category,
    allocated: Math.round(allocated),
    spent: 0,
    pendingHold: 0,
  });

  if (preset === "starter") {
    return [
      mk("groceries", m * (income.dependents > 1 ? 0.14 : 0.1)),
      mk("transport", m * 0.08),
      mk("dining", m * 0.03),
      mk("subscriptions", m * 0.02),
      mk("shopping", m * 0.03),
      mk("entertainment", m * 0.01),
      mk("health", m * 0.04),
      mk("debt", m * (income.hasDebt ? 0.25 : 0.05)),
      mk("emergency", m * 0.08),
      mk("unassigned", 0),
    ];
  }

  if (preset === "percent") {
    // sensible defaults for a percent-of-income model; fully editable after
    return [
      mk("groceries", m * 0.12),
      mk("transport", m * 0.1),
      mk("dining", m * 0.05),
      mk("subscriptions", m * 0.02),
      mk("shopping", m * 0.06),
      mk("entertainment", m * 0.03),
      mk("health", m * 0.05),
      mk("debt", m * (income.hasDebt ? 0.15 : 0)),
      mk("emergency", m * 0.12),
      mk("unassigned", 0),
    ];
  }

  if (preset === "custom") {
    return CATEGORIES.filter((c) => c.id !== "unassigned").map((c) => mk(c.id, 0)).concat(mk("unassigned", m));
  }

  // balanced, ~50/30/20
  return [
    mk("groceries", m * 0.14),
    mk("transport", m * 0.1),
    mk("dining", m * 0.07),
    mk("subscriptions", m * 0.03),
    mk("shopping", m * 0.08),
    mk("entertainment", m * 0.05),
    mk("health", m * 0.05),
    mk("debt", m * (income.hasDebt ? 0.1 : 0)),
    mk("emergency", m * 0.1),
    mk("unassigned", 0),
  ];
}
