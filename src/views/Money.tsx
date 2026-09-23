import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Building2, CalendarClock, Inbox, Pause, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { AutoTransfer, Cents } from "../types";
import { available, completeTransfer, totals, transferIn, transferOut } from "../engine/ledger";
import { addDays, fmt, fmtDate, uid } from "../engine/util";
import { Dropdown, Empty, ErrorText, Field, Menu, MoneyInput, Option, StatusPill, Toggle, useToast } from "../components/ui";
import { envelopeOptions } from "../components/options";
import { BankLogo, PlaidLinkModal } from "./Onboarding";

export default function Money() {
  const { state, act, set } = useStore();
  const toast = useToast();
  const t = totals(state);
  const [inAmt, setInAmt] = useState<Cents>(0);
  const [instant, setInstant] = useState(false);
  const [outAmt, setOutAmt] = useState<Cents>(0);
  const [outFrom, setOutFrom] = useState<string>(state.envelopes.find((e) => e.kind === "savings" || e.kind === "debt")?.id ?? "unassigned");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<{ in?: string; out?: string }>({});
  const [linking, setLinking] = useState(false);
  const [autoAmt, setAutoAmt] = useState<Cents>(0);
  const [autoCadence, setAutoCadence] = useState<AutoTransfer["cadence"]>("biweekly");
  const [filter, setFilter] = useState<"all" | "in" | "out" | "pending">("all");

  const source = state.envelopes.find((e) => e.id === outFrom);
  const fromBalance = source ? available(source) : state.unassigned;
  const fromOptions: Option<string>[] = [
    { value: "unassigned", label: "Unassigned", icon: <span className="quick-icon" style={{ width: 30, height: 30 }}><Inbox size={15} /></span>, meta: fmt(state.unassigned), group: "Not in an envelope" },
    ...envelopeOptions(state.envelopes),
  ];
  const transfers = state.transfers.filter((x) => (filter === "all" ? true : filter === "pending" ? x.status === "pending" : x.direction === filter));
  const cadenceLabel = (c: AutoTransfer["cadence"]) => (c === "biweekly" ? "Every two weeks" : c === "weekly" ? "Every week" : "Every month");

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stat-row">
        <div className="stat">
          <div className="label">
            <Building2 size={14} /> Funding bank
          </div>
          {state.bank ? (
            <div className="row" style={{ marginTop: 6 }}>
              <span className="row gap">
                <BankLogo name={state.bank.institution} />
                <span>
                  <strong className="small">{state.bank.institution}</strong>
                  <div className="xs muted">
                    {state.bank.accountName} •••• {state.bank.mask}
                  </div>
                </span>
              </span>
              <button className="link-btn small" onClick={() => setLinking(true)}>
                Change
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm top-gap" onClick={() => setLinking(true)}>
              Link a bank
            </button>
          )}
        </div>
        <div className="stat">
          <div className="label">
            <ArrowDownLeft size={14} /> Coming in
          </div>
          <div className="value">{fmt(t.pendingIn)}</div>
          <div className="sub">Pending ACH</div>
        </div>
        <div className="stat">
          <div className="label">
            <ArrowUpRight size={14} /> Going out
          </div>
          <div className="value">{fmt(t.pendingOut)}</div>
          <div className="sub">Pending ACH</div>
        </div>
      </div>

      <div className="page-grid even">
        <div>
          <section className="card">
            <div className="card-head">
              <h2>
                <ArrowDownLeft size={17} /> Add money
              </h2>
              <StatusPill status="info">ACH pull</StatusPill>
            </div>
            <p className="small muted">Pulled from {state.bank?.institution ?? "your bank"}. Lands in Unassigned, where you give it a job before the card can spend it.</p>
            <Field label="Amount">
              <MoneyInput value={inAmt} onChange={setInAmt} large />
            </Field>
            <Toggle checked={instant} onChange={setInstant} label="Land it now" sub="Demo shortcut. Real ACH takes 1 to 3 business days." />
            <ErrorText>{err.in}</ErrorText>
            <button
              className="btn btn-primary btn-block"
              disabled={inAmt <= 0 || !state.bank}
              onClick={() => {
                const r = act((s) => transferIn(s, inAmt, "manual", instant));
                setErr({ in: r.error });
                if (!r.error) {
                  toast({ status: "good", title: instant ? `${fmt(inAmt)} landed` : `${fmt(inAmt)} on the way`, body: instant ? "It's in Unassigned" : "Arrives in 2 days" });
                  setInAmt(0);
                }
              }}
            >
              Transfer in
            </button>
          </section>
        </div>
        <div>
          <section className="card">
            <div className="card-head">
              <h2>
                <ArrowUpRight size={17} /> Send to your bank
              </h2>
              <StatusPill status="neutral">ACH push</StatusPill>
            </div>
            <p className="small muted">For rent, debt payments and savings goals: anything the card isn't meant for.</p>
            <Field label="From">
              <Dropdown value={outFrom} onChange={setOutFrom} options={fromOptions} />
            </Field>
            <div className="grid-2">
              <Field label="Amount">
                <MoneyInput value={outAmt} onChange={setOutAmt} />
              </Field>
              <Field label="Memo">
                <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Car loan" />
              </Field>
            </div>
            <ErrorText>{err.out}</ErrorText>
            <button
              className="btn btn-outline btn-block"
              disabled={outAmt <= 0 || outAmt > fromBalance || !state.bank}
              onClick={() => {
                const r = act((s) => transferOut(s, outFrom, outAmt, memo.trim() || undefined));
                setErr({ out: r.error });
                if (!r.error) {
                  toast({ status: "good", title: `Sending ${fmt(outAmt)}`, body: `Arrives at ${state.bank?.institution} in 2 days` });
                  setOutAmt(0);
                  setMemo("");
                }
              }}
            >
              Transfer out
            </button>
          </section>
        </div>
      </div>

      <section className="card flush">
        <div className="card-head" style={{ padding: "10px 16px 0" }}>
          <h2>
            <RefreshCw size={17} /> Automatic transfers
          </h2>
        </div>
        {state.autoTransfers.length === 0 && (
          <p className="small muted" style={{ padding: "0 16px" }}>
            None yet. Most people set one up for payday.
          </p>
        )}
        <div className="tx-list">
          {state.autoTransfers.map((a) => (
            <div key={a.id} className="tx-row" style={{ cursor: "default" }}>
              <span className="quick-icon">
                <CalendarClock size={17} />
              </span>
              <div className="tx-main">
                <span className="tx-merchant">{fmt(a.amount)} from {state.bank?.institution ?? "bank"}</span>
                <span className="tx-sub">
                  {cadenceLabel(a.cadence)} · {a.active ? `next ${fmtDate(a.nextAt)}` : "paused"}
                </span>
              </div>
              <StatusPill status={a.active ? "good" : "neutral"}>{a.active ? "Active" : "Paused"}</StatusPill>
              <Menu
                items={[
                  { label: a.active ? "Pause" : "Resume", icon: a.active ? <Pause size={16} /> : <Play size={16} />, onClick: () => set({ autoTransfers: state.autoTransfers.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)) }) },
                  { label: "Delete", icon: <Trash2 size={16} />, danger: true, onClick: () => set({ autoTransfers: state.autoTransfers.filter((x) => x.id !== a.id) }) },
                ]}
              />
            </div>
          ))}
        </div>
        <div className="split-row" style={{ padding: "12px 16px 10px", margin: 0 }}>
          <MoneyInput value={autoAmt} onChange={setAutoAmt} ariaLabel="Auto-transfer amount" />
          <Dropdown
            value={autoCadence}
            onChange={setAutoCadence}
            ariaLabel="How often"
            options={[
              { value: "weekly", label: "Every week" },
              { value: "biweekly", label: "Every two weeks" },
              { value: "monthly", label: "Every month" },
            ]}
          />
          <button
            className="btn btn-primary"
            disabled={autoAmt <= 0 || !state.bank}
            onClick={() => {
              set({ autoTransfers: [...state.autoTransfers, { id: uid(), amount: autoAmt, cadence: autoCadence, nextAt: addDays(state.now, 1), active: true }] });
              toast({ status: "good", title: `${fmt(autoAmt)} ${cadenceLabel(autoCadence).toLowerCase()}`, body: "First one starts tomorrow" });
              setAutoAmt(0);
            }}
          >
            <Plus size={15} /> Add
          </button>
        </div>
      </section>

      <section className="card flush">
        <div className="card-head" style={{ padding: "10px 16px 0" }}>
          <h2>History</h2>
          <Dropdown
            compact
            ariaLabel="Filter transfers"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All transfers" },
              { value: "in", label: "Money in", icon: <ArrowDownLeft size={15} className="t-good" /> },
              { value: "out", label: "Money out", icon: <ArrowUpRight size={15} className="faint" /> },
              { value: "pending", label: "Pending only", icon: <CalendarClock size={15} className="t-warn" /> },
            ]}
          />
        </div>
        {transfers.length === 0 && <Empty icon={<ArrowDownLeft size={20} />} title="No transfers here" />}
        <div className="tx-list">
          {transfers.slice(0, 40).map((x) => {
            const env = state.envelopes.find((e) => e.id === x.envelopeId);
            const isIn = x.direction === "in";
            return (
              <div key={x.id} className="tx-row" style={{ cursor: "default" }}>
                <span className="notice-icon" style={{ width: 38, height: 38, background: isIn ? "var(--good-bg)" : "var(--surface-3)", color: isIn ? "var(--good)" : "var(--muted)" }}>
                  {isIn ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                </span>
                <div className="tx-main">
                  <span className="tx-merchant">{x.memo ?? (isIn ? `From ${state.bank?.institution ?? "bank"}` : `To ${state.bank?.institution ?? "bank"}`)}</span>
                  <span className="tx-sub">
                    {fmtDate(x.createdAt)}
                    {x.reason === "auto" && " · automatic"}
                    {x.reason === "cash" && " · covers cash spending"}
                    {env && ` · from ${env.name}`}
                  </span>
                </div>
                <div className="tx-right">
                  <span className={`tx-amt ${isIn ? "t-good" : ""}`}>
                    {isIn ? "+" : "-"}
                    {fmt(x.amount)}
                  </span>
                  {x.status === "pending" ? (
                    <button className="link-btn xs" onClick={() => act((s) => completeTransfer(s, x.id))} title="Demo shortcut">
                      Arrives {fmtDate(x.arrivesAt)} · land now
                    </button>
                  ) : (
                    <StatusPill status="good">Done</StatusPill>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {linking && (
        <PlaidLinkModal
          onClose={() => setLinking(false)}
          onLinked={(bank) => {
            set({ bank });
            setLinking(false);
            toast({ status: "good", title: `Linked ${bank.institution}` });
          }}
        />
      )}
    </div>
  );
}
