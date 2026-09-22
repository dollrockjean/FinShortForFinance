import React from "react";
import { useStore } from "./store";
import { Logo, TestModeButton, ThemeToggle } from "./ui";
import Onboarding from "./Onboarding";
import Dashboard from "./Dashboard";
import SimulatePurchase from "./SimulatePurchase";
import Transactions from "./Transactions";
import Settings from "./Settings";
import { View } from "./types";

function Landing() {
  const { dispatch } = useStore();
  return (
    <div className="center-shell">
      <div style={{ marginBottom: 24 }}>
        <Logo size={40} />
      </div>
      <h1 style={{ fontSize: 30 }}>Budgets you can't accidentally blow through.</h1>
      <p>
        Fin splits your money into envelopes — groceries, gas, dining, whatever you set — and its card simply can't spend
        past what's in one. No willpower required.
      </p>
      <button className="btn btn-primary btn-block" onClick={() => dispatch({ type: "SET_STEP", step: "signup" })}>
        Create account
      </button>
      <div style={{ height: 10 }} />
      <div className="row-between">
        <span className="hint">Just exploring?</span>
        <ThemeToggle />
      </div>
    </div>
  );
}

const TABS: { id: View; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "simulate", label: "Simulate" },
  { id: "transactions", label: "Transactions" },
  { id: "settings", label: "Settings" },
];

function MainApp() {
  const { state, dispatch } = useStore();
  return (
    <div className="app-shell">
      <div className="nav-bar">
        <div className="row-between" style={{ gap: 10 }}>
          <Logo />
          {state.testMode && <span className="test-mode-badge">Test mode</span>}
        </div>
        <nav className="nav-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-tab ${state.view === t.id ? "active" : ""}`}
              onClick={() => dispatch({ type: "SET_VIEW", view: t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {state.view === "dashboard" && <Dashboard />}
      {state.view === "simulate" && <SimulatePurchase />}
      {state.view === "transactions" && <Transactions />}
      {state.view === "settings" && <Settings />}
    </div>
  );
}

export default function App() {
  const { state } = useStore();

  if (state.onboardingStep === "done") {
    return <MainApp />;
  }

  return (
    <>
      {state.onboardingStep === "landing" ? <Landing /> : <Onboarding />}
      <TestModeButton />
    </>
  );
}
