import { AppState, AutoTransfer, Cents, IncomeEntry } from "../types";
import { findMerchant } from "./catalog";
import { authorize, available, checkAlerts, completeTransfer, notify, settle } from "./ledger";
import { periodStartFor } from "./presets";
import { addDays, addMonths, clone, fmt, startOfDay, sum, uid } from "./util";

export function nextAutoDate(at: string, cadence: AutoTransfer["cadence"]): string {
  if (cadence === "weekly") return addDays(at, 7);
  if (cadence === "biweekly") return addDays(at, 14);
  return addMonths(at, 1);
}

// Start of a new week or month for an envelope. Rollover envelopes keep what's left.
// Everything else sends its free money back to Unassigned so it gets reassigned deliberately,
// instead of silently piling up.
export function rollPeriods(state: AppState): void {
  let returned = 0;
  let refilled = 0;
  const reset: string[] = [];
  for (const e of state.envelopes) {
    const start = periodStartFor(e.cadence, state.now);
    if (start === e.periodStart) continue;
    if (!e.rollover) {
      const free = available(e);
      if (free > 0) {
        e.balance -= free;
        state.unassigned += free;
        returned += free;
      }
    }
    e.spentThisPeriod = 0;
    e.fundedThisPeriod = 0;
    e.periodStart = start;
    e.warned80 = false;
    e.warned100 = false;
    reset.push(e.name);
    // Weekly envelopes were already planned as part of the month, so they top themselves back up.
    // Monthly ones wait for you: a new month is a new budget.
    if (e.cadence === "weekly") {
      const topUp = Math.min(Math.max(0, e.target - e.balance), state.unassigned);
      e.balance += topUp;
      e.fundedThisPeriod += topUp;
      state.unassigned -= topUp;
      refilled += topUp;
    }
  }
  if (reset.length > 0) {
    notify(state, {
      kind: "info",
      title: "New budget period",
      body: [
        `${reset.join(", ")} reset.`,
        refilled > 0 ? `Weekly categories topped up with ${fmt(refilled)}.` : "",
        returned > 0 ? `${fmt(returned)} of unspent money went back to Unassigned. Give it a job.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
}

// The demo clock. Everything that happens "later" in a real bank (ACH landing, holds settling,
// scheduled transfers, subscriptions renewing, the physical card arriving) happens here.
export function advanceDays(prev: AppState, days: number): AppState {
  let state = clone(prev);
  for (let d = 0; d < days; d++) {
    state.now = addDays(state.now, 1);
    const today = state.now;

    for (const t of state.transfers.filter((x) => x.status === "pending" && x.arrivesAt <= today)) {
      state = completeTransfer(state, t.id).state;
    }

    for (const a of state.autoTransfers.filter((x) => x.active && x.nextAt <= today)) {
      if (state.bank) {
        state.transfers = [
          {
            id: uid(),
            direction: "in",
            amount: a.amount,
            createdAt: today,
            arrivesAt: addDays(today, 2),
            status: "pending",
            reason: "auto",
          },
          ...state.transfers,
        ];
        notify(state, { kind: "money", title: `Auto-transfer started: ${fmt(a.amount)}`, body: "Lands in about 2 days." });
      }
      a.nextAt = nextAutoDate(a.nextAt, a.cadence);
    }

    for (const t of state.transactions.filter((x) => x.status === "pending" && x.settleAt && x.settleAt <= today)) {
      state = settle(state, t.id).state;
    }

    for (const c of state.scheduledCharges.filter((x) => x.nextAt <= today)) {
      const m = findMerchant(c.merchant);
      state = authorize(state, { merchant: c.merchant, mcc: m?.mcc ?? c.mcc, amount: c.amount }).state;
      const same = state.scheduledCharges.find((x) => x.merchant === c.merchant)!;
      same.nextAt = addMonths(same.nextAt, 1);
    }

    const p = state.card?.physical;
    if (p && p.status === "shipping" && p.arrivesAt <= today) {
      p.status = "delivered";
      notify(state, { kind: "card", title: "Your physical card arrived", body: "Activate it in the Card tab before using it." });
    }

    rollPeriods(state);
    for (const e of state.envelopes) checkAlerts(state, e.id);
  }
  return state;
}

// Irregular income: budget off what actually came in over the last few months, not a guess.
export function trailingAverage(log: IncomeEntry[], now: string, months: 3 | 6): { average: Cents; monthsOfData: number } {
  const windowStart = addMonths(startOfDay(now), -months);
  const inWindow = log.filter((e) => e.at >= windowStart && e.at <= now);
  if (inWindow.length === 0) return { average: 0, monthsOfData: 0 };
  const oldest = new Date(inWindow.reduce((a, b) => (a.at < b.at ? a : b)).at);
  const current = new Date(now);
  // count calendar months touched, so three monthly deposits read as three months, not two
  const span = (current.getUTCFullYear() - oldest.getUTCFullYear()) * 12 + current.getUTCMonth() - oldest.getUTCMonth() + 1;
  const monthsOfData = Math.min(months, Math.max(1, span));
  return { average: Math.round(sum(inWindow.map((e) => e.amount)) / monthsOfData), monthsOfData };
}
