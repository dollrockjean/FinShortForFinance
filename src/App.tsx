import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Bell,
  BookOpen,
  CalendarClock,
  CircleCheck,
  CircleX,
  CreditCard,
  FastForward,
  Info,
  LayoutDashboard,
  ListOrdered,
  Menu as MenuIcon,
  Settings as SettingsIcon,
  TriangleAlert,
  Wallet,
  Zap,
} from "lucide-react";
import { useStore } from "./store";
import { Notice, View } from "./types";
import { FinMark, Logo, Menu, Progress } from "./components/ui";
import { monthlyEquivalent } from "./engine/presets";
import { UiCtx, initials } from "./components/options";
import { advanceDays } from "./engine/clock";
import { fmt, fmtDate, sum } from "./engine/util";
import Landing from "./views/Landing";
import Onboarding from "./views/Onboarding";
import Home from "./views/Home";
import Budget from "./views/Budget";
import Activity from "./views/Activity";
import Money from "./views/Money";
import CardView from "./views/CardView";
import Settings from "./views/Settings";
import About from "./views/About";
import PaymentPanel, { PanelTab } from "./views/PaymentPanel";

const NAV: { id: View; label: string; icon: typeof Wallet; title: string; sub: string }[] = [
  { id: "home", label: "Overview", icon: LayoutDashboard, title: "Overview", sub: "Where your money stands today" },
  { id: "budget", label: "Budget", icon: Wallet, title: "Budget", sub: "Categories, targets and fill order" },
  { id: "activity", label: "Activity", icon: ListOrdered, title: "Activity", sub: "Every purchase, hold and decline" },
  { id: "money", label: "Transfers", icon: ArrowLeftRight, title: "Transfers", sub: "Money in from your bank and back out" },
  { id: "card", label: "Card", icon: CreditCard, title: "Card", sub: "Your Fin card and its controls" },
];

const SECONDARY: typeof NAV = [
  { id: "about", label: "How Fin works", icon: BookOpen, title: "How Fin works", sub: "The full process, start to finish" },
  { id: "settings", label: "Settings", icon: SettingsIcon, title: "Settings", sub: "Account, security and appearance" },
];

function noticeStatus(n: Notice) {
  if (n.kind === "decline" || n.kind === "over") return { cls: "s-critical", Icon: CircleX };
  if (n.kind === "warn") return { cls: "s-warning", Icon: TriangleAlert };
  if (n.kind === "money") return { cls: "s-good", Icon: CircleCheck };
  return { cls: "", Icon: Info };
}

function Notices({ onClose }: { onClose: () => void }) {
  const { state, set } = useStore();
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 80 }} onMouseDown={onClose} />
      <div className="notices" role="dialog" aria-label="Notifications">
        <div className="notices-head">
          <strong>Notifications</strong>
          <button className="link-btn small" onClick={() => set({ notices: state.notices.map((n) => ({ ...n, read: true })) })}>
            Mark all read
          </button>
        </div>
        {state.notices.length === 0 && <p className="muted small" style={{ padding: "0 12px" }}>Nothing yet.</p>}
        {state.notices.slice(0, 40).map((n) => {
          const { cls, Icon } = noticeStatus(n);
          return (
            <div key={n.id} className={`notice ${n.read ? "" : "unread"}`}>
              <span className={`notice-icon ${cls}`}>
                <Icon size={15} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row">
                  <span className="notice-title">{n.title}</span>
                  <span className="xs faint">{fmtDate(n.at)}</span>
                </div>
                <div className="small muted">{n.body}</div>
              </div>
              {!n.read && <span className="unread-dot" />}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Clock({ compact }: { compact?: boolean }) {
  const { state, act } = useStore();
  return (
    <div className="clock-card" style={compact ? { width: "100%" } : undefined} title="Demo clock. Moves time so transfers land, holds settle and budget periods reset.">
      <div className="row">
        <span className="clock-date">
          <CalendarClock size={15} className="faint" />
          {new Date(state.now).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
        </span>
        <div className="row gap" style={{ gap: 4 }}>
          <button className="btn btn-outline btn-xs" onClick={() => act((s) => advanceDays(s, 1))} aria-label="Advance one day">
            +1d
          </button>
          <button className="btn btn-outline btn-xs" onClick={() => act((s) => advanceDays(s, 7))} aria-label="Advance one week">
            <FastForward size={12} /> 1w
          </button>
        </div>
      </div>
      {!compact && <div className="xs faint" style={{ marginTop: 4 }}>Demo clock · {new Date(state.now).getUTCFullYear()}</div>}
    </div>
  );
}

function MonthWidget() {
  const { state, set } = useStore();
  const month = state.now.slice(0, 7);
  const spent = sum(state.transactions.filter((t) => t.status === "settled" && t.createdAt.slice(0, 7) === month).map((t) => t.amount));
  const planned = sum(state.envelopes.filter((e) => e.cardSpendable).map(monthlyEquivalent));
  const d = new Date(state.now);
  const daysLeft = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() - d.getUTCDate();
  const u = planned > 0 ? spent / planned : 0;
  return (
    <button className="sidebar-month" onClick={() => set({ view: "budget" })} style={{ textAlign: "left", cursor: "pointer", width: "100%" }}>
      <div className="row">
        <strong className="small">{d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}</strong>
        <span className="xs faint">{daysLeft} days left</span>
      </div>
      <div className="num" style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 6px" }}>
        {fmt(spent)}
      </div>
      <Progress value={u} tone={u >= 1 ? "over" : u >= 0.8 ? "warn" : "ok"} />
      <div className="xs muted" style={{ marginTop: 5 }}>
        spent of {fmt(planned)} planned for spending
      </div>
    </button>
  );
}

function MainApp() {
  const { state, set } = useStore();
  const [showNotices, setShowNotices] = useState(false);
  const [panel, setPanel] = useState<PanelTab | null>(null);
  const unread = state.notices.filter((n) => !n.read).length;
  const review = state.transactions.filter((t) => t.status !== "declined" && !t.confirmed).length;
  const current = [...NAV, ...SECONDARY].find((n) => n.id === state.view) ?? NAV[0];
  const openPayments = useCallback((tab: PanelTab = "card") => setPanel(tab), []);
  const ui = useMemo(() => ({ openPayments }), [openPayments]);
  const go = (view: View) => {
    set({ view });
    window.scrollTo({ top: 0 });
  };

  return (
    <UiCtx.Provider value={ui}>
      <div className="shell">
        <aside className="sidebar">
          <div className="logo-row">
            <Logo size={21} />
            {state.testMode && <span className="pill">Demo</span>}
          </div>
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${state.view === n.id ? "on" : ""}`} onClick={() => go(n.id)} aria-current={state.view === n.id ? "page" : undefined}>
              <n.icon size={18} />
              {n.label}
              {n.id === "activity" && review > 0 && <span className="count">{review}</span>}
              {n.id === "budget" && state.unassigned > 0 && <span className="count">{fmt(state.unassigned).replace(/\.\d\d$/, "")}</span>}
            </button>
          ))}
          <div className="nav-label">Tools</div>
          <button className="nav-item" onClick={() => openPayments("card")}>
            <Zap size={18} />
            Test payments
          </button>
          {SECONDARY.map((n) => (
            <button key={n.id} className={`nav-item ${state.view === n.id ? "on" : ""}`} onClick={() => go(n.id)}>
              <n.icon size={18} />
              {n.label}
            </button>
          ))}
          <MonthWidget />
          <div className="sidebar-foot">
            <Clock />
            <div className="user-chip">
              <span className="avatar">{initials(state)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="small" style={{ fontWeight: 600 }}>{state.user?.name}</div>
                <div className="xs muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{state.user?.email}</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="main-col">
          <header className="topbar">
            <span className="mobile-logo">
              <Logo size={19} />
            </span>
            <div className="topbar-title">
              <h1>{current.title}</h1>
              <span className="small muted">{current.sub}</span>
            </div>
            <div className="topbar-actions">
              <button className="btn btn-primary btn-sm hide-mobile" onClick={() => openPayments("card")}>
                <Zap size={15} /> Test a payment
              </button>
              <button className="icon-btn bell" onClick={() => setShowNotices((v) => !v)} aria-label={`Notifications, ${unread} unread`}>
                <Bell size={19} />
                {unread > 0 && <span className="dot">{unread > 9 ? "9+" : unread}</span>}
              </button>
              <span className="mobile-logo">
                <Menu
                  label="More"
                  trigger={<MenuIcon size={17} />}
                  items={[
                    { label: "How Fin works", icon: <BookOpen size={16} />, onClick: () => go("about") },
                    { label: "Settings", icon: <SettingsIcon size={16} />, onClick: () => go("settings") },
                  ]}
                />
              </span>
            </div>
          </header>
          {showNotices && <Notices onClose={() => setShowNotices(false)} />}
          <main className="main">
            <div className="mobile-clock">
              <Clock compact />
            </div>
            {state.view === "home" && <Home />}
            {state.view === "budget" && <Budget />}
            {state.view === "activity" && <Activity />}
            {state.view === "money" && <Money />}
            {state.view === "card" && <CardView />}
            {state.view === "settings" && <Settings />}
            {state.view === "about" && <About />}
          </main>
        </div>

        <nav className="bottom-nav" aria-label="Main">
          {NAV.map((n) => (
            <button key={n.id} className={state.view === n.id ? "on" : ""} onClick={() => go(n.id)}>
              <n.icon size={20} />
              {n.label}
            </button>
          ))}
        </nav>

        {!panel && (
          <button className="btn btn-primary fab" onClick={() => openPayments("card")} aria-label="Open test payments">
            <FinMark size={18} color="var(--on-brand)" />
            <span className="fab-text">Test payments</span>
          </button>
        )}
        {panel && <PaymentPanel initialTab={panel} onClose={() => setPanel(null)} />}
      </div>
    </UiCtx.Provider>
  );
}

export default function App() {
  const { state } = useStore();
  const [publicAbout, setPublicAbout] = useState(false);
  if (state.step === "done") return <MainApp />;
  if (state.step === "landing") {
    if (publicAbout) return <About standalone onBack={() => setPublicAbout(false)} />;
    return <Landing onAbout={() => setPublicAbout(true)} />;
  }
  return <Onboarding />;
}
