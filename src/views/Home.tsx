import { useState } from "react";
import { useStore } from "../store";
import { Transaction } from "../types";
import { totals } from "../engine/ledger";
import { detectRecurring } from "../engine/categorize";
import { fmt } from "../engine/util";
import { EnvelopeRow, TxRow } from "../components/rows";
import { DeclineModal } from "../components/Decline";
import { TxDetail } from "./Activity";

export default function Home() {
  const { state, set } = useStore();
  const t = totals(state);
  const [open, setOpen] = useState<Transaction | null>(null);
  const spending = state.envelopes.filter((e) => e.cardSpendable);
  const saving = state.envelopes.filter((e) => !e.cardSpendable);
  const review = state.transactions.filter((x) => x.status !== "declined" && !x.confirmed);
  const recurring = detectRecurring(state.transactions, state.envelopes).filter(
    (r) => !r.inSubscriptions && !state.dismissedSubscriptions.includes(r.merchant.toLowerCase())
  );
  const latestDecline = state.transactions.find((x) => x.status === "declined" && x.decline?.code === "insufficient" && !x.decline.coveredBy && x.createdAt.slice(0, 10) === state.now.slice(0, 10));

  return (
    <div className="page">
      <section className="balance card">
        <div>
          <div className="muted small">In your Fin account</div>
          <div className="big-number">{fmt(t.cash)}</div>
        </div>
        <div className="balance-grid">
          <div>
            <div className="muted small">Card can spend</div>
            <strong>{fmt(t.cardAvailable)}</strong>
          </div>
          <div>
            <div className="muted small">Pending holds</div>
            <strong>{fmt(t.held)}</strong>
          </div>
          <div>
            <div className="muted small">Unassigned</div>
            <strong className={state.unassigned > 0 ? "t-warn" : ""}>{fmt(state.unassigned)}</strong>
          </div>
          <div>
            <div className="muted small">On the way in</div>
            <strong>{fmt(t.pendingIn)}</strong>
          </div>
        </div>
      </section>

      {(latestDecline || review.length > 0 || recurring.length > 0) && (
        <section className="attention">
          {latestDecline && (
            <button className="note over-note clickable" onClick={() => setOpen(latestDecline)}>
              <strong>Declined at {latestDecline.merchant}.</strong> {latestDecline.decline?.message} Tap for options.
            </button>
          )}
          {review.length > 0 && (
            <button className="note clickable" onClick={() => set({ view: "activity" })}>
              <strong>{review.length} purchase{review.length > 1 ? "s" : ""} to check.</strong> The merchant code could mean more than one thing. Confirm or change the envelope.
            </button>
          )}
          {recurring.length > 0 && (
            <button className="note clickable" onClick={() => set({ view: "activity" })}>
              <strong>Looks like a subscription: {recurring.map((r) => r.merchant).join(", ")}.</strong> Same amount every month, but not in your Subscriptions envelope.
            </button>
          )}
        </section>
      )}

      <div className="two-col">
        <section>
          <div className="section-head">
            <h2>Spending envelopes</h2>
            <button className="link-btn small" onClick={() => set({ view: "budget" })}>
              Manage
            </button>
          </div>
          <div className="card list">
            {spending.map((e) => (
              <EnvelopeRow key={e.id} e={e} />
            ))}
          </div>
          <div className="section-head">
            <h2>Saving and bills</h2>
          </div>
          <div className="card list">
            {saving.map((e) => (
              <EnvelopeRow key={e.id} e={e} />
            ))}
          </div>
        </section>
        <section>
          <div className="section-head">
            <h2>Recent</h2>
            <button className="link-btn small" onClick={() => set({ view: "activity" })}>
              All activity
            </button>
          </div>
          <div className="card list">
            {state.transactions.length === 0 && <p className="muted small">No purchases yet. Try one from the Card tab.</p>}
            {state.transactions.slice(0, 8).map((x) => (
              <TxRow key={x.id} tx={x} onClick={() => setOpen(x)} />
            ))}
          </div>
          <button className="btn btn-primary btn-block top-gap" onClick={() => set({ view: "card" })}>
            Try a purchase
          </button>
        </section>
      </div>
      {open && open.status === "declined" && <DeclineModal tx={open} onClose={() => setOpen(null)} />}
      {open && open.status !== "declined" && <TxDetail txId={open.id} onClose={() => setOpen(null)} />}
    </div>
  );
}
