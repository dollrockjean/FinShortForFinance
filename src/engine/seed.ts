import { AppState, Cents, IncomeProfile } from "../types";
import { findMerchant } from "./catalog";
import { advanceDays } from "./clock";
import { applyPlan, authorize, planFill, reassign, transferIn, transferOut } from "./ledger";
import { buildEnvelopes, makeEnvelope } from "./presets";
import { addDays, startOfDay, uid } from "./util";

export function todayNoon(): string {
  return addDays(startOfDay(new Date().toISOString()), 0.5);
}

export function freshState(now = todayNoon()): AppState {
  return {
    version: 2,
    theme: "system",
    now,
    testMode: false,
    step: "landing",
    view: "home",
    user: null,
    security: { emailVerified: false, twoFactor: null },
    kyc: { status: "none" },
    income: null,
    incomeLog: [],
    preset: null,
    envelopes: [],
    unassigned: 0,
    transactions: [],
    transfers: [],
    autoTransfers: [],
    scheduledCharges: [],
    card: null,
    bank: null,
    corrections: {},
    dismissedSubscriptions: [],
    notices: [],
    nextPurchaseEnvelopeId: null,
  };
}

export function newCard(now: string): AppState["card"] {
  const d = new Date(now);
  return {
    last4: String(1000 + Math.floor(Math.random() * 9000)),
    expiry: `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String((d.getUTCFullYear() + 4) % 100).padStart(2, "0")}`,
    status: "active",
    blockGambling: true,
    physical: null,
  };
}

// tiny deterministic PRNG so the demo account looks the same every time
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Builds the test-mode account by replaying ~10 weeks of real activity through the engine,
// so every balance on screen is one the ledger actually produced.
export function demoState(today = todayNoon()): AppState {
  const rand = rng(42);
  const between = (lo: Cents, hi: Cents) => Math.round(lo + rand() * (hi - lo));
  const DAYS = 70;
  const start = addDays(today, -DAYS);

  const income: IncomeProfile = {
    frequency: "biweekly",
    monthlyIncome: 420000,
    irregular: false,
    averagingMonths: 3,
    debtTotal: 840000,
    householdSize: 2,
    goal: "debt",
  };

  let envelopes = buildEnvelopes("balanced", income, start);
  const shopping = envelopes.find((e) => e.kind === "shopping")!;
  shopping.target -= 12600;
  envelopes.splice(envelopes.indexOf(shopping), 0, makeEnvelope("household", { now: start, target: 12600, priority: 35 }));
  envelopes = envelopes.map((e) => (e.kind === "emergency" ? { ...e, balance: 100000 } : e));

  let s: AppState = {
    ...freshState(start),
    testMode: true,
    step: "done",
    user: { name: "Jordan Rivera", email: "jordan@example.com", provider: "password" },
    security: { emailVerified: true, twoFactor: "totp" },
    kyc: { status: "verified", legalName: "Jordan A. Rivera", ssnLast4: "0000", city: "Austin", state: "TX" },
    income,
    preset: "balanced",
    envelopes,
    card: { last4: "4821", expiry: "09/30", status: "active", blockGambling: true, physical: null },
    bank: { institution: "Chase", accountName: "Total Checking", mask: "1187" },
    autoTransfers: [],
    scheduledCharges: [
      { merchant: "Netflix", mcc: "4899", amount: 1549, nextAt: addDays(start, 3) },
      { merchant: "Spotify", mcc: "5815", amount: 1199, nextAt: addDays(start, 9) },
      { merchant: "Planet Fitness", mcc: "7997", amount: 1500, nextAt: addDays(start, 5) },
    ],
  };

  const id = (kind: string) => s.envelopes.find((e) => e.kind === kind)!.id;
  const swipe = (merchant: string, amount: Cents, finalAmount?: Cents) => {
    const m = findMerchant(merchant)!;
    const r = authorize(s, { merchant, mcc: m.mcc, amount: finalAmount ?? amount, hold: m.hold });
    s = r.state;
    return r.txId!;
  };
  const payday = (amount: Cents) => {
    s = transferIn(s, amount, "auto", true).state;
    s.incomeLog = [{ id: uid(), at: s.now, amount, source: "Acme Corp payroll" }, ...s.incomeLog];
  };
  const fill = () => {
    s = applyPlan(s, planFill(s)).state;
  };

  for (let day = 0; day <= DAYS; day++) {
    if (day === 0) s = transferIn(s, 230000, "onboarding", true).state; // opening balance from old checking
    if (day % 14 === 0) {
      payday(194000);
      if (day < DAYS - 3) fill();
    }
    const dom = new Date(s.now).getUTCDate();
    if (dom === 1) fill();

    const rent = s.envelopes.find((e) => e.kind === "housing")!;
    if (rent.spentThisPeriod === 0 && rent.balance >= rent.target) {
      s = transferOut(s, rent.id, rent.target, "Rent, Oak Street Apartments").state;
    }
    const debt = s.envelopes.find((e) => e.kind === "debt")!;
    if (debt.balance > 0) s = transferOut(s, debt.id, debt.balance, "Visa payment (snowball: smallest balance first)").state;
    const util = s.envelopes.find((e) => e.kind === "utilities")!;
    if (dom === 18 && util.balance > 0) s = transferOut(s, util.id, Math.min(between(21000, 25000), util.balance), "Austin Energy").state;

    const w = day % 7;
    if (w === 1) swipe("Trader Joe's", between(6000, 9000));
    if (w === 4) swipe("Whole Foods Market", between(3000, 5500));
    if (w === 2 && day < DAYS) swipe("Shell", between(3800, 5200));
    if (w === 3) swipe("Chipotle", between(1200, 1800));
    if (w === 5) swipe("Starbucks", between(500, 900));
    if (w === 6) swipe("Olive Garden", between(3200, 4400));
    if (day % 10 === 7) swipe("Amazon", between(2000, 5500));
    if (day % 30 === 20) swipe("AMC Theatres", between(2600, 3400));
    if (day % 30 === 15) swipe("CVS Pharmacy", between(1500, 3500));
    if (day === 12 || day === 40) {
      const tx = swipe("Walmart", between(4000, 7000));
      const t = s.transactions.find((x) => x.id === tx)!;
      if (t.status === "settled") {
        const r = reassign(s, tx, [{ envelopeId: id("household"), amount: t.amount }]);
        if (!r.error) s = r.state;
      }
    }
    if (day < DAYS) s = advanceDays(s, 1);
  }

  // today: a gas pre-auth still pending, and a dinner that didn't fit
  swipe("Chevron", between(3900, 4800));
  const dining = s.envelopes.find((e) => e.kind === "dining")!;
  const dinner = Math.max(2600, dining.balance - dining.held + 1800);
  swipe("Olive Garden", dinner);

  s.notices = s.notices.map((n, i) => ({ ...n, read: i > 3 }));
  s.now = today;
  return s;
}
