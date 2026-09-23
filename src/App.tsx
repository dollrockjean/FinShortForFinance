import { useState } from "react";
import { useStore } from "./store";
import { View } from "./types";
import { BellIcon, Logo } from "./components/ui";
import { advanceDays } from "./engine/clock";
import { fmt, fmtDate, fmtDateLong } from "./engine/util";
import Landing from "./views/Landing";
import Onboarding from "./views/Onboarding";
import Home from "./views/Home";
import Budget from "./views/Budget";
import Activity from "./views/Activity";
import Money from "./views/Money";
import CardView from "./views/CardView";
import Settings from "./views/Settings";

const TABS: { id: View; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "budget", label: "Budget" },
  { id: "activity", label: "Activity" },
  { id: "money", label: "Money" },
  { id: "card", label: "Card" },
  { id: "settings", label: "Settings" },
];

function DemoClock() {
  const { state, act } = useStore();
  return (
    <div className="clock" title="Demo clock. Moves time forward so ACH transfers land, holds settle, and budget periods reset.">
      <span className="clock-date">{fmtDateLong(state.now)}</span>
      <button className="btn btn-outline btn-xs" onClick={() => act((s) => advanceDays(s, 1))}>
        +1 day
      </button>
      <button className="btn btn-outline btn-xs" onClick={() => act((s) => advanceDays(s, 7))}>
        +1 week
      </button>
    </div>
  );
}

function Notices({ onClose }: { onClose: () => void }) {
  const { state, set } = useStore();
  return (
    <div className="notices" role="dialog" aria-label="Notifications">
      <div className="row">
        <strong>Notifications</strong>
        <button className="link-btn small" onClick={() => { set({ notices: state.notices.map((n) => ({ ...n, read: true })) }); onClose(); }}>
          Mark all read
        </button>
      </div>
      {state.notices.length === 0 && <p className="muted small">Nothing yet.</p>}
      <div className="notice-list">
        {state.notices.slice(0, 30).map((n) => (
          <div key={n.id} className={`notice ${n.read ? "" : "unread"} k-${n.kind}`}>
            <div className="row">
              <span className="notice-title">{n.title}</span>
              <span className="muted small">{fmtDate(n.at)}</span>
            </div>
            <div className="small muted">{n.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MainApp() {
  const { state, set } = useStore();
  const [showNotices, setShowNotices] = useState(false);
  const unread = state.notices.filter((n) => !n.read).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="link-btn" onClick={() => set({ view: "home" })} aria-label="Home">
            <Logo size={20} />
          </button>
          {state.testMode && <span className="pill">Demo account</span>}
          <nav className="tabs" aria-label="Main">
            {TABS.map((t) => (
              <button key={t.id} className={state.view === t.id ? "on" : ""} aria-current={state.view === t.id ? "page" : undefined} onClick={() => set({ view: t.id })}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="topbar-right">
            <button className="icon-btn bell" onClick={() => setShowNotices((v) => !v)} aria-label={`Notifications, ${unread} unread`}>
              <BellIcon />
              {unread > 0 && <span className="dot">{unread > 9 ? "9+" : unread}</span>}
            </button>
          </div>
        </div>
        <div className="subbar">
          <DemoClock />
          {state.unassigned > 0 && state.view !== "budget" && (
            <button className="unassigned-nag" onClick={() => set({ view: "budget" })}>
              {fmt(state.unassigned)} has no job yet. Assign it
            </button>
          )}
        </div>
      </header>
      {showNotices && <Notices onClose={() => setShowNotices(false)} />}
      <main className="main">
        {state.view === "home" && <Home />}
        {state.view === "budget" && <Budget />}
        {state.view === "activity" && <Activity />}
        {state.view === "money" && <Money />}
        {state.view === "card" && <CardView />}
        {state.view === "settings" && <Settings />}
      </main>
      <nav className="bottom-tabs" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} className={state.view === t.id ? "on" : ""} onClick={() => set({ view: t.id })}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const { state } = useStore();
  if (state.step === "done") return <MainApp />;
  if (state.step === "landing") return <Landing />;
  return <Onboarding />;
}
