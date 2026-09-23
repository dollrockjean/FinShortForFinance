import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Car,
  Coffee,
  Dices,
  Dumbbell,
  Film,
  Fuel,
  Hammer,
  HeartPulse,
  Home,
  Hotel,
  Landmark,
  Music,
  Package,
  PiggyBank,
  Pill,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
  Ticket,
  Tv,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { CSSProperties } from "react";
import { EnvelopeKind } from "../types";
import { MCC } from "../engine/catalog";

// Each envelope type has an icon and a color. The colors come from a CVD-checked categorical
// palette and always appear next to the icon and the name, never alone.
export const KIND_META: Record<EnvelopeKind, { icon: LucideIcon; group: "needs" | "wants" | "saving" }> = {
  housing: { icon: Home, group: "needs" },
  utilities: { icon: Zap, group: "needs" },
  groceries: { icon: ShoppingCart, group: "needs" },
  transport: { icon: Fuel, group: "needs" },
  health: { icon: HeartPulse, group: "needs" },
  household: { icon: Hammer, group: "needs" },
  dining: { icon: UtensilsCrossed, group: "wants" },
  subscriptions: { icon: Repeat, group: "wants" },
  shopping: { icon: ShoppingBag, group: "wants" },
  entertainment: { icon: Ticket, group: "wants" },
  custom: { icon: Tag, group: "wants" },
  emergency: { icon: ShieldCheck, group: "saving" },
  debt: { icon: Landmark, group: "saving" },
  savings: { icon: PiggyBank, group: "saving" },
};

export const GROUP_LABEL = { needs: "Needs", wants: "Wants", saving: "Saving and debt" } as const;

export function kindStyle(kind: EnvelopeKind): CSSProperties {
  return { ["--c" as string]: `var(--k-${kind})` };
}

export function KindBadge({ kind, size = 36 }: { kind: EnvelopeKind; size?: number }) {
  const Icon = KIND_META[kind].icon;
  return (
    <span className="kind-badge" style={{ ...kindStyle(kind), width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}

// Merchant avatars: a specific icon where the merchant is obvious, otherwise the category's.
const MERCHANT_ICONS: Record<string, LucideIcon> = {
  starbucks: Coffee,
  netflix: Tv,
  spotify: Music,
  "planet fitness": Dumbbell,
  "cvs pharmacy": Pill,
  "amc theatres": Film,
  marriott: Hotel,
  uber: Car,
  amazon: Package,
  "lucky star casino": Dices,
  walmart: Store,
  target: Store,
};

export function merchantIcon(name: string, mcc?: string): { icon: LucideIcon; kind: EnvelopeKind } {
  const kind = (mcc && MCC[mcc]?.kind) || "custom";
  const icon = MERCHANT_ICONS[name.trim().toLowerCase()] ?? (mcc ? KIND_META[kind].icon : Banknote);
  return { icon, kind };
}

export function MerchantAvatar({ name, mcc, cash, size = 38 }: { name: string; mcc?: string; cash?: boolean; size?: number }) {
  const { icon: Icon, kind } = cash ? { icon: Banknote, kind: "custom" as EnvelopeKind } : merchantIcon(name, mcc);
  return (
    <span className="merchant-avatar" style={{ ...kindStyle(kind), width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.46)} strokeWidth={2} />
    </span>
  );
}

