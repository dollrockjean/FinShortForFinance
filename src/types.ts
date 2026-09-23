// All money is stored as integer cents. Never floats.
export type Cents = number;

export type EnvelopeKind =
  | "groceries"
  | "household"
  | "transport"
  | "dining"
  | "subscriptions"
  | "shopping"
  | "entertainment"
  | "health"
  | "utilities"
  | "housing"
  | "debt"
  | "emergency"
  | "savings"
  | "custom";

export type Cadence = "weekly" | "monthly";

export interface Envelope {
  id: string;
  name: string;
  kind: EnvelopeKind;
  cadence: Cadence;
  target: Cents; // planned amount per period
  percent?: number; // set when the envelope is percent-of-income based (0-100)
  rollover: boolean; // unspent money carries into the next period instead of returning to Unassigned
  cardSpendable: boolean; // false for savings-type envelopes: card can't draw on them directly
  balance: Cents; // money assigned and not yet spent. Includes anything on hold.
  held: Cents; // pending pre-auth holds against this envelope
  spentThisPeriod: Cents;
  fundedThisPeriod: Cents; // money assigned in this period (not counting what rolled over)
  periodStart: string; // ISO
  priority: number; // lower fills first when assigning a paycheck
  warned80: boolean;
  warned100: boolean;
}

export interface Allocation {
  envelopeId: string;
  amount: Cents;
}

export type DeclineCode = "insufficient" | "frozen" | "blocked_mcc" | "not_spendable" | "no_envelope";

export interface Transaction {
  id: string;
  createdAt: string;
  merchant: string;
  mcc?: string;
  mccLabel?: string;
  amount: Cents; // authorized amount for settled/declined; estimated final for pending
  holdAmount?: Cents; // what's actually being held while pending
  settleAt?: string; // when a pending hold settles on the demo clock
  status: "pending" | "settled" | "declined";
  source: "card" | "manual";
  allocations: Allocation[]; // supports split transactions
  suggestionReason?: string;
  confirmed: boolean; // user confirmed or changed the suggested envelope
  decline?: {
    code: DeclineCode;
    message: string;
    envelopeId?: string;
    shortBy?: Cents;
    coveredBy?: string; // id of the retry transaction after an emergency-fund cover
  };
  override?: {
    fromEnvelopeId: string;
    amount: Cents;
    note: string;
  };
}

export interface Transfer {
  id: string;
  direction: "in" | "out";
  amount: Cents;
  createdAt: string;
  arrivesAt: string;
  status: "pending" | "completed";
  envelopeId?: string; // for transfers out: the envelope the money left
  reason: "manual" | "auto" | "cash" | "onboarding";
  memo?: string;
}

export interface AutoTransfer {
  id: string;
  amount: Cents;
  cadence: "weekly" | "biweekly" | "monthly";
  nextAt: string;
  active: boolean;
}

export interface ScheduledCharge {
  merchant: string;
  mcc: string;
  amount: Cents;
  nextAt: string;
}

export interface IncomeEntry {
  id: string;
  at: string;
  amount: Cents;
  source: string;
}

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type Goal = "debt" | "emergency" | "discipline" | "purchase";

export interface IncomeProfile {
  frequency: PayFrequency;
  monthlyIncome: Cents; // typical take-home, or the trailing average in irregular mode
  irregular: boolean;
  averagingMonths: 3 | 6;
  debtTotal: Cents;
  householdSize: number;
  goal: Goal;
}

export type PresetId = "starter" | "balanced" | "percent" | "custom";

export interface User {
  name: string;
  email: string;
  provider: "password" | "google" | "apple";
}

export interface Security {
  emailVerified: boolean;
  twoFactor: "totp" | "sms" | null;
  totpSecret?: string;
  smsPhone?: string;
}

export interface Kyc {
  status: "none" | "verified" | "review" | "failed";
  legalName?: string;
  ssnLast4?: string;
  city?: string;
  state?: string;
}

export interface LinkedBank {
  institution: string;
  accountName: string;
  mask: string;
}

export interface Card {
  last4: string;
  expiry: string;
  status: "active" | "frozen";
  blockGambling: boolean;
  physical: null | {
    status: "shipping" | "delivered" | "active";
    orderedAt: string;
    arrivesAt: string;
  };
}

export interface Notice {
  id: string;
  at: string;
  kind: "warn" | "over" | "decline" | "money" | "card" | "info" | "subscription";
  title: string;
  body: string;
  read: boolean;
}

export type OnboardingStep =
  | "landing"
  | "signup"
  | "verifyEmail"
  | "twoFactor"
  | "kyc"
  | "questionnaire"
  | "preset"
  | "review"
  | "fund"
  | "assign"
  | "card"
  | "done";

export type View = "home" | "budget" | "activity" | "money" | "card" | "settings";

export interface AppState {
  version: 2;
  theme: "light" | "dark" | "system";
  now: string; // the demo clock
  testMode: boolean;
  step: OnboardingStep;
  view: View;
  user: User | null;
  security: Security;
  kyc: Kyc;
  income: IncomeProfile | null;
  incomeLog: IncomeEntry[];
  preset: PresetId | null;
  envelopes: Envelope[];
  unassigned: Cents;
  transactions: Transaction[];
  transfers: Transfer[];
  autoTransfers: AutoTransfer[];
  scheduledCharges: ScheduledCharge[];
  card: Card | null;
  bank: LinkedBank | null;
  corrections: Record<string, Record<string, number>>; // merchant -> envelopeId -> times the user picked it
  dismissedSubscriptions: string[];
  notices: Notice[];
  nextPurchaseEnvelopeId: string | null;
}
