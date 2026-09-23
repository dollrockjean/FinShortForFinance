import { createContext, useContext } from "react";
import { AppState, Envelope } from "../types";
import { available } from "../engine/ledger";
import { MCC, MERCHANTS } from "../engine/catalog";
import { fmt } from "../engine/util";
import { GROUP_LABEL, KIND_META, KindBadge, MerchantAvatar, EnvBadge } from "./meta";
import { Option } from "./ui";

const GROUP_ORDER = { needs: 0, wants: 1, saving: 2 };

export function sortByGroup(envs: Envelope[]): Envelope[] {
  return [...envs].sort((a, b) => GROUP_ORDER[KIND_META[a.kind].group] - GROUP_ORDER[KIND_META[b.kind].group] || a.priority - b.priority);
}

export function envelopeOptions(envs: Envelope[], opts: { showBalance?: boolean; grouped?: boolean } = {}): Option<string>[] {
  return sortByGroup(envs).map((e) => ({
    value: e.id,
    label: e.name,
    icon: <EnvBadge e={e} size={30} />,
    meta: opts.showBalance === false ? undefined : fmt(available(e)),
    group: opts.grouped === false ? undefined : GROUP_LABEL[KIND_META[e.kind].group],
    description: e.cardSpendable ? undefined : "Not spendable by card",
  }));
}

export function merchantOptions(): Option<string>[] {
  return [
    ...MERCHANTS.map((m) => ({
      value: m.name,
      label: m.name,
      icon: <MerchantAvatar name={m.name} mcc={m.mcc} size={30} />,
      description: `MCC ${m.mcc} · ${MCC[m.mcc]?.label}${m.hold ? " · pre-auth hold" : ""}`,
    })),
    { value: "__custom", label: "Somewhere else", description: "Type a name and pick a merchant code", icon: <MerchantAvatar name="?" size={30} /> },
  ];
}

export function mccOptions(): Option<string>[] {
  return Object.entries(MCC).map(([code, v]) => ({
    value: code,
    label: `${code}  ${v.label}`,
    icon: v.kind ? <KindBadge kind={v.kind} size={30} /> : <MerchantAvatar name="?" mcc={code} size={30} />,
    description: v.ambiguous ? "Covers several kinds of spending" : v.group === "gambling" ? "Gambling" : undefined,
  }));
}

// UI-only state that shouldn't persist: which overlay is open.
export interface UiState {
  openPayments: (tab?: "card" | "cash" | "deposit" | "time") => void;
}

export const UiCtx = createContext<UiState>({ openPayments: () => {} });
export const useUi = () => useContext(UiCtx);

export function initials(state: AppState): string {
  const n = state.user?.name ?? "?";
  return n
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
