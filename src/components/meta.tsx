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
import { Baby, Beer, Bike, BookOpen, Briefcase, Bus, Camera, Church, Flower2, Gamepad2, Gift, GraduationCap, HandHeart, Laptop, Palette, PawPrint, Pizza, Plane, Scissors, Shirt, Smartphone, Sofa, Stethoscope, TrainFront, Trophy, Umbrella, Wifi, Wine, Wrench } from "lucide-react";
import { Envelope, EnvelopeKind } from "../types";
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

// Icons anyone can pick for a category, on top of the type's default.
export const ICON_CHOICES: Record<string, LucideIcon> = {
  cart: ShoppingCart,
  home: Home,
  zap: Zap,
  fuel: Fuel,
  car: Car,
  bus: Bus,
  train: TrainFront,
  bike: Bike,
  plane: Plane,
  utensils: UtensilsCrossed,
  pizza: Pizza,
  coffee: Coffee,
  beer: Beer,
  wine: Wine,
  repeat: Repeat,
  tv: Tv,
  music: Music,
  film: Film,
  game: Gamepad2,
  ticket: Ticket,
  bag: ShoppingBag,
  shirt: Shirt,
  gift: Gift,
  heart: HeartPulse,
  doctor: Stethoscope,
  pill: Pill,
  gym: Dumbbell,
  scissors: Scissors,
  hammer: Hammer,
  wrench: Wrench,
  sofa: Sofa,
  flower: Flower2,
  baby: Baby,
  pet: PawPrint,
  school: GraduationCap,
  book: BookOpen,
  phone: Smartphone,
  wifi: Wifi,
  laptop: Laptop,
  camera: Camera,
  art: Palette,
  work: Briefcase,
  church: Church,
  giving: HandHeart,
  umbrella: Umbrella,
  trophy: Trophy,
  shield: ShieldCheck,
  bank: Landmark,
  piggy: PiggyBank,
  tag: Tag,
};

export const COLOR_CHOICES = ["#1baf7a", "#2a78d6", "#eb6834", "#eda100", "#e87ba4", "#4a3aa7", "#e34948", "#008300", "#184f95", "#c98500", "#d55181", "#0f8b8d", "#7a5c3e", "#52514e"];

export function kindStyle(kind: EnvelopeKind, color?: string): CSSProperties {
  return { ["--c" as string]: color ?? `var(--k-${kind})` };
}

export function envStyle(e: Pick<Envelope, "kind" | "color">): CSSProperties {
  return kindStyle(e.kind, e.color);
}

export function EnvBadge({ e, size = 36 }: { e: Pick<Envelope, "kind" | "color" | "icon">; size?: number }) {
  return <KindBadge kind={e.kind} color={e.color} icon={e.icon} size={size} />;
}

export function KindBadge({ kind, size = 36, color, icon }: { kind: EnvelopeKind; size?: number; color?: string; icon?: string }) {
  const Icon = (icon && ICON_CHOICES[icon]) || KIND_META[kind].icon;
  return (
    <span className="kind-badge" style={{ ...kindStyle(kind, color), width: size, height: size }} aria-hidden="true">
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

