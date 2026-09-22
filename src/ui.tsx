import React from "react";
import { useStore } from "./store";

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="fin-logo">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M4 20c4-1 6-4 7-8 1-5 3-9 8-10-1 5-1 9 1 12-3 1-5 0-6-2-1 3-4 6-10 8z"
          fill="var(--green)"
        />
      </svg>
      Fin
    </span>
  );
}

export function ThemeToggle() {
  const { state, dispatch } = useStore();
  return (
    <button
      className="btn btn-secondary btn-sm"
      onClick={() => dispatch({ type: "SET_THEME", theme: state.theme === "light" ? "dark" : "light" })}
    >
      {state.theme === "light" ? "Dark mode" : "Light mode"}
    </button>
  );
}

export function TestModeButton() {
  const { dispatch } = useStore();
  return (
    <div className="test-mode-float">
      <button
        className="btn btn-primary"
        onClick={() => dispatch({ type: "ENTER_TEST_MODE" })}
      >
        Skip signup — try test mode
      </button>
    </div>
  );
}

export function ProgressBar({ pct, cls }: { pct: number; cls: string }) {
  return (
    <div className="progress-track">
      <div className={`progress-fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Modal({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="step-dots">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`step-dot ${i <= current ? "done" : ""}`} />
      ))}
    </div>
  );
}
