import { AppState, Cents, Envelope, Transaction } from "../types";
import { MCC } from "./catalog";
import { daysBetween } from "./util";

export const LEARN_THRESHOLD = 2;

export function merchantKey(name: string): string {
  return name.trim().toLowerCase();
}

export interface Suggestion {
  envelope: Envelope | null;
  reason: string;
  ambiguous: boolean;
}

// First pass is the MCC. User corrections override it once they've picked the same envelope
// for a merchant LEARN_THRESHOLD times. Simple frequency, no model.
export function suggestEnvelope(
  state: Pick<AppState, "envelopes" | "corrections">,
  merchant: string,
  mcc?: string
): Suggestion {
  const info = mcc ? MCC[mcc] : undefined;
  const ambiguous = !!info?.ambiguous;
  const learned = state.corrections[merchantKey(merchant)];
  if (learned) {
    const best = Object.entries(learned)
      .filter(([id]) => state.envelopes.some((e) => e.id === id))
      .sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= LEARN_THRESHOLD) {
      const env = state.envelopes.find((e) => e.id === best[0])!;
      return { envelope: env, reason: `You've filed ${merchant} under ${env.name} ${best[1]} times`, ambiguous };
    }
  }
  if (info?.kind) {
    const env = state.envelopes.find((e) => e.kind === info.kind && e.cardSpendable) ?? null;
    if (env) {
      return {
        envelope: env,
        reason: `Merchant code ${mcc} (${info.label})${ambiguous ? ", which covers several kinds of spending" : ""}`,
        ambiguous,
      };
    }
    return { envelope: null, reason: `Merchant code ${mcc} (${info.label}) has no matching envelope`, ambiguous };
  }
  return { envelope: null, reason: "Unknown merchant type", ambiguous: true };
}

export function recordCorrection(
  corrections: AppState["corrections"],
  merchant: string,
  envelopeId: string
): AppState["corrections"] {
  const key = merchantKey(merchant);
  const current = corrections[key] ?? {};
  return { ...corrections, [key]: { ...current, [envelopeId]: (current[envelopeId] ?? 0) + 1 } };
}

export interface RecurringCharge {
  merchant: string;
  amount: Cents;
  count: number;
  lastAt: string;
  nextExpected: string;
  envelopeIds: string[];
  inSubscriptions: boolean;
}

// Same merchant, same amount (within 2%), roughly monthly (25 to 35 days apart), at least twice.
export function detectRecurring(transactions: Transaction[], envelopes: Envelope[]): RecurringCharge[] {
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.source !== "card" || t.status !== "settled") continue;
    const k = merchantKey(t.merchant);
    byMerchant.set(k, [...(byMerchant.get(k) ?? []), t]);
  }

  const out: RecurringCharge[] = [];
  for (const txs of byMerchant.values()) {
    const sorted = [...txs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let chain: Transaction[] = [sorted[0]];
    let best: Transaction[] = chain;
    for (let i = 1; i < sorted.length; i++) {
      const prev = chain[chain.length - 1];
      const cur = sorted[i];
      const gap = daysBetween(prev.createdAt, cur.createdAt);
      const sameAmount = Math.abs(cur.amount - prev.amount) <= prev.amount * 0.02;
      if (sameAmount && gap >= 25 && gap <= 35) {
        chain = [...chain, cur];
      } else if (sameAmount && gap < 25) {
        continue; // a one-off at the same price shouldn't break the chain
      } else {
        chain = [cur];
      }
      if (chain.length > best.length) best = chain;
    }
    if (best.length < 2) continue;
    const last = best[best.length - 1];
    const envelopeIds = [...new Set(best.flatMap((t) => t.allocations.map((a) => a.envelopeId)))];
    const inSubscriptions = envelopeIds.every((id) => envelopes.find((e) => e.id === id)?.kind === "subscriptions");
    out.push({
      merchant: last.merchant,
      amount: last.amount,
      count: best.length,
      lastAt: last.createdAt,
      nextExpected: new Date(new Date(last.createdAt).getTime() + 30 * 86_400_000).toISOString(),
      envelopeIds,
      inSubscriptions,
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}
