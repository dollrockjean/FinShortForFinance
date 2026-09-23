import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Allocation, Cents, Transaction } from "../types";
import { available, confirmCategory, emergencyEnvelope, manualExpense, reassign, settle } from "../engine/ledger";
import { LEARN_THRESHOLD, detectRecurring, merchantKey, recordCorrection } from "../engine/categorize";
import { makeEnvelope } from "../engine/presets";
import { fmt, fmtDate, sum } from "../engine/util";
import { ErrorText, Field, Modal, MoneyInput, Segmented } from "../components/ui";
import { TxRow, envelopeNames } from "../components/rows";
import { DeclineModal } from "../components/Decline";

type Filter = "all" | "review" | "pending" | "declined" | "cash" | "overrides";

export default function Activity() {
  const { state } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Transaction | null>(null);
  const [cash, setCash] = useState(false);

  const counts = {
    review: state.transactions.filter((t) => t.status !== "declined" && !t.confirmed).length,
    pending: state.transactions.filter((t) => t.status === "pending").length,
  };
  const list = state.transactions.filter((t) => {
    if (filter === "review") return t.status !== "declined" && !t.confirmed;
    if (filter === "pending") return t.status === "pending";
    if (filter === "declined") return t.status === "declined";
    if (filter === "cash") return t.source === "manual";
    if (filter === "overrides") return !!t.override;
    return true;
  });

  return (
    <div className="page">
      <div className="section-head">
        <h1>Activity</h1>
        <button className="btn btn-outline btn-sm" onClick={() => setCash(true)}>
          Log cash spending
        </button>
      </div>
      <div className="filters">
        <Segmented
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "review", label: `To check${counts.review ? ` (${counts.review})` : ""}` },
            { value: "pending", label: `Pending${counts.pending ? ` (${counts.pending})` : ""}` },
            { value: "declined", label: "Declined" },
            { value: "cash", label: "Cash" },
            { value: "overrides", label: "Overrides" },
          ]}
        />
      </div>
      {filter === "overrides" && (
        <p className="muted small">Every time you covered a decline from the emergency fund, and the reason you gave. Worth a look at the end of each month.</p>
      )}
      <div className="card list">
        {list.length === 0 && <p className="muted small">Nothing here.</p>}
        {list.slice(0, 200).map((t) =>
          filter === "overrides" && t.override ? (
            <div key={t.id} className="override-row">
              <TxRow tx={t} onClick={() => setOpen(t)} />
              <div className="small muted override-note">"{t.override.note || "No note"}"</div>
            </div>
          ) : (
            <TxRow key={t.id} tx={t} onClick={() => setOpen(t)} />
          )
        )}
      </div>

      <Recurring />

      {open && open.status === "declined" && <DeclineModal tx={open} onClose={() => setOpen(null)} />}
      {open && open.status !== "declined" && <TxDetail txId={open.id} onClose={() => setOpen(null)} />}
      {cash && <CashModal onClose={() => setCash(false)} />}
    </div>
  );
}

function Recurring() {
  const { state, set } = useStore();
  const recurring = detectRecurring(state.transactions, state.envelopes);
  if (recurring.length === 0) return null;
  const subs = state.envelopes.find((e) => e.kind === "subscriptions");

  function routeToSubscriptions(merchant: string) {
    let envelopes = state.envelopes;
    let target = subs;
    if (!target) {
      target = makeEnvelope("subscriptions", { now: state.now, target: 0, priority: 60 });
      envelopes = [...envelopes, target];
    }
    // counts as enough corrections that future charges go straight to Subscriptions
    let corrections = state.corrections;
    for (let i = 0; i < LEARN_THRESHOLD; i++) corrections = recordCorrection(corrections, merchant, target.id);
    set({ envelopes, corrections });
  }

  return (
    <>
      <div className="section-head">
        <h2>Recurring charges</h2>
      </div>
      <p className="muted small">Same merchant, same amount, about a month apart. Fin found these on its own.</p>
      <div className="card list">
        {recurring.map((r) => {
          const routed = state.corrections[merchantKey(r.merchant)]?.[subs?.id ?? ""] >= LEARN_THRESHOLD;
          const dismissed = state.dismissedSubscriptions.includes(r.merchant.toLowerCase());
          return (
            <div key={r.merchant} className="recurring-row">
              <div>
                <strong>{r.merchant}</strong>
                <div className="small muted">
                  {fmt(r.amount)} a month · seen {r.count} times · next around {fmtDate(r.nextExpected)}
                </div>
              </div>
              {r.inSubscriptions || routed ? (
                <span className="small muted">In Subscriptions</span>
              ) : dismissed ? (
                <span className="small muted">Ignored</span>
              ) : (
                <div className="row gap">
                  <button className="btn btn-primary btn-xs" onClick={() => routeToSubscriptions(r.merchant)}>
                    {subs ? "Send future charges to Subscriptions" : "Create a Subscriptions envelope"}
                  </button>
                  <button className="link-btn small" onClick={() => set({ dismissedSubscriptions: [...state.dismissedSubscriptions, r.merchant.toLowerCase()] })}>
                    Not a subscription
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function TxDetail({ txId, onClose }: { txId: string; onClose: () => void }) {
  const { state, act } = useStore();
  const tx = state.transactions.find((t) => t.id === txId);
  const [mode, setMode] = useState<"view" | "change" | "split">("view");
  const [error, setError] = useState<string>();
  const [finalAmt, setFinalAmt] = useState<Cents>(tx?.amount ?? 0);
  const spendable = state.envelopes.filter((e) => e.cardSpendable);
  const initialSplit = useMemo<Allocation[]>(
    () => (tx ? (tx.allocations.length > 1 ? tx.allocations : [...tx.allocations, { envelopeId: spendable.find((e) => e.id !== tx.allocations[0]?.envelopeId)?.id ?? "", amount: 0 }]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txId]
  );
  const [split, setSplit] = useState<Allocation[]>(initialSplit);
  const [single, setSingle] = useState(tx?.allocations[0]?.envelopeId ?? "");
  if (!tx) return null;

  const splitTotal = sum(split.map((s) => s.amount));
  const run = (fn: Parameters<typeof act>[0]) => {
    const r = act(fn);
    if (r.error) setError(r.error);
    else onClose();
  };

  return (
    <Modal title={tx.merchant} onClose={onClose}>
      <div className="detail-amount">{fmt(tx.amount)}</div>
      <div className="kv">
        <span>Date</span>
        <span>{fmtDate(tx.createdAt)}</span>
        <span>Envelope</span>
        <span>{envelopeNames(tx, state.envelopes)}</span>
        {tx.mcc && (
          <>
            <span>Merchant code</span>
            <span>
              {tx.mcc} · {tx.mccLabel}
            </span>
          </>
        )}
        {tx.suggestionReason && (
          <>
            <span>Why this envelope</span>
            <span>{tx.suggestionReason}</span>
          </>
        )}
        {tx.override && (
          <>
            <span>Override</span>
            <span>
              {fmt(tx.override.amount)} from emergency fund. "{tx.override.note || "No note"}"
            </span>
          </>
        )}
        <span>Source</span>
        <span>{tx.source === "manual" ? "Logged by hand (cash)" : "Fin card"}</span>
      </div>

      {tx.status === "pending" && (
        <div className="top-gap">
          <div className="note small">
            The merchant is holding {fmt(tx.holdAmount ?? tx.amount)}. When it settles, the real amount comes out of {envelopeNames(tx, state.envelopes)} and the rest of the hold goes back. The demo
            clock settles holds after a day, or you can do it now.
          </div>
          <Field label="Final amount">
            <MoneyInput value={finalAmt} onChange={setFinalAmt} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-primary btn-block" onClick={() => run((s) => settle(s, tx.id, finalAmt))}>
            Settle now
          </button>
        </div>
      )}

      {tx.status === "settled" && mode === "view" && (
        <div className="stack top-gap">
          {!tx.confirmed && (
            <button className="btn btn-primary btn-block" onClick={() => run((s) => confirmCategory(s, tx.id))}>
              {envelopeNames(tx, state.envelopes)} is right
            </button>
          )}
          <button className="btn btn-outline btn-block" onClick={() => setMode("change")}>
            Move to a different envelope
          </button>
          <button className="btn btn-outline btn-block" onClick={() => setMode("split")}>
            Split across envelopes
          </button>
        </div>
      )}

      {mode === "change" && (
        <div className="top-gap">
          <Field label="Envelope" hint="Fin remembers. Pick the same envelope for this merchant twice and it becomes the default.">
            <select value={single} onChange={(e) => setSingle(e.target.value)}>
              {spendable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({fmt(available(e))} free)
                </option>
              ))}
            </select>
          </Field>
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-primary btn-block" onClick={() => run((s) => reassign(s, tx.id, [{ envelopeId: single, amount: tx.amount }]))}>
            Move it
          </button>
        </div>
      )}

      {mode === "split" && (
        <div className="top-gap">
          {split.map((a, i) => (
            <div key={i} className="split-row">
              <select value={a.envelopeId} onChange={(e) => setSplit(split.map((x, j) => (j === i ? { ...x, envelopeId: e.target.value } : x)))} aria-label="Envelope">
                {spendable.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <MoneyInput value={a.amount} onChange={(v) => setSplit(split.map((x, j) => (j === i ? { ...x, amount: v } : x)))} ariaLabel="Amount" />
              {split.length > 2 && (
                <button className="link-btn small" onClick={() => setSplit(split.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <div className="row small">
            <button className="link-btn small" onClick={() => setSplit([...split, { envelopeId: spendable[0]?.id ?? "", amount: 0 }])}>
              Add another envelope
            </button>
            <span className={splitTotal === tx.amount ? "muted" : "t-warn"}>
              {fmt(splitTotal)} of {fmt(tx.amount)}
              {splitTotal !== tx.amount && ` (${splitTotal < tx.amount ? fmt(tx.amount - splitTotal) + " left" : fmt(splitTotal - tx.amount) + " over"})`}
            </span>
          </div>
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-primary btn-block top-gap" disabled={splitTotal !== tx.amount} onClick={() => run((s) => reassign(s, tx.id, split))}>
            Save split
          </button>
        </div>
      )}
    </Modal>
  );
}

function CashModal({ onClose }: { onClose: () => void }) {
  const { state, act } = useStore();
  const spendable = state.envelopes.filter((e) => e.cardSpendable);
  const [merchant, setMerchant] = useState("");
  const [envelopeId, setEnvelopeId] = useState(spendable[0]?.id ?? "");
  const [amount, setAmount] = useState<Cents>(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const env = state.envelopes.find((e) => e.id === envelopeId);
  const short = env ? amount - available(env) : 0;
  const emergency = emergencyEnvelope(state);

  return (
    <Modal title="Log cash spending" onClose={onClose}>
      <p className="muted small">
        The card never sees cash, ATM withdrawals, or anything paid elsewhere. Log it here and it comes out of the envelope like a swipe would. Fin sends the matching amount back to your linked
        bank, since that's where the cash came from.
      </p>
      <Field label="Where">
        <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Farmers market" />
      </Field>
      <div className="grid-2">
        <Field label="Envelope">
          <select value={envelopeId} onChange={(e) => setEnvelopeId(e.target.value)}>
            {spendable.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({fmt(available(e))})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
      </div>
      {short > 0 && env && (
        <>
          <div className="note warn-note small">
            {env.name} is short by {fmt(short)}. The money's already spent, so the gap has to come from somewhere: your emergency fund ({fmt(emergency ? available(emergency) : 0)}).
          </div>
          <Field label="Why? (for you, later)">
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <button
        className="btn btn-primary btn-block"
        disabled={!merchant.trim() || amount <= 0}
        onClick={() => {
          const r = act((s) => manualExpense(s, { merchant: merchant.trim(), envelopeId, amount, coverNote: short > 0 ? note : undefined }));
          if (r.error) setError(r.error);
          else onClose();
        }}
      >
        {short > 0 ? `Log it and cover ${fmt(short)}` : "Log it"}
      </button>
    </Modal>
  );
}
