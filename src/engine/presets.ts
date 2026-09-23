import { Cadence, Cents, Envelope, EnvelopeKind, IncomeProfile, PresetId } from "../types";
import { KIND_LABELS, NOT_CARD_SPENDABLE } from "./catalog";
import { startOfMonth, startOfWeek, sum, uid } from "./util";

export const PRESETS: { id: PresetId; label: string; blurb: string }[] = [
  {
    id: "starter",
    label: "Starter, debt focused",
    blurb:
      "Tight spending, a starter emergency fund, and everything left over thrown at debt, smallest balance first.",
  },
  {
    id: "balanced",
    label: "Balanced",
    blurb: "Roughly 50% needs, 30% wants, 20% savings and debt. A sane default if nothing else fits.",
  },
  {
    id: "percent",
    label: "Percent of income",
    blurb: "Each category is a percentage, not a dollar figure. Change your income and every target recalculates.",
  },
  {
    id: "lean",
    label: "Lean",
    blurb: "Needs first and very little else. For a tight month, a job gap, or catching up after one.",
  },
  {
    id: "saver",
    label: "High saver",
    blurb: "About 30% goes to savings and the emergency fund. Everyday spending is trimmed to fit.",
  },
  {
    id: "family",
    label: "Family",
    blurb: "Bigger grocery, household and health shares, plus a category for kids and childcare.",
  },
  {
    id: "custom",
    label: "Custom",
    blurb: "An emergency fund and nothing else. You build every category yourself.",
  },
];

export function recommendedPreset(income: IncomeProfile): PresetId {
  if (income.debtTotal > 0 || income.goal === "debt") return "starter";
  if (income.householdSize >= 3) return "family";
  if (income.goal === "emergency") return "saver";
  return "balanced";
}

export const WEEKS_PER_MONTH = 52 / 12;

export function monthlyEquivalent(e: Pick<Envelope, "target" | "cadence">): Cents {
  return e.cadence === "weekly" ? Math.round(e.target * WEEKS_PER_MONTH) : e.target;
}

export function targetFromPercent(monthlyIncome: Cents, percent: number, cadence: Cadence): Cents {
  const monthly = (monthlyIncome * percent) / 100;
  return Math.round(cadence === "weekly" ? monthly / WEEKS_PER_MONTH : monthly);
}

export function periodStartFor(cadence: Cadence, now: string): string {
  return cadence === "weekly" ? startOfWeek(now) : startOfMonth(now);
}

export function makeEnvelope(
  kind: EnvelopeKind,
  opts: Partial<Envelope> & { now: string }
): Envelope {
  const cadence = opts.cadence ?? "monthly";
  const savingsLike = NOT_CARD_SPENDABLE.includes(kind);
  return {
    id: opts.id ?? uid(),
    name: opts.name ?? KIND_LABELS[kind],
    kind,
    cadence,
    target: opts.target ?? 0,
    percent: opts.percent,
    // Default policy: spending envelopes reset each period and the leftover goes back to Unassigned,
    // so it gets reassigned on purpose. Savings-type envelopes always keep their money.
    rollover: opts.rollover ?? (savingsLike || kind === "subscriptions"),
    cardSpendable: opts.cardSpendable ?? !savingsLike,
    balance: opts.balance ?? 0,
    held: 0,
    spentThisPeriod: 0,
    fundedThisPeriod: 0,
    periodStart: periodStartFor(cadence, opts.now),
    priority: opts.priority ?? 50,
    warned80: false,
    warned100: false,
  };
}

type Row = { kind: EnvelopeKind; pct: number; cadence?: Cadence; name?: string };

function presetRows(preset: PresetId, income: IncomeProfile): Row[] {
  const hasDebt = income.debtTotal > 0 || income.goal === "debt";
  // bigger households eat more: +25% on the base grocery share per extra person, capped at double
  const groceryScale = Math.min(2, 1 + 0.25 * Math.max(0, income.householdSize - 1));

  let rows: Row[];
  if (preset === "starter") {
    rows = [
      { kind: "housing", pct: 30 },
      { kind: "utilities", pct: 6 },
      { kind: "groceries", pct: 10 * groceryScale },
      { kind: "transport", pct: 7 },
      { kind: "health", pct: 4 },
      { kind: "dining", pct: 2, cadence: "weekly" },
      { kind: "subscriptions", pct: 1 },
      { kind: "shopping", pct: 2 },
      { kind: "entertainment", pct: 1 },
      { kind: "emergency", pct: 8 },
      { kind: hasDebt ? "debt" : "savings", pct: 0 }, // remainder
    ];
  } else if (preset === "custom") {
    rows = [{ kind: "emergency", pct: 0 }];
  } else if (preset === "lean") {
    rows = [
      { kind: "housing", pct: 32 },
      { kind: "utilities", pct: 7 },
      { kind: "groceries", pct: 11 * groceryScale },
      { kind: "transport", pct: 8 },
      { kind: "health", pct: 4 },
      { kind: "dining", pct: 1, cadence: "weekly" },
      { kind: "subscriptions", pct: 1 },
      { kind: "shopping", pct: 1 },
      { kind: "emergency", pct: 12 },
      { kind: hasDebt ? "debt" : "savings", pct: 0 },
    ];
  } else if (preset === "saver") {
    rows = [
      { kind: "housing", pct: 25 },
      { kind: "utilities", pct: 5 },
      { kind: "groceries", pct: 9 * groceryScale },
      { kind: "transport", pct: 5 },
      { kind: "health", pct: 4 },
      { kind: "dining", pct: 4, cadence: "weekly" },
      { kind: "subscriptions", pct: 2 },
      { kind: "shopping", pct: 4 },
      { kind: "entertainment", pct: 4 },
      { kind: "emergency", pct: 10 },
      ...(hasDebt ? [{ kind: "debt" as EnvelopeKind, pct: 8 }] : []),
      { kind: "savings", pct: 0, name: "Savings and investing" },
    ];
  } else if (preset === "family") {
    rows = [
      { kind: "housing", pct: 27 },
      { kind: "utilities", pct: 7 },
      { kind: "groceries", pct: 13 * Math.min(1.5, groceryScale) },
      { kind: "household", pct: 4 },
      { kind: "transport", pct: 7 },
      { kind: "health", pct: 6 },
      { kind: "custom", pct: 6, name: "Kids and childcare" },
      { kind: "dining", pct: 3, cadence: "weekly" },
      { kind: "subscriptions", pct: 2 },
      { kind: "shopping", pct: 4 },
      { kind: "entertainment", pct: 3 },
      { kind: "emergency", pct: 8 },
      { kind: hasDebt ? "debt" : "savings", pct: 0 },
    ];
  } else {
    rows = [
      { kind: "housing", pct: 28 },
      { kind: "utilities", pct: 6 },
      { kind: "groceries", pct: 10 * groceryScale },
      { kind: "transport", pct: 6 },
      { kind: "health", pct: 5 },
      { kind: "dining", pct: 7, cadence: "weekly" },
      { kind: "subscriptions", pct: 3 },
      { kind: "shopping", pct: 8 },
      { kind: "entertainment", pct: 7 },
      { kind: "emergency", pct: 10 },
      { kind: hasDebt ? "debt" : "savings", pct: 0 }, // remainder
    ];
    if (income.goal === "emergency") {
      bump(rows, "shopping", -3);
      bump(rows, "entertainment", -2);
      bump(rows, "emergency", 5);
    }
  }

  if (income.goal === "purchase" && preset !== "custom") {
    bump(rows, "shopping", -2);
    rows.splice(rows.length - 1, 0, { kind: "savings", pct: 5, name: "Big purchase" });
  }

  for (const r of rows) r.pct = Math.round(r.pct * 10) / 10;
  if (preset !== "custom") {
    // last row soaks up whatever is left so the plan is exactly zero-based
    const used = sum(rows.slice(0, -1).map((r) => r.pct));
    rows[rows.length - 1].pct = Math.max(0, Math.round((100 - used) * 10) / 10);
  }
  return rows;
}

function bump(rows: Row[], kind: EnvelopeKind, delta: number) {
  const r = rows.find((x) => x.kind === kind);
  if (r) r.pct = Math.max(0, r.pct + delta);
}

export function buildEnvelopes(preset: PresetId, income: IncomeProfile, now: string): Envelope[] {
  const rows = presetRows(preset, income);
  return rows.map((r, i) => {
    const cadence = r.cadence ?? "monthly";
    const pct = Math.round(r.pct * 10) / 10;
    return makeEnvelope(r.kind, {
      now,
      name: r.name,
      cadence,
      target: targetFromPercent(income.monthlyIncome, pct, cadence),
      percent: preset === "percent" ? pct : undefined,
      // needs first, then the emergency fund, then wants, then the remainder
      priority: priorityFor(r.kind, i),
    });
  });
}

function priorityFor(kind: EnvelopeKind, index: number): number {
  const order: EnvelopeKind[] = ["housing", "utilities", "groceries", "transport", "health", "emergency", "debt"];
  const i = order.indexOf(kind);
  return i >= 0 ? i * 10 : 100 + index;
}

// Percent-based envelopes follow income. Called whenever monthly income changes.
export function recalcPercentTargets(envelopes: Envelope[], monthlyIncome: Cents): Envelope[] {
  return envelopes.map((e) =>
    e.percent === undefined ? e : { ...e, target: targetFromPercent(monthlyIncome, e.percent, e.cadence) }
  );
}
