import { describe, expect, it } from "vitest";
import { AppState } from "../types";
import { detectRecurring, suggestEnvelope } from "./categorize";
import { advanceDays, trailingAverage } from "./clock";
import {
  applyPlan,
  assign,
  authorize,
  available,
  coverAndRetry,
  manualExpense,
  planFill,
  reassign,
  settle,
  totals,
  transferIn,
} from "./ledger";
import { buildEnvelopes, monthlyEquivalent, recalcPercentTargets } from "./presets";
import { demoState, freshState, newCard } from "./seed";
import { sum } from "./util";

const NOW = "2026-09-15T12:00:00.000Z";

function funded(preset: "balanced" | "percent" | "starter" = "balanced"): AppState {
  const income = {
    frequency: "monthly" as const,
    monthlyIncome: 400000,
    irregular: false,
    averagingMonths: 3 as const,
    debtTotal: 0,
    householdSize: 1,
    goal: "discipline" as const,
  };
  let s: AppState = {
    ...freshState(NOW),
    step: "done",
    income,
    envelopes: buildEnvelopes(preset, income, NOW),
    bank: { institution: "Test Bank", accountName: "Checking", mask: "0001" },
    card: newCard(NOW),
  };
  s = transferIn(s, 400000, "manual", true).state;
  s = applyPlan(s, planFill(s)).state;
  return s;
}

const byKind = (s: AppState, kind: string) => s.envelopes.find((e) => e.kind === kind)!;

describe("presets", () => {
  it("are zero-based: planned monthly spend equals income", () => {
    for (const p of ["starter", "balanced", "percent"] as const) {
      const s = funded(p);
      const planned = sum(s.envelopes.map(monthlyEquivalent));
      expect(Math.abs(planned - 400000)).toBeLessThan(200);
    }
  });

  it("always include an emergency fund, even custom", () => {
    const income = funded().income!;
    expect(buildEnvelopes("custom", income, NOW).map((e) => e.kind)).toEqual(["emergency"]);
  });

  it("percent envelopes follow income", () => {
    const s = funded("percent");
    const g = byKind(s, "groceries");
    const after = recalcPercentTargets(s.envelopes, 500000).find((e) => e.id === g.id)!;
    expect(after.target).toBe(Math.round((g.target * 5) / 4));
  });
});

describe("enforcement", () => {
  it("approves when the envelope has the money and declines when it doesn't", () => {
    let s = funded();
    const g = byKind(s, "groceries");
    const r1 = authorize(s, { merchant: "Trader Joe's", mcc: "5411", amount: g.balance - 100 });
    s = r1.state;
    expect(s.transactions[0].status).toBe("settled");
    expect(available(byKind(s, "groceries"))).toBe(100);

    const r2 = authorize(s, { merchant: "Trader Joe's", mcc: "5411", amount: 500 });
    expect(r2.state.transactions[0].status).toBe("declined");
    expect(r2.state.transactions[0].decline?.shortBy).toBe(400);
    expect(available(byKind(r2.state, "groceries"))).toBe(100);
  });

  it("never lets the card touch Unassigned or savings envelopes", () => {
    let s = funded();
    s = transferIn(s, 50000, "manual", true).state; // sits in Unassigned
    const r = authorize(s, { merchant: "Mystery Shop", mcc: "9999", amount: 100 });
    expect(r.state.transactions[0].decline?.code).toBe("no_envelope");
    const e = byKind(s, "emergency");
    const r2 = authorize(s, { merchant: "Whatever", mcc: "5411", amount: 100, envelopeId: e.id });
    expect(r2.state.transactions[0].decline?.code).toBe("not_spendable");
  });

  it("declines everything on a frozen card and gambling by default", () => {
    const s = funded();
    expect(authorize(s, { merchant: "Lucky Star Casino", mcc: "7995", amount: 100 }).state.transactions[0].decline?.code).toBe(
      "blocked_mcc"
    );
    const frozen = { ...s, card: { ...s.card!, status: "frozen" as const } };
    expect(authorize(frozen, { merchant: "Trader Joe's", mcc: "5411", amount: 100 }).state.transactions[0].decline?.code).toBe(
      "frozen"
    );
  });

  it("keeps pending holds separate and releases the difference on settle", () => {
    let s = funded();
    const before = available(byKind(s, "transport"));
    s = authorize(s, { merchant: "Shell", mcc: "5542", amount: 4200, hold: 10000 }).state;
    expect(byKind(s, "transport").held).toBe(10000);
    expect(available(byKind(s, "transport"))).toBe(before - 10000);
    s = settle(s, s.transactions[0].id).state;
    expect(byKind(s, "transport").held).toBe(0);
    expect(available(byKind(s, "transport"))).toBe(before - 4200);
  });

  it("covers a shortfall from the emergency fund and retries", () => {
    let s = funded();
    const d = byKind(s, "dining");
    const emergencyBefore = available(byKind(s, "emergency"));
    s = authorize(s, { merchant: "Chipotle", mcc: "5814", amount: d.balance + 1500 }).state;
    const declined = s.transactions[0];
    expect(declined.status).toBe("declined");
    const r = coverAndRetry(s, declined.id, "gas to work");
    expect(r.error).toBeUndefined();
    s = r.state;
    expect(s.transactions[0].status).toBe("settled");
    expect(s.transactions[0].override?.amount).toBe(1500);
    expect(s.transactions[0].override?.note).toBe("gas to work");
    expect(available(byKind(s, "emergency"))).toBe(emergencyBefore - 1500);
    expect(available(byKind(s, "dining"))).toBe(0);
    expect(coverAndRetry(s, declined.id, "").error).toBeDefined();
  });

  it("keeps total cash equal to Unassigned plus envelope balances", () => {
    const s = demoState(NOW);
    const t = totals(s);
    expect(t.cash).toBe(s.unassigned + sum(s.envelopes.map((e) => e.balance)));
    for (const e of s.envelopes) {
      expect(e.balance).toBeGreaterThanOrEqual(0);
      expect(e.held).toBeLessThanOrEqual(e.balance);
    }
  });
});

describe("categorization", () => {
  it("splits a transaction and moves money between envelopes", () => {
    let s = funded();
    s = authorize(s, { merchant: "Target", mcc: "5310", amount: 12000 }).state;
    const tx = s.transactions[0];
    expect(tx.confirmed).toBe(false); // ambiguous MCC needs a look
    const shopBefore = byKind(s, "shopping").balance;
    const r = reassign(s, tx.id, [
      { envelopeId: byKind(s, "groceries").id, amount: 8000 },
      { envelopeId: byKind(s, "shopping").id, amount: 4000 },
    ]);
    expect(r.error).toBeUndefined();
    expect(byKind(r.state, "shopping").balance).toBe(shopBefore + 8000);
    expect(reassign(s, tx.id, [{ envelopeId: byKind(s, "groceries").id, amount: 100 }]).error).toMatch(/add up/);
  });

  it("learns a merchant after two corrections", () => {
    let s = funded();
    const groceries = byKind(s, "groceries");
    for (let i = 0; i < 2; i++) {
      s = authorize(s, { merchant: "Walmart", mcc: "5310", amount: 2000 }).state;
      expect(suggestEnvelope(s, "Walmart", "5310").envelope?.kind).toBe("shopping");
      s = reassign(s, s.transactions[0].id, [{ envelopeId: groceries.id, amount: 2000 }]).state;
    }
    expect(suggestEnvelope(s, "Walmart", "5310").envelope?.id).toBe(groceries.id);
  });

  it("spots monthly subscriptions", () => {
    const s = demoState(NOW);
    const found = detectRecurring(s.transactions, s.envelopes).map((r) => r.merchant);
    expect(found).toEqual(expect.arrayContaining(["Netflix", "Spotify", "Planet Fitness"]));
    const gym = detectRecurring(s.transactions, s.envelopes).find((r) => r.merchant === "Planet Fitness")!;
    expect(gym.inSubscriptions).toBe(false);
  });
});

describe("clock", () => {
  it("lands ACH after two days and resets non-rollover envelopes into Unassigned", () => {
    let s = funded();
    const start = s.unassigned;
    s = transferIn(s, 10000, "manual").state;
    expect(s.unassigned).toBe(start);
    s = advanceDays(s, 2);
    expect(s.unassigned).toBe(start + 10000);

    const g = byKind(s, "groceries");
    const leftover = available(g);
    s = advanceDays(s, 20); // crosses into October
    expect(byKind(s, "groceries").balance).toBe(0);
    expect(s.unassigned).toBeGreaterThanOrEqual(start + 10000 + leftover);
    expect(byKind(s, "emergency").balance).toBeGreaterThan(0); // rollover
  });

  it("averages irregular income over the window", () => {
    const log = [
      { id: "a", at: "2026-07-20T00:00:00.000Z", amount: 300000, source: "x" },
      { id: "b", at: "2026-08-20T00:00:00.000Z", amount: 500000, source: "x" },
      { id: "c", at: "2026-09-10T00:00:00.000Z", amount: 100000, source: "x" },
    ];
    expect(trailingAverage(log, NOW, 3).average).toBe(300000);
  });
});

describe("cash spending", () => {
  it("debits the envelope and sends matching cash back to the bank", () => {
    let s = funded();
    const g = byKind(s, "groceries");
    const r = manualExpense(s, { merchant: "Farmers market", envelopeId: g.id, amount: 1200 });
    s = r.state;
    expect(byKind(s, "groceries").balance).toBe(g.balance - 1200);
    expect(s.transfers[0]).toMatchObject({ direction: "out", amount: 1200, reason: "cash" });
    expect(manualExpense(s, { merchant: "x", envelopeId: g.id, amount: 10_000_000 }).error).toMatch(/short/);
  });

  it("can't assign more than Unassigned", () => {
    const s = funded();
    expect(assign(s, byKind(s, "groceries").id, s.unassigned + 1).error).toBeDefined();
  });
});
