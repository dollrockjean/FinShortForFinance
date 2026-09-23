import React, { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, CircleCheck, CircleX, Info, MoreHorizontal, Search, TriangleAlert, X } from "lucide-react";
import { Cents } from "../types";
import { parseDollars } from "../engine/util";

// ---------- brand

// Single-stroke shark fin: convex leading edge, hooked tip, concave trailing edge. No body, no water.
export function FinMark({ size = 22, color = "var(--brand)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M4 26 C8 18 13 8 22 4 C18 12 20 22 27 26 Z" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size }}>
      <FinMark size={Math.round(size * 1.1)} />
      <span>Fin</span>
    </span>
  );
}

// ---------- form bits

export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = "0.00",
  autoFocus,
  ariaLabel,
  large,
}: {
  value: Cents;
  onChange: (c: Cents) => void;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  large?: boolean;
}) {
  const show = (v: Cents) => (v ? (v / 100).toFixed(2).replace(/\.00$/, "") : "");
  const [text, setText] = useState(show(value));
  useEffect(() => {
    if ((parseDollars(text) ?? 0) !== value) setText(show(value));
    // resync only when the parent changes the value out from under us
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={`money-input ${large ? "large" : ""}`}>
      <span aria-hidden="true">$</span>
      <input
        id={id}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={(e) => {
          const t = e.target.value;
          if (!/^[\d,]*\.?\d{0,2}$/.test(t)) return;
          setText(t);
          onChange(parseDollars(t) ?? 0);
        }}
      />
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, sub, srOnly }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string; srOnly?: boolean }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span className={srOnly ? "sr-only" : undefined}>
        {label}
        {sub && <span className="toggle-sub">{sub}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  full,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  full?: boolean;
}) {
  return (
    <div className={`segmented ${full ? "full" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)} type="button">
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="error-text" role="alert">
      <CircleX size={15} /> {children}
    </p>
  );
}

// ---------- floating layer helpers

function useFloating(open: boolean, anchor: React.RefObject<HTMLElement | null>, onClose: () => void, panel: React.RefObject<HTMLElement | null>, align: "start" | "end" = "start") {
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const h = panel.current?.offsetHeight ?? 280;
      const w = Math.max(r.width, 250);
      const below = window.innerHeight - r.bottom;
      const top = below < h + 12 && r.top > h + 12 ? r.top - h - 6 : r.bottom + 6;
      let left = align === "end" ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      setPos({ position: "fixed", top, left, width: w, visibility: "visible" });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, panel, align]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open, anchor, panel, onClose]);
  return pos;
}

// ---------- dropdown (listbox)

export interface Option<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  meta?: React.ReactNode;
  group?: string;
  disabled?: boolean;
}

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Select",
  ariaLabel,
  id,
  compact,
  searchable,
  iconOnly,
}: {
  iconOnly?: boolean;
  value: T | "";
  options: Option<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  compact?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const close = useCallback(() => {
    setOpen(false);
    setQ("");
  }, []);
  const pos = useFloating(open, btn, close, panel);
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(
    () => (q ? options.filter((o) => (o.label + " " + (o.description ?? "")).toLowerCase().includes(q.toLowerCase())) : options),
    [q, options]
  );
  const doSearch = searchable ?? options.length > 8;

  useEffect(() => {
    if (open) setActive(Math.max(0, shown.findIndex((o) => o.value === value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q]);

  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (o: Option<T>) => {
    if (o.disabled) return;
    onChange(o.value);
    close();
    btn.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      btn.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    }
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        className={`dropdown-btn ${compact ? "compact" : ""} ${iconOnly ? "icon-only" : ""} ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        {selected?.icon}
        {!iconOnly && <span className={`dropdown-label ${selected ? "" : "placeholder"}`}>{selected?.label ?? placeholder}</span>}
        {selected?.meta && !compact && !iconOnly && <span className="dropdown-meta">{selected.meta}</span>}
        <ChevronDown size={16} className="chev" />
      </button>
      {open &&
        createPortal(
          <div ref={panel} className="popover" style={pos} onKeyDown={onKey}>
            {doSearch && (
              <div className="popover-search">
                <Search size={15} />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search options" />
              </div>
            )}
            <div role="listbox" id={listId} className="popover-list" aria-label={ariaLabel}>
              {shown.length === 0 && <div className="popover-empty">No matches</div>}
              {shown.map((o, i) => {
                const header = o.group && o.group !== lastGroup ? o.group : null;
                lastGroup = o.group;
                return (
                  <React.Fragment key={o.value}>
                    {header && <div className="popover-group">{header}</div>}
                    <div
                      role="option"
                      data-i={i}
                      aria-selected={o.value === value}
                      aria-disabled={o.disabled}
                      className={`popover-option ${i === active ? "active" : ""} ${o.disabled ? "disabled" : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(o)}
                    >
                      {o.icon}
                      <span className="opt-text">
                        <span className="opt-label">{o.label}</span>
                        {o.description && <span className="opt-desc">{o.description}</span>}
                      </span>
                      {o.meta && <span className="opt-meta">{o.meta}</span>}
                      {o.value === value && <Check size={16} className="opt-check" />}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// ---------- action menu

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function Menu({ items, label = "More actions", trigger }: { items: MenuItem[]; label?: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const pos = useFloating(open, btn, close, panel, "end");
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, [open]);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={trigger ? "btn btn-outline btn-sm" : "icon-btn"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger ?? <MoreHorizontal size={18} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="popover menu"
            role="menu"
            style={{ ...pos, width: 220 }}
            onKeyDown={(e) => {
              const btns = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
              const i = btns.indexOf(document.activeElement as HTMLButtonElement);
              if (e.key === "Escape") {
                close();
                btn.current?.focus();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                btns[(i + 1) % btns.length]?.focus();
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                btns[(i - 1 + btns.length) % btns.length]?.focus();
              }
            }}
          >
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                disabled={it.disabled}
                className={`menu-item ${it.danger ? "danger" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                  it.onClick();
                }}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

// ---------- overlays

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export function Modal({ title, onClose, children, icon, wide }: { title: string; onClose: () => void; children: React.ReactNode; icon?: React.ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            {icon}
            <h3>{title}</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ title, sub, onClose, children, icon }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; icon?: React.ReactNode }) {
  useEscape(onClose);
  return createPortal(
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="modal-title">
            {icon}
            <div>
              <h3>{title}</h3>
              {sub && <div className="small muted">{sub}</div>}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close panel">
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body
  );
}

// ---------- status

export function Progress({ value, tone }: { value: number; tone: "ok" | "warn" | "over" }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

export function toneFor(usage: number): "ok" | "warn" | "over" {
  if (usage >= 1) return "over";
  if (usage >= 0.8) return "warn";
  return "ok";
}

export type Status = "good" | "warning" | "critical" | "info" | "neutral";

export function StatusPill({ status, children }: { status: Status; children: React.ReactNode }) {
  const Icon = status === "good" ? CircleCheck : status === "warning" ? TriangleAlert : status === "critical" ? CircleX : Info;
  return (
    <span className={`status-pill s-${status}`}>
      {status !== "neutral" && <Icon size={13} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

export function Callout({ status = "info", title, children, action, onClick }: { status?: Status; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; onClick?: () => void }) {
  const Icon = status === "good" ? CircleCheck : status === "warning" ? TriangleAlert : status === "critical" ? CircleX : Info;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`callout c-${status} ${onClick ? "clickable" : ""}`} onClick={onClick}>
      <Icon size={18} className="callout-icon" />
      <div className="callout-body">
        {title && <div className="callout-title">{title}</div>}
        {children && <div className="callout-text">{children}</div>}
      </div>
      {action}
    </Tag>
  );
}

// ---------- toasts

interface Toast {
  id: number;
  status: Status;
  title: string;
  body?: string;
}

const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast t-${t.status}`}>
              {t.status === "good" ? <CircleCheck size={18} /> : t.status === "critical" ? <CircleX size={18} /> : t.status === "warning" ? <TriangleAlert size={18} /> : <Info size={18} />}
              <div>
                <div className="toast-title">{t.title}</div>
                {t.body && <div className="toast-body">{t.body}</div>}
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

export function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      {children && <p className="small muted">{children}</p>}
    </div>
  );
}
