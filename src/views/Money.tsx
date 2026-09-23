import { useState } from "react";
import { useStore } from "../store";
import { AutoTransfer, Cents } from "../types";
import { available, completeTransfer, totals, transferIn, transferOut } from "../engine/ledger";
import { fmt, fmtDate, uid, addDays } from "../engine/util";
import { ErrorText, Field, MoneyInput, Toggle } from "../components/ui";
import { PlaidLinkModal } from "./Onboarding";

export default function Money() {
  const { state, act, set } = useStore();
  const t = totals(state);
  const [inAmt, setInAmt] = useState<Cents>(0);
  const [instant, setInstant] = useState(false);
  const [outAmt, setOutAmt] = useState<Cents>(0);
  const [outFrom, setOutFrom] = useState<string>(state.envelopes.find((e) => e.kind === "savings" || e.kind === "emergency")?.id ?? "unassigned");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<{ in?: string; out?: string }>({});
  const [linking, setLinking] = useState(false);
  const [autoAmt, setAutoAmt] = useState<Cents>(0);
  const [autoCadence, setAutoCadence] = useState<AutoTransfer["cadence"]>("biweekly");

  const source = state.envelopes.find((e) => e.id === outFrom);
  const fromBalance = source ? available(source) : state.unassigned;

  return (
    <div className="page">
      <h1>Money in and out</h1>
      <p className="muted">
        Your outside bank is only a funding source. Money moves by ACH (1 to 3 business days in real life, 2 days on the demo clock). Fin can't see or control that bank's own cards.
      </p>

      <div className="card row">
        {state.bank ? (
          <>
            <div>
              <strong>
                {state.bank.institution} {state.bank.accountName}
              </strong>
              <div className="small muted">•••• {state.bank.mask} · linked through Plaid (simulated)</div>
            </div>
            <button className="link-btn small" onClick={() => setLinking(true)}>
              Change
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => setLinking(true)}>
            Link a bank
          </button>
        )}
      </div>

      <div className="two-col top-gap">
        <section className="card">
          <h2>Add money</h2>
          <p className="small muted">Lands in Unassigned. Give it a job before the card can spend it.</p>
          <Field label="Amount">
            <MoneyInput value={inAmt} onChange={setInAmt} />
          </Field>
          <Toggle checked={instant} onChange={setInstant} label="Land it now (demo shortcut)" />
          <ErrorText>{err.in}</ErrorText>
          <button
            className="btn btn-primary btn-block top-gap"
            disabled={inAmt <= 0 || !state.bank}
            onClick={() => {
              const r = act((s) => transferIn(s, inAmt, "manual", instant));
              setErr({ in: r.error });
              if (!r.error) setInAmt(0);
            }}
          >
            Transfer in
          </button>
        </section>

        <section className="card">
          <h2>Send to your bank</h2>
          <p className="small muted">For savings goals, debt payments, rent, anything the card isn't meant for.</p>
          <Field label="From">
            <select value={outFrom} onChange={(e) => setOutFrom(e.target.value)}>
              <option value="unassigned">Unassigned ({fmt(state.unassigned)})</option>
              {state.envelopes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({fmt(available(e))})
                </option>
              ))}
            </select>
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
                setOutAmt(0);
                setMemo("");
              }
            }}
          >
            Transfer out
          </button>
        </section>
      </div>

      <div className="section-head">
        <h2>Automatic transfers</h2>
      </div>
      <div className="card">
        {state.autoTransfers.length === 0 && <p className="small muted">None yet. Most people set one for payday.</p>}
        {state.autoTransfers.map((a) => (
          <div key={a.id} className="row list-row">
            <div>
              <strong>{fmt(a.amount)}</strong> {a.cadence === "biweekly" ? "every two weeks" : a.cadence === "weekly" ? "every week" : "every month"}
              <div className="small muted">{a.active ? `Next: ${fmtDate(a.nextAt)}` : "Paused"}</div>
            </div>
            <div className="row gap">
              <button className="link-btn small" onClick={() => set({ autoTransfers: state.autoTransfers.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)) })}>
                {a.active ? "Pause" : "Resume"}
              </button>
              <button className="link-btn small" onClick={() => set({ autoTransfers: state.autoTransfers.filter((x) => x.id !== a.id) })}>
                Delete
              </button>
            </div>
          </div>
        ))}
        <div className="split-row top-gap">
          <MoneyInput value={autoAmt} onChange={setAutoAmt} ariaLabel="Auto-transfer amount" />
          <select value={autoCadence} onChange={(e) => setAutoCadence(e.target.value as AutoTransfer["cadence"])} aria-label="How often">
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every two weeks</option>
            <option value="monthly">Monthly</option>
          </select>
          <button
            className="btn btn-outline"
            disabled={autoAmt <= 0 || !state.bank}
            onClick={() => {
              set({ autoTransfers: [...state.autoTransfers, { id: uid(), amount: autoAmt, cadence: autoCadence, nextAt: addDays(state.now, 1), active: true }] });
              setAutoAmt(0);
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div className="section-head">
        <h2>Transfers</h2>
        <span className="small muted">
          {fmt(t.pendingIn)} coming in · {fmt(t.pendingOut)} going out
        </span>
      </div>
      <div className="card list">
        {state.transfers.length === 0 && <p className="small muted">No transfers yet.</p>}
        {state.transfers.slice(0, 40).map((x) => {
          const env = state.envelopes.find((e) => e.id === x.envelopeId);
          return (
            <div key={x.id} className="row list-row">
              <div>
                <strong>{x.direction === "in" ? "From" : "To"} {state.bank?.institution ?? "bank"}</strong>
                <div className="small muted">
                  {fmtDate(x.createdAt)}
                  {x.reason === "auto" && " · automatic"}
                  {x.reason === "cash" && " · covers cash spending"}
                  {env && ` · from ${env.name}`}
                  {x.memo && ` · ${x.memo}`}
                  {x.status === "pending" ? ` · arrives ${fmtDate(x.arrivesAt)}` : " · done"}
                </div>
              </div>
              <div className="right">
                <strong>
                  {x.direction === "in" ? "+" : "-"}
                  {fmt(x.amount)}
                </strong>
                {x.status === "pending" && (
                  <div>
                    <button className="link-btn small" onClick={() => act((s) => completeTransfer(s, x.id))}>
                      Land now (demo)
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {linking && (
        <PlaidLinkModal
          onClose={() => setLinking(false)}
          onLinked={(bank) => {
            set({ bank });
            setLinking(false);
          }}
        />
      )}
    </div>
  );
}
