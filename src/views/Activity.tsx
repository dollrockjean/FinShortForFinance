import { useMemo, useState } from "react";
import { ArrowRightLeft, Banknote, Check, CircleCheck, CreditCard, Hourglass, ListFilter, Repeat, Search, ShieldAlert, Split, Trash2, X } from "lucide-react";
import { useStore } from "../store";
import { Allocation, Cents, Transaction } from "../types";
import { available, confirmCategory, reassign, settle } from "../engine/ledger";
import { LEARN_THRESHOLD, detectRecurring, merchantKey, recordCorrection } from "../engine/categorize";
import { makeEnvelope } from "../engine/presets";
import { fmt, fmtDate, fmtDateLong, sum } from "../engine/util";
import { Callout, Dropdown, Empty, ErrorText, Field, Modal, MoneyInput, Option, StatusPill, useToast } from "../components/ui";
import { MerchantAvatar } from "../components/meta";
import { TxRow, envelopeNames, txStatus } from "../components/rows";
import { DeclineModal } from "../components/Decline";
import { envelopeOptions, useUi } from "../components/options";

type Status = "all" | "review" | "settled" | "pending" | "declined" | "overrides";
type Source = "all" | "card" | "manual";

function dayLabel(iso: string, now: string): string {
  const d = iso.slice(0, 10);
  if (d === now.slice(0, 10)) return "Today";
  const y = new Date(new Date(now).getTime() - 86_400_000).toISOString().slice(0, 10);
  if (d === y) return "Yesterday";
  return fmtDateLong(iso);
}

export default function Activity() {
  const { state } = useStore();
  const { openPayments } = useUi();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [source, setSource] = useState<Source>("all");
  const [envelope, setEnvelope] = useState("all");
  const [open, setOpen] = useState<Transaction | null>(null);

  const counts = useMemo(
    () => ({
      review: state.transactions.filter((t) => t.status !== "declined" && !t.confirmed).length,
      pending: state.transactions.filter((t) => t.status === "pending").length,
      declined: state.transactions.filter((t) => t.status === "declined").length,
      overrides: state.transactions.filter((t) => t.override).length,
    }),
    [state.transactions]
  );

  const list = state.transactions.filter((t) => {
    if (q && !t.merchant.toLowerCase().includes(q.toLowerCase())) return false;
    if (source !== "all" && t.source !== source) return false;
    if (envelope !== "all" && !t.allocations.some((a) => a.envelopeId === envelope) && t.decline?.envelopeId !== envelope) return false;
    if (status === "review") return t.status !== "declined" && !t.confirmed;
    if (status === "overrides") return !!t.override;
    if (status !== "all") return t.status === status;
    return true;
  });

  const groups: { label: string; items: Transaction[] }[] = [];
  for (const t of list.slice(0, 250)) {
    const label = dayLabel(t.createdAt, state.now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }
  const filtered = status !== "all" || source !== "all" || envelope !== "all" || q;

  const statusOptions: Option<Status>[] = [
    { value: "all", label: "All statuses", icon: <ListFilter size={15} className="faint" /> },
    { value: "review", label: "To check", icon: <StatusDot s="info" />, meta: counts.review || undefined },
    { value: "settled", label: "Settled", icon: <StatusDot s="good" /> },
    { value: "pending", label: "Pending holds", icon: <StatusDot s="warning" />, meta: counts.pending || undefined },
    { value: "declined", label: "Declined", icon: <StatusDot s="critical" />, meta: counts.declined || undefined },
    { value: "overrides", label: "Emergency overrides", icon: <ShieldAlert size={15} className="t-warn" />, meta: counts.overrides || undefined },
  ];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stat-row">
        <button className="stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setStatus("review")}>
          <div className="label">
            <CircleCheck size={14} /> To check
          </div>
          <div className="value">{counts.review}</div>
          <div className="sub">Vague merchant codes</div>
        </button>
        <button className="stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setStatus("pending")}>
          <div className="label">
            <Hourglass size={14} /> Pending holds
          </div>
          <div className="value">{counts.pending}</div>
          <div className="sub">Gas, hotels, rentals</div>
        </button>
        <button className="stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setStatus("declined")}>
          <div className="label">
            <X size={14} /> Declined
          </div>
          <div className="value">{counts.declined}</div>
          <div className="sub">Stopped at the register</div>
        </button>
        <button className="stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setStatus("overrides")}>
          <div className="label">
            <ShieldAlert size={14} /> Overrides
          </div>
          <div className="value">{counts.overrides}</div>
          <div className="sub">Covered from emergency</div>
        </button>
      </div>

      <div className="card flush">
        <div className="toolbar" style={{ padding: "8px 16px 4px" }}>
          <div className="search">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchants" aria-label="Search merchants" />
          </div>
          <Dropdown compact ariaLabel="Status" value={status} onChange={setStatus} options={statusOptions} />
          <Dropdown
            compact
            ariaLabel="Category"
            value={envelope}
            onChange={setEnvelope}
            options={[{ value: "all", label: "All categories", icon: <ListFilter size={15} className="faint" /> }, ...envelopeOptions(state.envelopes, { showBalance: false })]}
          />
          <Dropdown
            compact
            ariaLabel="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: "all", label: "Card and cash", icon: <ListFilter size={15} className="faint" /> },
              { value: "card", label: "Card only", icon: <CreditCard size={15} className="faint" /> },
              { value: "manual", label: "Cash only", icon: <Banknote size={15} className="faint" /> },
            ]}
          />
          {filtered && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQ("");
                setStatus("all");
                setSource("all");
                setEnvelope("all");
              }}
            >
              <X size={14} /> Clear
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => openPayments("cash")}>
            <Banknote size={15} /> Log cash
          </button>
        </div>
        {status === "overrides" && (
          <div style={{ padding: "0 16px" }}>
            <Callout status="warning">Every time a decline was covered from the emergency fund, with the reason given at the time. Worth a read at the end of the month.</Callout>
          </div>
        )}
        {list.length === 0 && <Empty icon={<Search size={20} />} title="Nothing matches">Try a different filter.</Empty>}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="date-group">
              <span>{g.label}</span>
              <span className="num">-{fmt(sum(g.items.filter((t) => t.status !== "declined").map((t) => t.amount)))}</span>
            </div>
            <div className="tx-list">
              {g.items.map((t) => (
                <div key={t.id}>
                  <TxRow tx={t} onClick={() => setOpen(t)} showDate={false} />
                  {status === "overrides" && t.override && (
                    <div className="small muted" style={{ padding: "0 16px 10px 66px", fontStyle: "italic", marginTop: -4 }}>
                      "{t.override.note || "No note"}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Recurring />

      {open && open.status === "declined" && <DeclineModal tx={open} onClose={() => setOpen(null)} />}
      {open && open.status !== "declined" && <TxDetail txId={open.id} onClose={() => setOpen(null)} />}
    </div>
  );
}

function StatusDot({ s }: { s: "good" | "warning" | "critical" | "info" }) {
  return <span className="dot-c" style={{ ["--c" as string]: `var(--${s})`, width: 9, height: 9, margin: "0 3px" }} />;
}

function Recurring() {
  const { state, set } = useStore();
  const toast = useToast();
  const recurring = detectRecurring(state.transactions, state.envelopes);
  if (recurring.length === 0) return null;
  const subs = state.envelopes.find((e) => e.kind === "subscriptions");
  const monthly = sum(recurring.map((r) => r.amount));

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
    toast({ status: "good", title: `${merchant} will charge Subscriptions from now on` });
  }

  return (
    <div className="card flush">
      <div className="card-head" style={{ padding: "10px 16px 0" }}>
        <h2>
          <Repeat size={17} /> Recurring charges
        </h2>
        <span className="small muted num">{fmt(monthly)} a month</span>
      </div>
      <p className="small muted" style={{ padding: "0 16px" }}>
        Same merchant, same amount, about a month apart. Fin spotted these on its own.
      </p>
      <div className="tx-list">
        {recurring.map((r) => {
          const routed = state.corrections[merchantKey(r.merchant)]?.[subs?.id ?? ""] >= LEARN_THRESHOLD;
          const dismissed = state.dismissedSubscriptions.includes(r.merchant.toLowerCase());
          return (
            <div key={r.merchant} className="tx-row" style={{ cursor: "default", flexWrap: "wrap" }}>
              <MerchantAvatar name={r.merchant} mcc={state.transactions.find((t) => t.merchant === r.merchant)?.mcc} />
              <div className="tx-main">
                <span className="tx-merchant">{r.merchant}</span>
                <span className="tx-sub">
                  Seen {r.count} times · next around {fmtDate(r.nextExpected)}
                </span>
              </div>
              <div className="tx-right">
                <span className="tx-amt">{fmt(r.amount)}/mo</span>
                {r.inSubscriptions || routed ? (
                  <StatusPill status="good">In Subscriptions</StatusPill>
                ) : dismissed ? (
                  <StatusPill status="neutral">Ignored</StatusPill>
                ) : (
                  <div className="row gap" style={{ gap: 6 }}>
                    <button className="btn btn-primary btn-xs" onClick={() => routeToSubscriptions(r.merchant)}>
                      {subs ? "Move to Subscriptions" : "Create Subscriptions"}
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => set({ dismissedSubscriptions: [...state.dismissedSubscriptions, r.merchant.toLowerCase()] })}>
                      Ignore
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TxDetail({ txId, onClose }: { txId: string; onClose: () => void }) {
  const { state, act } = useStore();
  const toast = useToast();
  const tx = state.transactions.find((t) => t.id === txId);
  const [mode, setMode] = useState<"view" | "change" | "split">("view");
  const [error, setError] = useState<string>();
  const [finalAmt, setFinalAmt] = useState<Cents>(tx?.amount ?? 0);
  const spendable = state.envelopes.filter((e) => e.cardSpendable);
  const [split, setSplit] = useState<Allocation[]>(() =>
    tx ? (tx.allocations.length > 1 ? tx.allocations : [...tx.allocations, { envelopeId: spendable.find((e) => e.id !== tx.allocations[0]?.envelopeId)?.id ?? "", amount: 0 }]) : []
  );
  const [single, setSingle] = useState(tx?.allocations[0]?.envelopeId ?? "");
  if (!tx) return null;

  const splitTotal = sum(split.map((s) => s.amount));
  const run = (fn: Parameters<typeof act>[0], msg: string) => {
    const r = act(fn);
    if (r.error) setError(r.error);
    else {
      toast({ status: "good", title: msg });
      onClose();
    }
  };
  const opts = envelopeOptions(spendable);

  return (
    <Modal title={tx.merchant} onClose={onClose} icon={<MerchantAvatar name={tx.merchant} mcc={tx.mcc} cash={tx.source === "manual"} size={40} />}>
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="big-number">-{fmt(tx.amount)}</div>
        {txStatus(tx) ?? <StatusPill status="good">Settled</StatusPill>}
      </div>
      <div className="kv">
        <span>Date</span>
        <span>{fmtDateLong(tx.createdAt)}</span>
        <span>Category</span>
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
            <span>Why this category</span>
            <span>{tx.suggestionReason}</span>
          </>
        )}
        <span>Paid with</span>
        <span>{tx.source === "manual" ? "Cash, logged by hand" : `Fin card •••• ${state.card?.last4 ?? ""}`}</span>
        {tx.allocations.length > 1 &&
          tx.allocations.map((a) => (
            <FragmentPair key={a.envelopeId} left={`  ${state.envelopes.find((e) => e.id === a.envelopeId)?.name ?? "Deleted"}`} right={fmt(a.amount)} />
          ))}
      </div>
      {tx.override && (
        <div className="top-gap">
          <Callout status="warning" title={`${fmt(tx.override.amount)} covered from the emergency fund`}>
            "{tx.override.note || "No note"}"
          </Callout>
        </div>
      )}

      {tx.status === "pending" && (
        <div className="top-gap">
          <Callout status="warning" title={`Holding ${fmt(tx.holdAmount ?? tx.amount)}`}>
            When it settles, the real amount comes out and the rest of the hold goes back to {envelopeNames(tx, state.envelopes)}.
          </Callout>
          <Field label="Final amount">
            <MoneyInput value={finalAmt} onChange={setFinalAmt} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-primary btn-block" onClick={() => run((s) => settle(s, tx.id, finalAmt), `Settled at ${fmt(finalAmt)}`)}>
            <Check size={16} /> Settle now
          </button>
        </div>
      )}

      {tx.status === "settled" && mode === "view" && (
        <div className="stack top-gap">
          {!tx.confirmed && (
            <>
              <Callout status="info">The merchant code is vague. Is {envelopeNames(tx, state.envelopes)} right?</Callout>
              <button className="btn btn-primary btn-block" onClick={() => run((s) => confirmCategory(s, tx.id), "Confirmed")}>
                <Check size={16} /> Yes, {envelopeNames(tx, state.envelopes)} is right
              </button>
            </>
          )}
          <div className="grid-2">
            <button className="btn btn-outline" onClick={() => setMode("change")}>
              <ArrowRightLeft size={15} /> Change category
            </button>
            <button className="btn btn-outline" onClick={() => setMode("split")}>
              <Split size={15} /> Split it
            </button>
          </div>
        </div>
      )}

      {mode === "change" && (
        <div className="top-gap">
          <Field label="Category" hint={`Pick the same category for ${tx.merchant} twice and Fin makes it the default.`}>
            <Dropdown value={single} onChange={setSingle} options={opts} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-primary btn-block" onClick={() => run((s) => reassign(s, tx.id, [{ envelopeId: single, amount: tx.amount }]), "Moved")}>
            Move it
          </button>
        </div>
      )}

      {mode === "split" && (
        <div className="top-gap">
          {split.map((a, i) => (
            <div key={i} className="split-row">
              <Dropdown value={a.envelopeId} onChange={(v) => setSplit(split.map((x, j) => (j === i ? { ...x, envelopeId: v } : x)))} options={opts} ariaLabel="Category" />
              <MoneyInput value={a.amount} onChange={(v) => setSplit(split.map((x, j) => (j === i ? { ...x, amount: v } : x)))} ariaLabel="Amount" />
              <button className="icon-btn" disabled={split.length <= 2} onClick={() => setSplit(split.filter((_, j) => j !== i))} aria-label="Remove row">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div className="row small">
            <button className="link-btn small" onClick={() => setSplit([...split, { envelopeId: spendable[0]?.id ?? "", amount: 0 }])}>
              + Add category
            </button>
            {splitTotal === tx.amount ? (
              <StatusPill status="good">Adds up</StatusPill>
            ) : (
              <StatusPill status="warning">{splitTotal < tx.amount ? `${fmt(tx.amount - splitTotal)} left` : `${fmt(splitTotal - tx.amount)} over`}</StatusPill>
            )}
          </div>
          {split.length >= 2 && split[1].amount === 0 && (
            <button className="link-btn small top-gap" onClick={() => setSplit(split.map((x, j) => (j === split.length - 1 ? { ...x, amount: Math.max(0, tx.amount - sum(split.slice(0, -1).map((y) => y.amount))) } : x)))}>
              Put the rest in the last row
            </button>
          )}
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-primary btn-block top-gap" disabled={splitTotal !== tx.amount} onClick={() => run((s) => reassign(s, tx.id, split), "Split saved")}>
            <Split size={15} /> Save split
          </button>
          <div className="xs muted top-gap">Each category needs enough free money to take its share.</div>
        </div>
      )}
    </Modal>
  );
}

function FragmentPair({ left, right }: { left: string; right: string }) {
  return (
    <>
      <span>{left}</span>
      <span className="num">{right}</span>
    </>
  );
}
