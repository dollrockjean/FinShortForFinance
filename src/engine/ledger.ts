import { Allocation, AppState, Cents, Envelope, Notice, Transaction, Transfer } from "../types";
import { MCC } from "./catalog";
import { recordCorrection, suggestEnvelope } from "./categorize";
import { addDays, clone, fmt, sum, uid } from "./util";

// The whole enforcement model: a card purchase clears only if the envelope it draws on
// has the money right now. There is no judgment call; the ledger has it or it doesn't.

export type Result = { state: AppState; error?: string; txId?: string };

export const ACH_DAYS = 2;
export const HOLD_SETTLE_DAYS = 1;

export function available(e: Envelope): Cents {
  return e.balance - e.held;
}

export function usage(e: Envelope): number {
  const base = e.spentThisPeriod + e.balance;
  if (base <= 0) return e.spentThisPeriod > 0 ? 1 : 0;
  return (e.spentThisPeriod + e.held) / base;
}

export function totals(state: AppState) {
  const envs = state.envelopes;
  return {
    cash: state.unassigned + sum(envs.map((e) => e.balance)),
    held: sum(envs.map((e) => e.held)),
    cardAvailable: sum(envs.filter((e) => e.cardSpendable).map(available)),
    pendingIn: sum(state.transfers.filter((t) => t.direction === "in" && t.status === "pending").map((t) => t.amount)),
    pendingOut: sum(state.transfers.filter((t) => t.direction === "out" && t.status === "pending").map((t) => t.amount)),
  };
}

function env(state: AppState, id: string): Envelope | undefined {
  return state.envelopes.find((e) => e.id === id);
}

export function emergencyEnvelope(state: AppState): Envelope | undefined {
  return state.envelopes.find((e) => e.kind === "emergency");
}

export function notify(state: AppState, n: Omit<Notice, "id" | "at" | "read">): void {
  state.notices = [{ ...n, id: uid(), at: state.now, read: false }, ...state.notices].slice(0, 100);
}

// 80% and 100% warnings, once each per period. Resets if money is added back.
export function checkAlerts(state: AppState, envelopeId: string): void {
  const e = env(state, envelopeId);
  if (!e || !e.cardSpendable) return;
  const u = usage(e);
  if (u >= 1 && !e.warned100) {
    e.warned100 = true;
    e.warned80 = true;
    notify(state, {
      kind: "over",
      title: `${e.name} is empty`,
      body: `Your card will decline anything else from ${e.name} until you move money in.`,
    });
  } else if (u >= 0.8 && !e.warned80) {
    e.warned80 = true;
    notify(state, {
      kind: "warn",
      title: `${e.name} is at ${Math.round(u * 100)}%`,
      body: `${fmt(available(e))} left for this ${e.cadence === "weekly" ? "week" : "month"}.`,
    });
  }
  if (u < 1) e.warned100 = false;
  if (u < 0.8) e.warned80 = false;
}

// ---- assigning money (zero-based: Unassigned is the only source of new envelope money)

export function assign(prev: AppState, envelopeId: string, amount: Cents): Result {
  const state = clone(prev);
  const e = env(state, envelopeId);
  if (!e) return { state: prev, error: "No such envelope" };
  if (amount > 0 && amount > state.unassigned) return { state: prev, error: `Only ${fmt(state.unassigned)} is unassigned` };
  if (amount < 0 && -amount > available(e)) return { state: prev, error: `${e.name} only has ${fmt(available(e))} free` };
  state.unassigned -= amount;
  e.balance += amount;
  e.fundedThisPeriod += amount;
  checkAlerts(state, e.id);
  return { state };
}

export function move(prev: AppState, fromId: string, toId: string, amount: Cents): Result {
  if (amount <= 0) return { state: prev, error: "Enter an amount" };
  const state = clone(prev);
  const from = env(state, fromId);
  const to = env(state, toId);
  if (!from || !to) return { state: prev, error: "Pick both envelopes" };
  if (available(from) < amount) return { state: prev, error: `${from.name} only has ${fmt(available(from))} free` };
  from.balance -= amount;
  from.fundedThisPeriod -= amount;
  to.balance += amount;
  to.fundedThisPeriod += amount;
  checkAlerts(state, from.id);
  checkAlerts(state, to.id);
  return { state };
}

// What an envelope still needs this period. Spending envelopes fill up to their target level.
// Savings-type envelopes (emergency, debt, rent) take a set contribution each period, however
// much they already hold.
export function need(e: Envelope): Cents {
  if (!e.cardSpendable) return Math.max(0, e.target - e.fundedThisPeriod);
  return Math.max(0, e.target - (e.spentThisPeriod + e.balance));
}

// Fill envelopes in priority order until the pool runs out. This is also the
// irregular-income method: each paycheck gets spoken for, top of the list first.
export function planFill(state: AppState, pool: Cents = state.unassigned): Allocation[] {
  let left = pool;
  const plan: Allocation[] = [];
  for (const e of [...state.envelopes].sort((a, b) => a.priority - b.priority)) {
    if (left <= 0) break;
    const amt = Math.min(need(e), left);
    if (amt > 0) {
      plan.push({ envelopeId: e.id, amount: amt });
      left -= amt;
    }
  }
  return plan;
}

export function applyPlan(prev: AppState, plan: Allocation[]): Result {
  const total = sum(plan.map((p) => p.amount));
  if (total > prev.unassigned) return { state: prev, error: "Plan is bigger than Unassigned" };
  let state = prev;
  for (const p of plan) {
    const r = assign(state, p.envelopeId, p.amount);
    if (r.error) return { state: prev, error: r.error };
    state = r.state;
  }
  return { state };
}

// ---- card authorization. Mirrors what an issuing_authorization.request webhook handler would do.

export interface AuthRequest {
  merchant: string;
  mcc: string;
  amount: Cents; // what the merchant will actually charge
  hold?: Cents; // pre-auth amount for pumps, hotels, rentals
  envelopeId?: string; // explicit choice, otherwise Fin suggests
}

export function authorize(prev: AppState, req: AuthRequest): Result {
  const state = clone(prev);
  const suggestion = suggestEnvelope(state, req.merchant, req.mcc);
  const chosenId = req.envelopeId ?? state.nextPurchaseEnvelopeId ?? suggestion.envelope?.id;
  const e = chosenId ? env(state, chosenId) : undefined;
  const required = req.hold ?? req.amount;
  const info = MCC[req.mcc];

  const tx: Transaction = {
    id: uid(),
    createdAt: state.now,
    merchant: req.merchant,
    mcc: req.mcc,
    mccLabel: info?.label,
    amount: req.amount,
    status: "settled",
    source: "card",
    holdAmount: req.hold,
    allocations: e ? [{ envelopeId: e.id, amount: req.amount }] : [],
    suggestionReason: req.envelopeId || state.nextPurchaseEnvelopeId ? "You picked this envelope before paying" : suggestion.reason,
    confirmed: !!(req.envelopeId || state.nextPurchaseEnvelopeId) || (!!e && !suggestion.ambiguous && !!suggestion.envelope),
  };

  const decline = (code: NonNullable<Transaction["decline"]>["code"], message: string, extra: Partial<NonNullable<Transaction["decline"]>> = {}) => {
    tx.status = "declined";
    tx.decline = { code, message, envelopeId: e?.id, ...extra };
    state.transactions = [tx, ...state.transactions];
    notify(state, { kind: "decline", title: `Declined at ${req.merchant}`, body: message });
    return { state, txId: tx.id };
  };

  if (!state.card) return decline("frozen", "You don't have a Fin card yet.");
  if (state.card.status === "frozen") return decline("frozen", "Your card is frozen. Unfreeze it in the Card tab.");
  if (info?.group === "gambling" && state.card.blockGambling) {
    return decline("blocked_mcc", "Gambling merchants are blocked on this card. You can change that in the Card tab.");
  }
  if (!e) {
    return decline("no_envelope", `${req.merchant} doesn't match any envelope. Pick one in Fin before you pay, then try again.`);
  }
  if (!e.cardSpendable) {
    return decline("not_spendable", `${e.name} can't be spent by card. Move money into a spending envelope first.`);
  }
  const avail = available(e);
  if (avail < required) {
    const shortBy = required - avail;
    const what = req.hold ? `a ${fmt(req.hold)} hold` : fmt(required);
    return decline("insufficient", `${e.name} has ${fmt(Math.max(0, avail))} and this needed ${what}. Short by ${fmt(shortBy)}.`, { shortBy });
  }

  if (req.hold) {
    tx.status = "pending";
    tx.settleAt = addDays(state.now, HOLD_SETTLE_DAYS);
    e.held += req.hold;
  } else {
    e.balance -= req.amount;
    e.spentThisPeriod += req.amount;
  }
  state.nextPurchaseEnvelopeId = null;
  state.transactions = [tx, ...state.transactions];
  checkAlerts(state, e.id);
  return { state, txId: tx.id };
}

// Pending hold settles to the real amount. The difference goes back to the envelope.
export function settle(prev: AppState, txId: string, finalAmount?: Cents): Result {
  const state = clone(prev);
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx || tx.status !== "pending") return { state: prev, error: "Not a pending transaction" };
  const final = finalAmount ?? tx.amount;
  const hold = tx.holdAmount ?? tx.amount;
  if (final > hold) return { state: prev, error: `Final amount can't exceed the ${fmt(hold)} hold in this demo` };
  const e = env(state, tx.allocations[0]?.envelopeId ?? "");
  if (e) {
    e.held = Math.max(0, e.held - hold);
    e.balance -= final;
    e.spentThisPeriod += final;
    checkAlerts(state, e.id);
  }
  tx.status = "settled";
  tx.amount = final;
  tx.allocations = tx.allocations.map((a) => ({ ...a, amount: final }));
  delete tx.settleAt;
  return { state };
}

// Declined for lack of funds: move exactly the shortfall out of the emergency fund, then retry.
// Card networks don't let you approve a charge after it declined, so the retry is a new authorization.
export function coverAndRetry(prev: AppState, txId: string, note: string): Result {
  const tx = prev.transactions.find((t) => t.id === txId);
  if (!tx || tx.status !== "declined" || tx.decline?.code !== "insufficient" || !tx.decline.envelopeId) {
    return { state: prev, error: "Only an insufficient-funds decline can be covered" };
  }
  if (tx.decline.coveredBy) return { state: prev, error: "Already covered" };
  const target = env(prev, tx.decline.envelopeId);
  const emergency = emergencyEnvelope(prev);
  if (!target || !emergency) return { state: prev, error: "Missing envelope" };
  const required = tx.holdAmount ?? tx.amount;
  const shortBy = Math.max(0, required - available(target));
  if (available(emergency) < shortBy) {
    return { state: prev, error: `Emergency fund only has ${fmt(available(emergency))}, and this needs ${fmt(shortBy)}` };
  }

  const moved = move(prev, emergency.id, target.id, shortBy);
  if (moved.error && shortBy > 0) return { state: prev, error: moved.error };
  let state = shortBy > 0 ? moved.state : clone(prev);

  const retry = authorize(state, {
    merchant: tx.merchant,
    mcc: tx.mcc ?? "",
    amount: tx.amount,
    hold: tx.holdAmount,
    envelopeId: target.id,
  });
  state = retry.state;
  const newTx = state.transactions.find((t) => t.id === retry.txId)!;
  newTx.override = { fromEnvelopeId: emergency.id, amount: shortBy, note: note.trim() };
  const original = state.transactions.find((t) => t.id === txId)!;
  original.decline = { ...original.decline!, coveredBy: newTx.id };
  notify(state, {
    kind: "info",
    title: `Covered ${fmt(shortBy)} from your emergency fund`,
    body: `${tx.merchant} went through on retry.${note.trim() ? ` Your note: "${note.trim()}"` : ""}`,
  });
  return { state, txId: newTx.id };
}

// Recategorize or split a settled transaction. Money moves back out of the old envelopes
// and into the new ones, so the new ones need to have it.
export function reassign(prev: AppState, txId: string, allocations: Allocation[]): Result {
  const state = clone(prev);
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx || tx.status !== "settled") return { state: prev, error: "Only settled transactions can be changed" };
  const clean = allocations.filter((a) => a.amount > 0);
  if (clean.length === 0) return { state: prev, error: "Pick at least one envelope" };
  if (sum(clean.map((a) => a.amount)) !== tx.amount) {
    return { state: prev, error: `Splits have to add up to ${fmt(tx.amount)}` };
  }

  for (const a of tx.allocations) {
    const e = env(state, a.envelopeId);
    if (e) {
      e.balance += a.amount;
      e.spentThisPeriod = Math.max(0, e.spentThisPeriod - a.amount);
    }
  }
  for (const a of clean) {
    const e = env(state, a.envelopeId);
    if (!e) return { state: prev, error: "No such envelope" };
    if (available(e) < a.amount) {
      return { state: prev, error: `${e.name} only has ${fmt(available(e))} free. Move money in first, or split differently.` };
    }
    e.balance -= a.amount;
    e.spentThisPeriod += a.amount;
  }

  const changed = JSON.stringify(tx.allocations.map((a) => a.envelopeId).sort()) !== JSON.stringify(clean.map((a) => a.envelopeId).sort());
  if (clean.length === 1 && changed) {
    state.corrections = recordCorrection(state.corrections, tx.merchant, clean[0].envelopeId);
  }
  tx.allocations = clean;
  tx.confirmed = true;
  for (const e of state.envelopes) checkAlerts(state, e.id);
  return { state };
}

export function confirmCategory(prev: AppState, txId: string): Result {
  const state = clone(prev);
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return { state: prev };
  tx.confirmed = true;
  if (tx.allocations.length === 1) state.corrections = recordCorrection(state.corrections, tx.merchant, tx.allocations[0].envelopeId);
  return { state };
}

// Cash and off-app spending. The card never saw it, so it gets logged by hand and debits the
// envelope exactly like a swipe. The matching Fin cash goes back to the linked bank, since that's
// where the cash came from.
export function manualExpense(
  prev: AppState,
  input: { merchant: string; envelopeId: string; amount: Cents; coverNote?: string }
): Result {
  let state = clone(prev);
  const e = env(state, input.envelopeId);
  if (!e) return { state: prev, error: "Pick an envelope" };
  if (input.amount <= 0) return { state: prev, error: "Enter an amount" };

  const shortBy = input.amount - available(e);
  let override: Transaction["override"];
  if (shortBy > 0) {
    if (input.coverNote === undefined) {
      return { state: prev, error: `${e.name} is short by ${fmt(shortBy)}` };
    }
    const emergency = emergencyEnvelope(state);
    if (!emergency) return { state: prev, error: "No emergency fund" };
    const r = move(state, emergency.id, e.id, shortBy);
    if (r.error) return { state: prev, error: r.error };
    state = r.state;
    override = { fromEnvelopeId: emergency.id, amount: shortBy, note: input.coverNote };
  }

  const target = env(state, input.envelopeId)!;
  target.balance -= input.amount;
  target.spentThisPeriod += input.amount;
  const tx: Transaction = {
    id: uid(),
    createdAt: state.now,
    merchant: input.merchant,
    amount: input.amount,
    status: "settled",
    source: "manual",
    allocations: [{ envelopeId: target.id, amount: input.amount }],
    confirmed: true,
    override,
  };
  state.transactions = [tx, ...state.transactions];
  if (state.bank) {
    state.transfers = [
      {
        id: uid(),
        direction: "out",
        amount: input.amount,
        createdAt: state.now,
        arrivesAt: addDays(state.now, ACH_DAYS),
        status: "pending",
        envelopeId: target.id,
        reason: "cash",
        memo: `Covers cash spent at ${input.merchant}`,
      },
      ...state.transfers,
    ];
  }
  checkAlerts(state, target.id);
  return { state, txId: tx.id };
}

// ---- money in and out (ACH via the linked bank)

export function transferIn(prev: AppState, amount: Cents, reason: Transfer["reason"], instant = false): Result {
  if (!prev.bank) return { state: prev, error: "Link a bank first" };
  if (amount <= 0) return { state: prev, error: "Enter an amount" };
  const state = clone(prev);
  const t: Transfer = {
    id: uid(),
    direction: "in",
    amount,
    createdAt: state.now,
    arrivesAt: instant ? state.now : addDays(state.now, ACH_DAYS),
    status: instant ? "completed" : "pending",
    reason,
  };
  if (instant) {
    state.unassigned += amount;
    notify(state, { kind: "money", title: `${fmt(amount)} arrived`, body: "It's in Unassigned. Give it a job before the card can spend it." });
  }
  state.transfers = [t, ...state.transfers];
  return { state };
}

export function transferOut(prev: AppState, source: string | "unassigned", amount: Cents, memo?: string): Result {
  if (!prev.bank) return { state: prev, error: "Link a bank first" };
  if (amount <= 0) return { state: prev, error: "Enter an amount" };
  const state = clone(prev);
  if (source === "unassigned") {
    if (state.unassigned < amount) return { state: prev, error: `Only ${fmt(state.unassigned)} is unassigned` };
    state.unassigned -= amount;
  } else {
    const e = env(state, source);
    if (!e) return { state: prev, error: "No such envelope" };
    if (available(e) < amount) return { state: prev, error: `${e.name} only has ${fmt(available(e))} free` };
    e.balance -= amount;
    e.spentThisPeriod += amount;
  }
  state.transfers = [
    {
      id: uid(),
      direction: "out",
      amount,
      createdAt: state.now,
      arrivesAt: addDays(state.now, ACH_DAYS),
      status: "pending",
      envelopeId: source === "unassigned" ? undefined : source,
      reason: "manual",
      memo,
    },
    ...state.transfers,
  ];
  return { state };
}

export function completeTransfer(prev: AppState, id: string): Result {
  const state = clone(prev);
  const t = state.transfers.find((x) => x.id === id);
  if (!t || t.status !== "pending") return { state: prev };
  t.status = "completed";
  t.arrivesAt = state.now;
  if (t.direction === "in") {
    state.unassigned += t.amount;
    notify(state, { kind: "money", title: `${fmt(t.amount)} arrived`, body: "It's in Unassigned. Give it a job before the card can spend it." });
  }
  return { state };
}
