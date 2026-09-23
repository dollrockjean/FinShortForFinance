import { Cents, EnvelopeKind } from "../types";

// A small slice of real ISO 18245 merchant category codes. MCC is coarse on purpose:
// 5310/5311/5399 cover big-box stores that sell groceries, electronics and gifts under one code.
export const MCC: Record<string, { label: string; kind: EnvelopeKind | null; ambiguous?: boolean; group?: "gambling" }> = {
  "5411": { label: "Grocery stores", kind: "groceries" },
  "5499": { label: "Misc. food stores", kind: "groceries" },
  "5541": { label: "Service stations", kind: "transport" },
  "5542": { label: "Automated fuel dispensers", kind: "transport" },
  "4121": { label: "Taxis and rideshare", kind: "transport" },
  "4111": { label: "Commuter transit", kind: "transport" },
  "5812": { label: "Eating places, restaurants", kind: "dining" },
  "5814": { label: "Fast food", kind: "dining" },
  "5815": { label: "Digital media", kind: "subscriptions" },
  "4899": { label: "Cable and streaming services", kind: "subscriptions" },
  "5310": { label: "Discount stores", kind: "shopping", ambiguous: true },
  "5311": { label: "Department stores", kind: "shopping", ambiguous: true },
  "5399": { label: "General merchandise", kind: "shopping", ambiguous: true },
  "5942": { label: "Book stores", kind: "shopping" },
  "5200": { label: "Home supply warehouse", kind: "household" },
  "7832": { label: "Motion picture theaters", kind: "entertainment" },
  "7997": { label: "Membership clubs", kind: "health" },
  "5912": { label: "Drug stores and pharmacies", kind: "health", ambiguous: true },
  "8011": { label: "Doctors", kind: "health" },
  "4900": { label: "Utilities", kind: "utilities" },
  "7011": { label: "Hotels and lodging", kind: "entertainment" },
  "7995": { label: "Betting and casino gambling", kind: null, group: "gambling" },
};

export interface DemoMerchant {
  name: string;
  mcc: string;
  typical: [Cents, Cents]; // low and high end of a normal charge
  fixed?: Cents;
  hold?: Cents; // pre-auth hold larger than the final charge
}

export const MERCHANTS: DemoMerchant[] = [
  { name: "Whole Foods Market", mcc: "5411", typical: [2500, 12000] },
  { name: "Trader Joe's", mcc: "5411", typical: [2000, 9000] },
  { name: "Walmart", mcc: "5310", typical: [1500, 15000] },
  { name: "Target", mcc: "5310", typical: [1500, 18000] },
  { name: "Amazon", mcc: "5399", typical: [1000, 25000] },
  { name: "Shell", mcc: "5542", typical: [2500, 6500], hold: 10000 },
  { name: "Chevron", mcc: "5542", typical: [2500, 6500], hold: 10000 },
  { name: "Uber", mcc: "4121", typical: [900, 4500] },
  { name: "Chipotle", mcc: "5814", typical: [1100, 2400] },
  { name: "Starbucks", mcc: "5814", typical: [450, 1400] },
  { name: "Olive Garden", mcc: "5812", typical: [2800, 8500] },
  { name: "Netflix", mcc: "4899", typical: [1549, 1549], fixed: 1549 },
  { name: "Spotify", mcc: "5815", typical: [1199, 1199], fixed: 1199 },
  { name: "CVS Pharmacy", mcc: "5912", typical: [800, 7000] },
  { name: "Planet Fitness", mcc: "7997", typical: [1500, 1500], fixed: 1500 },
  { name: "Home Depot", mcc: "5200", typical: [1500, 20000] },
  { name: "AMC Theatres", mcc: "7832", typical: [1400, 4200] },
  { name: "Marriott", mcc: "7011", typical: [14000, 32000], hold: 40000 },
  { name: "Lucky Star Casino", mcc: "7995", typical: [2000, 20000] },
];

export function findMerchant(name: string): DemoMerchant | undefined {
  const key = name.trim().toLowerCase();
  return MERCHANTS.find((m) => m.name.toLowerCase() === key);
}

export const KIND_LABELS: Record<EnvelopeKind, string> = {
  groceries: "Groceries",
  household: "Household",
  transport: "Gas and transport",
  dining: "Eating out",
  subscriptions: "Subscriptions",
  shopping: "Shopping",
  entertainment: "Fun",
  health: "Health",
  utilities: "Utilities",
  housing: "Rent or mortgage",
  debt: "Debt payoff",
  emergency: "Emergency fund",
  savings: "Savings goal",
  custom: "Other",
};

// Savings-type envelopes are not meant to be spent by card. Money leaves them by transfer.
export const NOT_CARD_SPENDABLE: EnvelopeKind[] = ["debt", "emergency", "savings", "housing"];
