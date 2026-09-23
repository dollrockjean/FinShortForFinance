import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "./types";
import { Result } from "./engine/ledger";
import { freshState } from "./engine/seed";

const STORAGE_KEY = "fin-state-v2";

type Updater = (s: AppState) => AppState | Result;

interface Store {
  state: AppState;
  // Runs an engine function against the latest state. Returns the error, if any, and commits otherwise.
  act: (fn: Updater) => { error?: string; txId?: string; state: AppState };
  set: (patch: Partial<AppState>) => void;
}

const Ctx = createContext<Store | null>(null);

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // white is the default; only a theme the person picked on purpose sticks
      if (parsed?.version === 2) return { ...freshState(), ...parsed, theme: parsed.themeSet ? parsed.theme : "light" };
    }
  } catch {
    // private window or corrupt data: start clean
  }
  return freshState();
}

function isResult(x: AppState | Result): x is Result {
  return "state" in x && !("version" in x);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(load);
  const ref = useRef(state);

  const commit = useCallback((next: AppState) => {
    ref.current = next;
    setState(next);
  }, []);

  const act = useCallback<Store["act"]>(
    (fn) => {
      const out = fn(ref.current);
      if (isResult(out)) {
        if (!out.error) commit(out.state);
        return { error: out.error, txId: out.txId, state: ref.current };
      }
      commit(out);
      return { state: out };
    },
    [commit]
  );

  const set = useCallback((patch: Partial<AppState>) => commit({ ...ref.current, ...patch }), [commit]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full or blocked; the app keeps working in memory
    }
  }, [state]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = state.theme === "dark" || (state.theme === "system" && media.matches);
      root.dataset.theme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101512" : "#ffffff");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [state.theme]);

  const value = useMemo(() => ({ state, act, set }), [state, act, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
}

export function useEnvelope(id: string | null | undefined) {
  const { state } = useStore();
  return id ? state.envelopes.find((e) => e.id === id) : undefined;
}
