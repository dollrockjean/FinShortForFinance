import { useState } from "react";
import {
  ArrowDownLeft,
  Banknote,
  ChartColumn,
  ChevronRight,
  CircleCheck,
  CircleX,
  CreditCard,
  Hourglass,
  Inbox,
  Info,
  Layers,
  ListChecks,
  Repeat,
  Sparkles,
  TriangleAlert,
  Wallet,
  Zap,
} from "lucide-react";
import { useStore } from "../store";
import { Transaction } from "../types";
import { totals } from "../engine/ledger";
import { detectRecurring } from "../engine/categorize";
import { fmt, fmtDate } from "../engine/util";
import { Empty, FinMark, Segmented } from "../components/ui";
import { EnvelopeCard, TxRow } from "../components/rows";
import { DailySpendChart, EnvelopeBreakdown } from "../components/charts";
import { DeclineModal } from "../components/Decline";
import { useUi } from "../components/options";
import { upcoming } from "../components/upcoming";
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

type Alert = { key: string; tone: "critical" | "warning" | "info" | "neutral"; title: string; sub: string; onClick?: () => void };

export default function Home() {
  const { state, set } = useStore();
  const { openPayments } = useUi();
  const t = totals(state);
  const [open, setOpen] = useState<Transaction | null>(null);
  const [envOpen, setEnvOpen] = useState<string | null>(null);
  const [group, setGroup] = useState<"spend" | "save">("spend");
  const [chart, setChart] = useState<"day" | "category">("day");
  const first = state.user?.name.split(" ")[0];
  const envs = state.envelopes.filter((e) => (group === "spend" ? e.cardSpendable : !e.cardSpendable));
  const next = upcoming(state, 4);

  const alerts: Alert[] = [];
  const today = state.now.slice(0, 10);
  const decline = state.transactions.find((x) => x.status === "declined" && x.decline?.code === "insufficient" && !x.decline.coveredBy && x.createdAt.slice(0, 10) === today);
  if (state.envelopes.length === 0) alerts.push({ key: "setup", tone: "critical", title: "No categories yet", sub: "The card declines everything until you set them up", onClick: () => set({ view: "budget" }) });
  if (decline) alerts.push({ key: "decline", tone: "critical", title: `Declined at ${decline.merchant}`, sub: `Short by ${fmt(decline.decline?.shortBy ?? 0)}. Tap to cover it.`, onClick: () => setOpen(decline) });
  if (state.unassigned > 0) alerts.push({ key: "unassigned", tone: "warning", title: `${fmt(state.unassigned)} has no job`, sub: "Put it in categories so the card can use it", onClick: () => set({ view: "budget" }) });
  const low = state.envelopes.filter((e) => e.cardSpendable && e.warned80 && !e.warned100);
  if (low.length) alerts.push({ key: "low", tone: "warning", title: `Running low: ${low.map((e) => e.name).join(", ")}`, sub: "Past the warning line for this period", onClick: () => set({ view: "budget" }) });
  const review = state.transactions.filter((x) => x.status !== "declined" && !x.confirmed).length;
  if (review) alerts.push({ key: "review", tone: "info", title: `${review} purchase${review > 1 ? "s" : ""} to check`, sub: "Vague merchant codes, confirm the category", onClick: () => set({ view: "activity" }) });
  const recurring = detectRecurring(state.transactions, state.envelopes).filter((r) => !r.inSubscriptions && !state.dismissedSubscriptions.includes(r.merchant.toLowerCase()));
  if (recurring.length) alerts.push({ key: "subs", tone: "neutral", title: `Subscription spotted: ${recurring.map((r) => r.merchant).join(", ")}`, sub: "Not coming out of Subscriptions", onClick: () => set({ view: "activity" }) });

  const toneIcon = { critical: <CircleX size={15} />, warning: <TriangleAlert size={15} />, info: <Info size={15} />, neutral: <Repeat size={15} /> };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="hero hero-split">
        <svg className="hero-watermark" width="260" height="260" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M4 26 C8 18 13 8 22 4 C18 12 20 22 27 26 Z" stroke="#fff" strokeWidth={1.2} strokeLinejoin="round" />
        </svg>
        <div className="hero-main">
          <div className="hero-label">
            <FinMark size={15} color="rgba(242,251,246,0.85)" /> {first ? `${first}'s Fin account` : "Fin account"}
          </div>
          <div className="hero-amount">
            <Money c={t.cash} />
          </div>
          <div className="hero-actions">
            <button className="hero-btn primary" onClick={() => openPayments("card")}>
              <Zap size={15} /> Test a payment
            </button>
            <button className="hero-btn" onClick={() => set({ view: "budget" })}>
              <Layers size={15} /> Assign
            </button>
            <button className="hero-btn" onClick={() => openPayments("deposit")}>
              <ArrowDownLeft size={15} /> Add money
            </button>
            <button className="hero-btn" onClick={() => openPayments("cash")}>
              <Banknote size={15} /> Log cash
            </button>
          </div>
        </div>
        <div className="hero-stats two">
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

      <div className="page-grid">
        <div>
          <div className="card">
            <div className="card-head">
              <h2>
                <Wallet size={17} /> Categories
              </h2>
              {state.envelopes.length > 0 && (
                <Segmented
                  label="Category group"
                  value={group}
                  onChange={setGroup}
                  options={[
                    { value: "spend", label: "Spending" },
                    { value: "save", label: "Saving and bills" },
                  ]}
                />
              )}
            </div>
            {state.envelopes.length === 0 ? (
              <Empty icon={<Sparkles size={20} />} title="No categories yet">
                <button className="btn btn-primary btn-sm top-gap" onClick={() => set({ view: "budget" })}>
                  Set up categories
                </button>
              </Empty>
            ) : (
              <div className="env-grid compact">
                {envs.map((e) => (
                  <EnvelopeCard key={e.id} e={e} onClick={() => setEnvOpen(e.id)} />
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>
                <ChartColumn size={17} /> Spending
              </h2>
              <Segmented
                label="Chart"
                value={chart}
                onChange={setChart}
                options={[
                  { value: "day", label: "By day" },
                  { value: "category", label: "By category" },
                ]}
              />
            </div>
            {chart === "day" ? <DailySpendChart state={state} /> : <EnvelopeBreakdown state={state} limit={8} />}
          </div>
        </div>

        <div>
          <div className="card flush">
            <div className="card-head" style={{ padding: "10px 16px 4px", margin: 0 }}>
              <h2>
                <ListChecks size={17} /> Needs attention
              </h2>
              {alerts.length > 0 && <span className="pill">{alerts.length}</span>}
            </div>
            {alerts.length === 0 && (
              <div className="alert-row" style={{ cursor: "default" }}>
                <span className="notice-icon s-good">
                  <CircleCheck size={15} />
                </span>
                <span className="alert-text">
                  <strong>All clear</strong>
                  <span>Nothing needs you right now</span>
                </span>
              </div>
            )}
            {alerts.map((a) => (
              <button key={a.key} className="alert-row" onClick={a.onClick}>
                <span className={`notice-icon s-${a.tone}`}>{toneIcon[a.tone]}</span>
                <span className="alert-text">
                  <strong>{a.title}</strong>
                  <span>{a.sub}</span>
                </span>
                <ChevronRight size={16} className="faint" />
              </button>
            ))}
          </div>

          <div className="card flush">
            <div className="card-head" style={{ padding: "10px 16px 0", margin: 0 }}>
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
              {state.transactions.slice(0, 5).map((x) => (
                <TxRow key={x.id} tx={x} onClick={() => setOpen(x)} />
              ))}
            </div>
          </div>

          {next.length > 0 && (
            <div className="card flush">
              <div className="card-head" style={{ padding: "10px 16px 4px", margin: 0 }}>
                <h2>Coming up</h2>
                <button className="link-btn small" onClick={() => openPayments("time")}>
                  Move time <ChevronRight size={14} />
                </button>
              </div>
              {next.map((n) => (
                <div key={n.key} className="alert-row" style={{ cursor: "default" }}>
                  {n.icon}
                  <span className="alert-text">
                    <strong>{n.title}</strong>
                    <span>{fmtDate(n.at)}</span>
                  </span>
                  {n.amount && <span className="small num">{n.amount}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {open && open.status === "declined" && <DeclineModal tx={open} onClose={() => setOpen(null)} />}
      {open && open.status !== "declined" && <TxDetail txId={open.id} onClose={() => setOpen(null)} />}
      {envOpen && <EnvelopeModal id={envOpen} onClose={() => setEnvOpen(null)} />}
    </div>
  );
}
