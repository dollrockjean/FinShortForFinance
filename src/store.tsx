import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import {
  AppState,
  CategoryId,
  Envelope,
  IncomeProfile,
  OnboardingStep,
  PresetId,
  Transaction,
  User,
  View,
} from "./types";
import { buildEnvelopesFromPreset, findMerchant } from "./data";
import { envelopeAvailable, uid } from "./utils";

const STORAGE_KEY = "fin-poc-state-v1";

function freshState(): AppState {
  return {
    theme: "light",
    testMode: false,
    onboardingStep: "landing",
    view: "dashboard",
    user: null,
    income: null,
    preset: null,
    envelopes: [],
    transactions: [],
    card: null,
    merchantCategoryBias: {},
    linkedBank: null,
  };
}

type Action =
  | { type: "SET_THEME"; theme: "light" | "dark" }
  | { type: "SET_STEP"; step: OnboardingStep }
  | { type: "SET_VIEW"; view: View }
  | { type: "SIGNUP"; name: string; email: string }
  | { type: "VERIFY_2FA" }
  | { type: "SUBMIT_KYC" }
  | { type: "SUBMIT_QUESTIONNAIRE"; income: IncomeProfile }
  | { type: "SELECT_PRESET"; preset: PresetId }
  | { type: "UPDATE_ENVELOPES"; envelopes: Envelope[] }
  | { type: "CONFIRM_ENVELOPES" }
  | { type: "FUND_ACCOUNT"; bankName: string; amount: number }
  | { type: "ISSUE_CARD" }
  | { type: "ENTER_TEST_MODE" }
  | {
      type: "SWIPE_CARD";
      merchant: string;
      category: CategoryId;
      amount: number;
      isHold?: boolean;
      holdAmount?: number;
    }
  | { type: "OVERRIDE_DECLINE"; txId: string; note: string }
  | { type: "SETTLE_TRANSACTION"; txId: string; finalAmount: number }
  | { type: "REASSIGN_TRANSACTION"; txId: string; splits: { category: CategoryId; amount: number }[] }
  | { type: "ADD_MANUAL_EXPENSE"; merchant: string; category: CategoryId; amount: number }
  | { type: "ADD_FUNDS"; amount: number }
  | { type: "RESET" };

function envelopeFor(envelopes: Envelope[], category: CategoryId): Envelope {
  const e = envelopes.find((x) => x.category === category);
  if (!e) throw new Error(`no envelope for ${category}`);
  return e;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_THEME":
      return { ...state, theme: action.theme };

    case "SET_STEP":
      return { ...state, onboardingStep: action.step };

    case "SET_VIEW":
      return { ...state, view: action.view };

    case "SIGNUP":
      return {
        ...state,
        user: { name: action.name, email: action.email },
        onboardingStep: "twofactor",
      };

    case "VERIFY_2FA":
      return { ...state, onboardingStep: "kyc" };

    case "SUBMIT_KYC":
      return { ...state, onboardingStep: "questionnaire" };

    case "SUBMIT_QUESTIONNAIRE":
      return { ...state, income: action.income, onboardingStep: "preset" };

    case "SELECT_PRESET": {
      if (!state.income) return state;
      const envelopes = buildEnvelopesFromPreset(action.preset, state.income);
      return { ...state, preset: action.preset, envelopes, onboardingStep: "envelopeReview" };
    }

    case "UPDATE_ENVELOPES":
      return { ...state, envelopes: action.envelopes };

    case "CONFIRM_ENVELOPES":
      return { ...state, onboardingStep: "fund" };

    case "FUND_ACCOUNT": {
      const envelopes = state.envelopes.map((e) =>
        e.category === "unassigned" ? { ...e, allocated: e.allocated + action.amount } : e
      );
      return { ...state, envelopes, linkedBank: action.bankName, onboardingStep: "cardIssued" };
    }

    case "ISSUE_CARD":
      return {
        ...state,
        card: { last4: String(Math.floor(1000 + Math.random() * 9000)), status: "active", virtual: true },
      };

    case "ENTER_TEST_MODE":
      return seedDemoState();

    case "SWIPE_CARD": {
      const required = action.isHold ? action.holdAmount ?? action.amount : action.amount;
      const envelope = envelopeFor(state.envelopes, action.category);
      const available = envelopeAvailable(envelope);
      const tx: Transaction = {
        id: uid(),
        date: new Date().toISOString(),
        merchant: action.merchant,
        category: action.category,
        amount: action.amount,
        status: "approved",
        source: "card",
        holdAmount: action.isHold ? action.holdAmount : undefined,
      };

      if (available < required) {
        const shortfall = Math.round((required - available) * 100) / 100;
        const declinedTx: Transaction = {
          ...tx,
          status: "declined",
          declineReason: `Insufficient funds in ${action.category} — short by $${shortfall.toFixed(2)}`,
        };
        return { ...state, transactions: [declinedTx, ...state.transactions] };
      }

      let envelopes = state.envelopes;
      if (action.isHold) {
        envelopes = state.envelopes.map((e) =>
          e.category === action.category ? { ...e, pendingHold: e.pendingHold + (action.holdAmount ?? action.amount) } : e
        );
        tx.status = "pending";
      } else {
        envelopes = state.envelopes.map((e) =>
          e.category === action.category ? { ...e, spent: e.spent + action.amount } : e
        );
      }

      return { ...state, envelopes, transactions: [tx, ...state.transactions] };
    }

    case "OVERRIDE_DECLINE": {
      const tx = state.transactions.find((t) => t.id === action.txId);
      if (!tx || tx.status !== "declined") return state;
      const category = tx.category;
      const envelope = envelopeFor(state.envelopes, category);
      const emergency = envelopeFor(state.envelopes, "emergency");
      const availableInCategory = Math.max(0, envelopeAvailable(envelope));
      const shortfall = Math.round((tx.amount - availableInCategory) * 100) / 100;
      if (envelopeAvailable(emergency) < shortfall) return state;

      const envelopes = state.envelopes.map((e) => {
        if (e.category === category) return { ...e, spent: e.spent + availableInCategory };
        if (e.category === "emergency") return { ...e, spent: e.spent + shortfall };
        return e;
      });

      const transactions = state.transactions.map((t) =>
        t.id === action.txId
          ? { ...t, status: "approved" as const, overrideFrom: "emergency" as CategoryId, overrideNote: action.note, declineReason: undefined }
          : t
      );

      return { ...state, envelopes, transactions };
    }

    case "SETTLE_TRANSACTION": {
      const tx = state.transactions.find((t) => t.id === action.txId);
      if (!tx || tx.status !== "pending") return state;
      const envelopes = state.envelopes.map((e) => {
        if (e.category !== tx.category) return e;
        return {
          ...e,
          pendingHold: Math.max(0, e.pendingHold - (tx.holdAmount ?? tx.amount)),
          spent: e.spent + action.finalAmount,
        };
      });
      const transactions = state.transactions.map((t) =>
        t.id === action.txId ? { ...t, status: "approved" as const, amount: action.finalAmount, settled: true } : t
      );
      return { ...state, envelopes, transactions };
    }

    case "REASSIGN_TRANSACTION": {
      const tx = state.transactions.find((t) => t.id === action.txId);
      if (!tx || tx.status === "declined" || tx.status === "pending") return state;

      const previousSplits = tx.splits && tx.splits.length > 0 ? tx.splits : [{ category: tx.category, amount: tx.amount }];
      let envelopes = state.envelopes.map((e) => {
        const reversal = previousSplits.find((s) => s.category === e.category);
        return reversal ? { ...e, spent: e.spent - reversal.amount } : e;
      });
      envelopes = envelopes.map((e) => {
        const applied = action.splits.find((s) => s.category === e.category);
        return applied ? { ...e, spent: e.spent + applied.amount } : e;
      });

      const singleCategory = action.splits.length === 1 ? action.splits[0].category : tx.category;
      const bias = { ...state.merchantCategoryBias };
      if (action.splits.length === 1) bias[tx.merchant] = action.splits[0].category;

      const transactions = state.transactions.map((t) =>
        t.id === action.txId
          ? {
              ...t,
              category: singleCategory,
              splits: action.splits.length > 1 ? action.splits : undefined,
            }
          : t
      );

      return { ...state, envelopes, transactions, merchantCategoryBias: bias };
    }

    case "ADD_MANUAL_EXPENSE": {
      const tx: Transaction = {
        id: uid(),
        date: new Date().toISOString(),
        merchant: action.merchant,
        category: action.category,
        amount: action.amount,
        status: "approved",
        source: "manual",
      };
      const envelopes = state.envelopes.map((e) =>
        e.category === action.category ? { ...e, spent: e.spent + action.amount } : e
      );
      return { ...state, envelopes, transactions: [tx, ...state.transactions] };
    }

    case "ADD_FUNDS": {
      const envelopes = state.envelopes.map((e) =>
        e.category === "unassigned" ? { ...e, allocated: e.allocated + action.amount } : e
      );
      return { ...state, envelopes };
    }

    case "RESET":
      return freshState();

    default:
      return state;
  }
}

function seedDemoState(): AppState {
  const income: IncomeProfile = {
    frequency: "biweekly",
    monthlyIncome: 4200,
    dependents: 1,
    hasDebt: true,
    goal: "debt",
  };
  const envelopes = buildEnvelopesFromPreset("balanced", income);

  const withSpend = (cat: CategoryId, spent: number, hold = 0) => {
    const e = envelopeFor(envelopes, cat);
    e.spent = spent;
    e.pendingHold = hold;
  };
  withSpend("groceries", Math.round(envelopeFor(envelopes, "groceries").allocated * 0.62));
  withSpend("transport", Math.round(envelopeFor(envelopes, "transport").allocated * 0.55), 100);
  withSpend("dining", Math.round(envelopeFor(envelopes, "dining").allocated * 1.0));
  withSpend("subscriptions", Math.round(envelopeFor(envelopes, "subscriptions").allocated * 0.9));
  withSpend("shopping", Math.round(envelopeFor(envelopes, "shopping").allocated * 0.4));
  withSpend("entertainment", Math.round(envelopeFor(envelopes, "entertainment").allocated * 0.3));
  withSpend("health", Math.round(envelopeFor(envelopes, "health").allocated * 0.2));
  withSpend("debt", Math.round(envelopeFor(envelopes, "debt").allocated * 1.0));
  withSpend("emergency", Math.round(envelopeFor(envelopes, "emergency").allocated * 0.05));

  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

  const transactions: Transaction[] = [
    { id: uid(), date: daysAgo(0), merchant: "Chevron", category: "transport", amount: 42, holdAmount: 100, status: "pending", source: "card" },
    { id: uid(), date: daysAgo(1), merchant: "Chipotle", category: "dining", amount: 14, status: "declined", source: "card", declineReason: "Insufficient funds in dining — short by $14.00" },
    { id: uid(), date: daysAgo(1), merchant: "Chipotle", category: "dining", amount: 14, status: "approved", source: "card", overrideFrom: "emergency", overrideNote: "Team lunch, paid it and moved on" },
    { id: uid(), date: daysAgo(2), merchant: "Whole Foods Market", category: "groceries", amount: 68.42, status: "approved", source: "card" },
    { id: uid(), date: daysAgo(2), merchant: "Netflix", category: "subscriptions", amount: 15.49, status: "approved", source: "card" },
    { id: uid(), date: daysAgo(3), merchant: "Target", category: "shopping", amount: 54.1, status: "approved", source: "card" },
    { id: uid(), date: daysAgo(4), merchant: "Starbucks", category: "dining", amount: 6.25, status: "approved", source: "card" },
    { id: uid(), date: daysAgo(5), merchant: "Trader Joe's", category: "groceries", amount: 41.9, status: "approved", source: "card" },
    { id: uid(), date: daysAgo(6), merchant: "Uber", category: "transport", amount: 18, status: "approved", source: "card" },
    { id: uid(), date: daysAgo(7), merchant: "Cash — farmers market", category: "groceries", amount: 12, status: "approved", source: "manual" },
    { id: uid(), date: daysAgo(8), merchant: "AMC Theatres", category: "entertainment", amount: 26, status: "approved", source: "card" },
    { id: uid(), date: daysAgo(9), merchant: "CVS Pharmacy", category: "health", amount: 19.3, status: "approved", source: "card" },
  ];

  return {
    theme: "light",
    testMode: true,
    onboardingStep: "done",
    view: "dashboard",
    user: { name: "Jordan Rivera", email: "jordan@example.com" },
    income,
    preset: "balanced",
    envelopes,
    transactions,
    card: { last4: "4821", status: "active", virtual: true },
    merchantCategoryBias: {},
    linkedBank: "Chase •••• 1187",
  };
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

function loadInitial(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...freshState(), ...JSON.parse(raw) };
  } catch {
    // ignore corrupt storage
  }
  return freshState();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage unavailable, proof-of-concept keeps running in memory only
    }
  }, [state]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", state.theme);
  }, [state.theme]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function suggestedCategory(merchantName: string, bias: Record<string, CategoryId>): CategoryId {
  if (bias[merchantName]) return bias[merchantName];
  const m = findMerchant(merchantName);
  return m ? m.category : "shopping";
}
