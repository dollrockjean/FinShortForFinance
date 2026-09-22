export type CategoryId =
  | "groceries"
  | "transport"
  | "dining"
  | "subscriptions"
  | "shopping"
  | "entertainment"
  | "health"
  | "debt"
  | "emergency"
  | "unassigned";

export interface Category {
  id: CategoryId;
  label: string;
  spendable: boolean; // whether the Fin card can pull from this envelope directly
}

export interface Merchant {
  name: string;
  category: CategoryId;
  mccLabel: string;
  ambiguous: boolean; // this MCC realistically spans multiple real-world categories
  minAmount: number;
  maxAmount: number;
  isPreAuthHold?: boolean; // gas / hotel style: authorizes a larger hold than the eventual charge
  holdAmount?: number;
  fixedAmount?: number;
}

export interface Envelope {
  category: CategoryId;
  allocated: number;
  spent: number; // settled + approved spend against this envelope this period
  pendingHold: number; // amount currently tied up in pending pre-auths
}

export type TransactionStatus = "approved" | "declined" | "pending";

export interface Transaction {
  id: string;
  date: string; // ISO
  merchant: string;
  category: CategoryId;
  amount: number; // settled/approved amount (for pending gas holds, this is the eventual estimate, holdAmount is separate)
  status: TransactionStatus;
  source: "card" | "manual";
  splits?: { category: CategoryId; amount: number }[];
  overrideFrom?: CategoryId; // set when a decline was covered from another envelope (e.g. emergency)
  overrideNote?: string;
  holdAmount?: number;
  settled?: boolean;
  declineReason?: string;
}

export type IncomeFrequency = "weekly" | "biweekly" | "monthly" | "irregular";

export interface IncomeProfile {
  frequency: IncomeFrequency;
  monthlyIncome: number;
  dependents: number;
  hasDebt: boolean;
  goal: "debt" | "emergency" | "discipline" | "goal";
}

export type PresetId = "starter" | "balanced" | "percent" | "custom";

export interface User {
  email: string;
  name: string;
}

export interface CardInfo {
  last4: string;
  status: "active" | "frozen";
  virtual: boolean;
}

export type OnboardingStep =
  | "landing"
  | "signup"
  | "twofactor"
  | "kyc"
  | "questionnaire"
  | "preset"
  | "envelopeReview"
  | "fund"
  | "cardIssued"
  | "done";

export type View = "dashboard" | "simulate" | "transactions" | "settings";

export interface AppState {
  theme: "light" | "dark";
  testMode: boolean;
  onboardingStep: OnboardingStep;
  view: View;
  user: User | null;
  income: IncomeProfile | null;
  preset: PresetId | null;
  envelopes: Envelope[];
  transactions: Transaction[];
  card: CardInfo | null;
  merchantCategoryBias: Record<string, CategoryId>;
  linkedBank: string | null;
}
