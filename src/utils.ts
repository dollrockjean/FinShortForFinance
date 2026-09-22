import { Envelope } from "./types";

export function envelopeAvailable(e: Envelope): number {
  return e.allocated - e.spent - e.pendingHold;
}

export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2).replace(/\.00$/, "")}`;
}

export function moneyFull(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function pct(spent: number, allocated: number): number {
  if (allocated <= 0) return spent > 0 ? 100 : 0;
  return Math.min(100, Math.round((spent / allocated) * 100));
}

export function progressClass(spent: number, allocated: number): "" | "amber" | "red" {
  const p = allocated <= 0 ? (spent > 0 ? 100 : 0) : (spent / allocated) * 100;
  if (p >= 100) return "red";
  if (p >= 80) return "amber";
  return "";
}

export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
