import { ArrowDownLeft, ArrowUpRight, CalendarClock, Hourglass, RotateCcw } from "lucide-react";
import { ReactNode } from "react";
import { AppState } from "../types";
import { addMonths, fmt, startOfMonth } from "../engine/util";
import { MerchantAvatar } from "./meta";

export interface Upcoming {
  key: string;
  at: string;
  icon: ReactNode;
  title: string;
  amount?: string;
}

// Everything the demo clock will do next, soonest first.
export function upcoming(state: AppState, limit = 6): Upcoming[] {
  const items: Upcoming[] = [];
  const iconBox = (node: ReactNode, tone = "") => <span className={`notice-icon ${tone}`}>{node}</span>;
  for (const t of state.transactions.filter((x) => x.status === "pending")) {
    items.push({ key: t.id, at: t.settleAt ?? state.now, icon: iconBox(<Hourglass size={14} />, "s-warning"), title: `${t.merchant} hold settles`, amount: fmt(t.amount) });
  }
  for (const t of state.transfers.filter((x) => x.status === "pending")) {
    items.push({
      key: t.id,
      at: t.arrivesAt,
      icon: iconBox(t.direction === "in" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />, t.direction === "in" ? "s-good" : ""),
      title: t.direction === "in" ? "Transfer lands" : t.memo ?? "Transfer out arrives",
      amount: `${t.direction === "in" ? "+" : "-"}${fmt(t.amount)}`,
    });
  }
  for (const a of state.autoTransfers.filter((x) => x.active)) {
    items.push({ key: a.id, at: a.nextAt, icon: iconBox(<CalendarClock size={14} />, "s-good"), title: "Auto-transfer starts", amount: `+${fmt(a.amount)}` });
  }
  for (const c of state.scheduledCharges) {
    items.push({ key: c.merchant, at: c.nextAt, icon: <MerchantAvatar name={c.merchant} mcc={c.mcc} size={30} />, title: `${c.merchant} renews`, amount: `-${fmt(c.amount)}` });
  }
  if (state.envelopes.length > 0) {
    items.push({ key: "reset", at: addMonths(startOfMonth(state.now), 1), icon: iconBox(<RotateCcw size={14} />), title: "Monthly categories reset" });
  }
  return items.filter((i) => i.at >= state.now.slice(0, 10)).sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit);
}
