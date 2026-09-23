import { useState } from "react";
import { ArrowDownLeft, Banknote, ChartColumn, ChevronRight, CreditCard, Hourglass, Inbox, Layers, Repeat, Wallet, Zap } from "lucide-react";
import { useStore } from "../store";
import { Transaction } from "../types";
import { totals } from "../engine/ledger";
import { detectRecurring } from "../engine/categorize";
import { fmt } from "../engine/util";
import { Callout, Empty, FinMark, Segmented } from "../components/ui";
import { EnvelopeCard, TxRow } from "../components/rows";
import { DailySpendChart, EnvelopeBreakdown } from "../components/charts";
import { DeclineModal } from "../components/Decline";
import { useUi } from "../components/options";
import { TxDetail } from "./Activity";
import { EnvelopeModal } from "./Budget";

function Money({ c }: { c: number }) {
  const [d, cents] = fmt(c).split(".");
  return (
    <>
      {d}
      <span className="cents">.{cents}</span>
    </>
  );
}

export default function Home() {
  const { state, set } = useStore();
  const { openPayments } = useUi();
  const t = totals(state);
  const [open, setOpen] = useState<Transaction | null>(null);
  const [envOpen, setEnvOpen] = useState<string | null>(null);
  const [group, setGroup] = useState<"spend" | "save">("spend");
  const review = state.transactions.filter((x) => x.status !== "declined" && !x.confirmed);
  const recurring = detectRecurring(state.transactions, state.envelopes).filter((r) => !r.inSubscriptions && !state.dismissedSubscriptions.includes(r.merchant.toLowerCase()));
  const today = state.now.slice(0, 10);
  const decline = state.transactions.find((x) => x.status === "declined" && x.decline?.code === "insufficient" && !x.decline.coveredBy && x.createdAt.slice(0, 10) === today);
  const lowEnvs = state.envelopes.filter((e) => e.cardSpendable && e.warned80 && !e.warned100);
  const envs = state.envelopes.filter((e) => (group === "spend" ? e.cardSpendable : !e.cardSpendable));
  const first = state.user?.name.split(" ")[0];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="hero">
        <svg className="hero-watermark" width="260" height="260" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M4 26 C8 18 13 8 22 4 C18 12 20 22 27 26 Z" stroke="#fff" strokeWidth={1.2} strokeLinejoin="round" />
        </svg>
        <div className="hero-label">
          <FinMark size={15} color="rgba(242,251,246,0.85)" /> {first ? `${first}'s Fin account` : "Fin account"}
        </div>
        <div className="hero-amount">
          <Money c={t.cash} />
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="label">
              <CreditCard size={13} /> Card can spend
            </div>
            <div className="value">{fmt(t.cardAvailable)}</div>
          </div>
          <div className={`hero-stat ${state.unassigned > 0 ? "attn" : ""}`}>
            <div className="label">
              <Inbox size={13} /> Unassigned
            </div>
            <div className="value">{fmt(state.unassigned)}</div>
          </div>
          <div className="hero-stat">
            <div className="label">
              <Hourglass size={13} /> On hold
            </div>
            <div className="value">{fmt(t.held)}</div>
          </div>
          <div className="hero-stat">
            <div className="label">
              <ArrowDownLeft size={13} /> Arriving
            </div>
            <div className="value">{fmt(t.pendingIn)}</div>
          </div>
        </div>
      </section>

      <div className="quick-actions">
        <button className="quick" onClick={() => openPayments("card")}>
          <span className="quick-icon">
            <Zap size={17} />
          </span>
          <span>
            <div className="quick-title">Test a payment</div>
            <div className="quick-sub">Swipe the card, see what happens</div>
          </span>
        </button>
        <button className="quick" onClick={() => set({ view: "budget" })}>
          <span className="quick-icon">
            <Layers size={17} />
          </span>
          <span>
            <div className="quick-title">Assign money</div>
            <div className="quick-sub">{state.unassigned > 0 ? `${fmt(state.unassigned)} waiting` : "All assigned"}</div>
          </span>
        </button>
        <button className="quick" onClick={() => openPayments("deposit")}>
          <span className="quick-icon">
            <ArrowDownLeft size={17} />
          </span>
          <span>
            <div className="quick-title">Add money</div>
            <div className="quick-sub">From {state.bank?.institution ?? "your bank"}</div>
          </span>
        </button>
        <button className="quick" onClick={() => openPayments("cash")}>
          <span className="quick-icon">
            <Banknote size={17} />
          </span>
          <span>
            <div className="quick-title">Log cash</div>
            <div className="quick-sub">Keep the budget honest</div>
          </span>
        </button>
      </div>

      {(decline || review.length > 0 || recurring.length > 0 || state.unassigned > 0 || lowEnvs.length > 0) && (
        <div>
          {decline && (
            <Callout status="critical" title={`Declined at ${decline.merchant}`} onClick={() => setOpen(decline)} action={<ChevronRight size={18} className="faint" />}>
              {decline.decline?.message} Tap to cover it from your emergency fund.
            </Callout>
          )}
          {state.unassigned > 0 && (
            <Callout status="warning" title={`${fmt(state.unassigned)} has no job yet`} onClick={() => set({ view: "budget" })} action={<ChevronRight size={18} className="faint" />}>
              The card can't spend Unassigned money. Put it in envelopes first.
            </Callout>
          )}
          {lowEnvs.length > 0 && (
            <Callout status="warning" title={`Running low: ${lowEnvs.map((e) => e.name).join(", ")}`}>
              Over 80% used for this period.
            </Callout>
          )}
          {review.length > 0 && (
            <Callout status="info" title={`${review.length} purchase${review.length > 1 ? "s" : ""} to check`} onClick={() => set({ view: "activity" })} action={<ChevronRight size={18} className="faint" />}>
              Their merchant codes could mean more than one thing. Confirm or move them.
            </Callout>
          )}
          {recurring.length > 0 && (
            <Callout status="neutral" title={`Looks like a subscription: ${recurring.map((r) => r.merchant).join(", ")}`} onClick={() => set({ view: "activity" })} action={<Repeat size={16} className="faint" />}>
              Same amount every month, but not coming out of Subscriptions.
            </Callout>
          )}
        </div>
      )}

      <div className="page-grid">
        <div>
          <div className="card">
            <div className="card-head">
              <h2>
                <Wallet size={17} /> Envelopes
              </h2>
              <Segmented
                label="Envelope group"
                value={group}
                onChange={setGroup}
                options={[
                  { value: "spend", label: "Spending" },
                  { value: "save", label: "Saving and bills" },
                ]}
              />
            </div>
            <div className="env-grid">
              {envs.map((e) => (
                <EnvelopeCard key={e.id} e={e} onClick={() => setEnvOpen(e.id)} />
              ))}
            </div>
            {envs.length === 0 && <Empty icon={<Wallet size={20} />} title="No envelopes here" />}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>
                <ChartColumn size={17} /> Daily spending
              </h2>
            </div>
            <DailySpendChart state={state} />
          </div>
        </div>

        <div>
          <div className="card flush">
            <div className="card-head" style={{ padding: "10px 16px 0" }}>
              <h2>Recent activity</h2>
              <button className="link-btn small" onClick={() => set({ view: "activity" })}>
                See all <ChevronRight size={14} />
              </button>
            </div>
            <div className="tx-list">
              {state.transactions.length === 0 && (
                <Empty icon={<CreditCard size={20} />} title="No purchases yet">
                  Open Test payments and swipe the card.
                </Empty>
              )}
              {state.transactions.slice(0, 7).map((x) => (
                <TxRow key={x.id} tx={x} onClick={() => setOpen(x)} />
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Where it went</h2>
              <span className="xs muted">This period</span>
            </div>
            <EnvelopeBreakdown state={state} />
          </div>
        </div>
      </div>

      {open && open.status === "declined" && <DeclineModal tx={open} onClose={() => setOpen(null)} />}
      {open && open.status !== "declined" && <TxDetail txId={open.id} onClose={() => setOpen(null)} />}
      {envOpen && <EnvelopeModal id={envOpen} onClose={() => setEnvOpen(null)} />}
    </div>
  );
}
