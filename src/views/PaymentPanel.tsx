import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  Banknote,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  CreditCard,
  FastForward,
  FlaskConical,
  Hourglass,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useStore } from "../store";
import { AppState, Cents, Transaction } from "../types";
import { MCC, findMerchant } from "../engine/catalog";
import { suggestEnvelope } from "../engine/categorize";
import { advanceDays } from "../engine/clock";
import { applyPlan, authorize, available, coverAndRetry, emergencyEnvelope, manualExpense, planFill, settle, transferIn } from "../engine/ledger";
import { addMonths, fmt, fmtDate, sum, uid } from "../engine/util";
import { Callout, Drawer, Dropdown, ErrorText, Field, MoneyInput, Option, Segmented, StatusPill, Toggle, useToast } from "../components/ui";
import { KindBadge, MerchantAvatar } from "../components/meta";
import { envelopeOptions, mccOptions, merchantOptions } from "../components/options";

export type PanelTab = "card" | "cash" | "deposit" | "time";

export default function PaymentPanel({ initialTab, onClose }: { initialTab: PanelTab; onClose: () => void }) {
  const [tab, setTab] = useState<PanelTab>(initialTab);
  return (
    <Drawer
      title="Test payments"
      sub="Run fake transactions through the real rules"
      onClose={onClose}
      icon={
        <span className="quick-icon">
          <FlaskConical size={18} />
        </span>
      }
    >
      <Segmented
        full
        label="Test type"
        value={tab}
        onChange={setTab}
        options={[
          { value: "card", label: "Card", icon: <CreditCard size={14} /> },
          { value: "cash", label: "Cash", icon: <Banknote size={14} /> },
          { value: "deposit", label: "Deposit", icon: <ArrowDownLeft size={14} /> },
          { value: "time", label: "Time", icon: <Clock3 size={14} /> },
        ]}
      />
      <div className="top-gap">
        {tab === "card" && <CardTest />}
        {tab === "cash" && <CashTest />}
        {tab === "deposit" && <DepositTest />}
        {tab === "time" && <TimeTest />}
      </div>
    </Drawer>
  );
}

// ---------- card

type Scenario = { id: string; label: string; description: string; build: (s: AppState) => { merchant: string; amount: Cents; final?: Cents; envelopeId?: string } };

const SCENARIOS: Scenario[] = [
  { id: "grocery", label: "Weekly grocery run", description: "Clear merchant code, should just work", build: () => ({ merchant: "Trader Joe's", amount: 6240 }) },
  { id: "gas", label: "Gas pump pre-auth", description: "Holds $100, settles at the real amount", build: () => ({ merchant: "Shell", amount: 4815 }) },
  {
    id: "over",
    label: "Dinner that doesn't fit",
    description: "More than Eating out has left",
    build: (s) => {
      const e = s.envelopes.find((x) => x.kind === "dining");
      return { merchant: "Olive Garden", amount: (e ? Math.max(0, available(e)) : 0) + 2350 };
    },
  },
  { id: "vague", label: "Big-box store", description: "Vague merchant code, needs a check after", build: () => ({ merchant: "Target", amount: 11860 }) },
  { id: "sub", label: "Subscription renewal", description: "Recurring, same amount monthly", build: () => ({ merchant: "Netflix", amount: 1549 }) },
  { id: "hotel", label: "Hotel check-in", description: "Holds $400 until checkout", build: () => ({ merchant: "Marriott", amount: 21840 }) },
  { id: "casino", label: "Blocked merchant", description: "Gambling is blocked before any envelope", build: () => ({ merchant: "Lucky Star Casino", amount: 6000 }) },
];

function predict(state: AppState, req: Parameters<typeof authorize>[1]) {
  // authorize is pure, so run it against a copy and read the outcome without committing anything
  const r = authorize(state, req);
  return r.state.transactions.find((t) => t.id === r.txId);
}

function CardTest() {
  const { state, act, set } = useStore();
  const toast = useToast();
  const [scenario, setScenario] = useState("");
  const [merchant, setMerchant] = useState("Whole Foods Market");
  const [custom, setCustom] = useState("");
  const [mcc, setMcc] = useState("5411");
  const [amount, setAmount] = useState<Cents>(4500);
  const [envelopeId, setEnvelopeId] = useState<string>("auto");
  const [result, setResult] = useState<{ tx: Transaction; before?: Cents; after?: Cents } | null>(null);
  const [log, setLog] = useState<Transaction[]>([]);

  const isCustom = merchant === "__custom";
  const m = isCustom ? undefined : findMerchant(merchant);
  const name = isCustom ? custom.trim() : merchant;
  const code = m?.mcc ?? mcc;
  const req = { merchant: name || "Test merchant", mcc: code, amount, hold: m?.hold, envelopeId: envelopeId === "auto" ? undefined : envelopeId };
  const preview = useMemo(() => (amount > 0 ? predict(state, req) : undefined), [state, amount, name, code, envelopeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggestion = suggestEnvelope(state, req.merchant, code);
  const target = state.envelopes.find((e) => e.id === (req.envelopeId ?? state.nextPurchaseEnvelopeId ?? suggestion.envelope?.id));
  const needed = m?.hold ?? amount;

  const loadScenario = (id: string) => {
    const sc = SCENARIOS.find((x) => x.id === id)!;
    const v = sc.build(state);
    setScenario(id);
    setMerchant(v.merchant);
    setAmount(v.amount);
    setEnvelopeId("auto");
    setResult(null);
  };

  const pickMerchant = (n: string) => {
    setMerchant(n);
    setScenario("");
    setResult(null);
    const mm = findMerchant(n);
    if (mm) setAmount(mm.fixed ?? Math.round((mm.typical[0] + mm.typical[1]) / 200) * 100);
  };

  function pay() {
    const before = target ? available(target) : undefined;
    const r = act((s) => authorize(s, req));
    const tx = r.state.transactions.find((t) => t.id === r.txId);
    if (!tx) return;
    const env = r.state.envelopes.find((e) => e.id === tx.allocations[0]?.envelopeId);
    setResult({ tx, before, after: env ? available(env) : undefined });
    setLog((l) => [tx, ...l].slice(0, 6));
    if (tx.status === "declined") toast({ status: "critical", title: `Declined at ${tx.merchant}`, body: tx.decline?.message });
    else toast({ status: "good", title: `Approved at ${tx.merchant}`, body: `${fmt(tx.status === "pending" ? tx.holdAmount ?? tx.amount : tx.amount)} ${tx.status === "pending" ? "on hold" : "charged"} to ${env?.name}` });
  }

  const scenarioOptions: Option<string>[] = SCENARIOS.map((s) => ({ value: s.id, label: s.label, description: s.description, icon: <Wand2 size={16} className="faint" /> }));
  const chargeOptions: Option<string>[] = [
    { value: "auto", label: "Automatic", description: "Fin picks by merchant code and your corrections", icon: <Sparkles size={16} className="faint" />, group: "Let Fin decide" },
    ...envelopeOptions(state.envelopes).map((o) => ({ ...o, group: `Force an envelope · ${o.group}` })),
  ];

  return (
    <div className="stack" style={{ gap: 14 }}>
      {state.card?.status === "frozen" && (
        <Callout status="warning" title="Your card is frozen" action={<button className="btn btn-outline btn-xs" onClick={() => set({ card: { ...state.card!, status: "active" } })}>Unfreeze</button>}>
          Every test will decline until you unfreeze it.
        </Callout>
      )}
      <Field label="Scenario">
        <Dropdown value={scenario} onChange={loadScenario} options={scenarioOptions} placeholder="Load a ready-made test..." />
      </Field>

      <div className="card" style={{ padding: 16 }}>
        <Field label="Merchant">
          <Dropdown value={merchant} onChange={pickMerchant} options={merchantOptions()} searchable />
        </Field>
        {isCustom && (
          <div className="grid-2">
            <Field label="Name">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Corner deli" />
            </Field>
            <Field label="Merchant code">
              <Dropdown value={mcc} onChange={setMcc} options={mccOptions()} searchable />
            </Field>
          </div>
        )}
        <Field label={m?.hold ? "Final charge after the hold" : "Amount"}>
          <MoneyInput value={amount} onChange={setAmount} large />
        </Field>
        <div className="amount-chips">
          {[500, 2000, 5000, 10000].map((c) => (
            <button key={c} onClick={() => setAmount(c)}>
              {fmt(c).replace(".00", "")}
            </button>
          ))}
          {target && (
            <>
              <button onClick={() => setAmount(Math.max(0, available(target)))}>Exactly what's left</button>
              <button onClick={() => setAmount(Math.max(0, available(target)) + 1000)}>$10 over</button>
            </>
          )}
        </div>
        <Field label="Charge to">
          <Dropdown value={envelopeId} onChange={setEnvelopeId} options={chargeOptions} />
        </Field>

        <div className="preview-box">
          <div className="preview-line">
            <span>Merchant code</span>
            <span>
              {code} {MCC[code]?.label ?? "Unknown"} {MCC[code]?.ambiguous && <StatusPill status="info">Vague</StatusPill>}
            </span>
          </div>
          <div className="preview-line">
            <span>Envelope</span>
            <span className="row gap" style={{ gap: 6 }}>
              {target ? (
                <>
                  <KindBadge kind={target.kind} size={20} /> {target.name}
                </>
              ) : (
                "None matches"
              )}
            </span>
          </div>
          {target && (
            <div className="preview-line">
              <span>Available / needed</span>
              <span className="num">
                {fmt(available(target))} / {fmt(needed)}
                {m?.hold && " hold"}
              </span>
            </div>
          )}
          <div className="preview-line">
            <span>Prediction</span>
            {preview?.status === "declined" ? (
              <StatusPill status="critical">Will decline{preview.decline?.shortBy ? `, short ${fmt(preview.decline.shortBy)}` : ""}</StatusPill>
            ) : preview ? (
              <StatusPill status="good">{m?.hold ? "Will approve as a hold" : "Will approve"}</StatusPill>
            ) : (
              <span className="faint">Enter an amount</span>
            )}
          </div>
        </div>

        <button className="btn btn-primary btn-block btn-lg top-gap" disabled={!name || amount <= 0} onClick={pay}>
          <CreditCard size={17} /> Tap card for {fmt(needed)}
          {m?.hold ? " hold" : ""}
        </button>
      </div>

      {result && <Receipt result={result} onRetry={(tx) => setResult({ tx })} />}

      {log.length > 0 && (
        <div className="card" style={{ padding: "8px 16px" }}>
          <div className="row" style={{ padding: "6px 0" }}>
            <strong className="small">This session</strong>
            <button className="link-btn small" onClick={() => setLog([])}>
              <RotateCcw size={13} /> Clear
            </button>
          </div>
          {log.map((t) => (
            <div key={t.id} className="log-row">
              <MerchantAvatar name={t.merchant} mcc={t.mcc} size={28} />
              <span style={{ flex: 1 }}>{t.merchant}</span>
              <span className="num">{fmt(t.amount)}</span>
              {t.status === "declined" ? <CircleX size={16} className="t-over" /> : <CircleCheck size={16} className="t-good" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Receipt({ result, onRetry }: { result: { tx: Transaction; before?: Cents; after?: Cents }; onRetry: (tx: Transaction) => void }) {
  const { state, act } = useStore();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const { tx } = result;
  const ok = tx.status !== "declined";
  const env = state.envelopes.find((e) => e.id === (tx.allocations[0]?.envelopeId ?? tx.decline?.envelopeId));
  const emergency = emergencyEnvelope(state);
  const shortBy = env ? Math.max(0, (tx.holdAmount ?? tx.amount) - available(env)) : 0;
  const coverable = tx.decline?.code === "insufficient" && !tx.decline.coveredBy && emergency && available(emergency) >= shortBy;

  const steps: { ok: boolean | null; text: string }[] = [
    { ok: null, text: `Card network sends an authorization request: ${tx.merchant}, MCC ${tx.mcc ?? "?"}, ${fmt(tx.holdAmount ?? tx.amount)}` },
    { ok: tx.decline?.code !== "frozen", text: state.card?.status === "frozen" ? "Card is frozen" : "Card is active" },
    { ok: tx.decline?.code !== "blocked_mcc", text: tx.decline?.code === "blocked_mcc" ? "Merchant category is blocked" : "Merchant category allowed" },
    { ok: tx.decline?.code !== "no_envelope" && tx.decline?.code !== "not_spendable", text: env ? `Matched to ${env.name}` : "No envelope matched" },
  ];
  if (!tx.decline || tx.decline.code === "insufficient") {
    steps.push({ ok, text: ok ? `Envelope had enough (${fmt(result.before ?? 0)} available)` : `Envelope short by ${fmt(tx.decline?.shortBy ?? 0)}` });
  }
  const failAt = steps.findIndex((s) => s.ok === false);

  return (
    <div className="receipt">
      <div className={`receipt-head ${ok ? "ok" : "no"}`}>
        <span className="big-icon">{ok ? <Check size={22} strokeWidth={3} /> : <CircleX size={22} />}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{ok ? (tx.status === "pending" ? "Approved as a hold" : "Approved") : "Declined"}</div>
          <div className="small muted">
            {tx.merchant} · {fmt(tx.holdAmount ?? tx.amount)}
          </div>
        </div>
      </div>
      <div className="receipt-body">
        <div className="flow-steps">
          {steps.map((s, i) => (
            <div key={i} className={`flow-step ${failAt >= 0 && i > failAt ? "" : s.ok === false ? "no" : s.ok ? "ok" : ""}`} style={failAt >= 0 && i > failAt ? { opacity: 0.4 } : undefined}>
              <span className="n">{s.ok === false ? "!" : i + 1}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
        {ok && env && result.after !== undefined && (
          <div className="preview-box top-gap">
            <div className="preview-line">
              <span>{env.name}</span>
              <span className="num">
                {fmt(result.before ?? 0)} → <strong>{fmt(result.after)}</strong>
              </span>
            </div>
            {tx.status === "pending" && (
              <div className="preview-line">
                <span>Hold</span>
                <span>
                  Settles to {fmt(tx.amount)} tomorrow on the demo clock
                  <button
                    className="link-btn small"
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                      act((s) => settle(s, tx.id));
                      toast({ status: "good", title: "Hold settled", body: `${fmt((tx.holdAmount ?? 0) - tx.amount)} went back to ${env.name}` });
                    }}
                  >
                    Settle now
                  </button>
                </span>
              </div>
            )}
            {!tx.confirmed && <div className="small muted">The merchant code is vague. Fin will ask you to check the envelope in Activity.</div>}
          </div>
        )}
        {!ok && (
          <>
            <Callout status="critical">{tx.decline?.message}</Callout>
            {tx.decline?.code === "insufficient" && emergency && !tx.decline.coveredBy && (
              <div className="top-gap">
                <Field label={`Cover ${fmt(shortBy)} from ${emergency.name} (${fmt(available(emergency))})`} hint="The note is saved with the purchase so you can look back at it later.">
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? For example: needed gas to get to work" />
                </Field>
                <ErrorText>{error}</ErrorText>
                <button
                  className="btn btn-dark btn-block"
                  disabled={!coverable}
                  onClick={() => {
                    const r = act((s) => coverAndRetry(s, tx.id, note));
                    if (r.error) return setError(r.error);
                    const retry = r.state.transactions.find((t) => t.id === r.txId);
                    toast({ status: "good", title: "Covered and approved", body: `${fmt(shortBy)} came out of your emergency fund` });
                    if (retry) onRetry(retry);
                  }}
                >
                  <ShieldCheck size={16} /> {coverable ? "Cover the gap and retry" : "Emergency fund can't cover it"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- cash

function CashTest() {
  const { state, act } = useStore();
  const toast = useToast();
  const spendable = state.envelopes.filter((e) => e.cardSpendable);
  const [merchant, setMerchant] = useState("Farmers market");
  const [envelopeId, setEnvelopeId] = useState(spendable.find((e) => e.kind === "groceries")?.id ?? spendable[0]?.id ?? "");
  const [amount, setAmount] = useState<Cents>(1800);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const env = state.envelopes.find((e) => e.id === envelopeId);
  const short = env ? amount - available(env) : 0;

  return (
    <div className="card" style={{ padding: 16 }}>
      <Callout status="neutral">
        The card never sees cash. Logging it takes the money out of the envelope like a swipe would, and sends the same amount back to your bank since that's where the cash came from.
      </Callout>
      <Field label="Where">
        <input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
      </Field>
      <Field label="Envelope">
        <Dropdown value={envelopeId} onChange={setEnvelopeId} options={envelopeOptions(spendable)} />
      </Field>
      <Field label="Amount">
        <MoneyInput value={amount} onChange={setAmount} large />
      </Field>
      {short > 0 && env && (
        <>
          <Callout status="warning" title={`${env.name} is short by ${fmt(short)}`}>
            The money's already spent, so the gap comes out of your emergency fund.
          </Callout>
          <Field label="Why?">
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <button
        className="btn btn-primary btn-block btn-lg"
        disabled={!merchant.trim() || amount <= 0}
        onClick={() => {
          const r = act((s) => manualExpense(s, { merchant: merchant.trim(), envelopeId, amount, coverNote: short > 0 ? note : undefined }));
          setError(r.error);
          if (!r.error) toast({ status: "good", title: `Logged ${fmt(amount)} cash`, body: `Out of ${env?.name}` });
        }}
      >
        <Banknote size={17} /> Log cash spending
      </button>
    </div>
  );
}

// ---------- deposit

function DepositTest() {
  const { state, act } = useStore();
  const toast = useToast();
  const [amount, setAmount] = useState<Cents>(194000);
  const [source, setSource] = useState("paycheck");
  const [instant, setInstant] = useState(true);
  const [error, setError] = useState<string>();
  const plan = planFill(state);
  const planTotal = sum(plan.map((p) => p.amount));

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card" style={{ padding: 16 }}>
        <Field label="What's coming in">
          <Dropdown
            value={source}
            onChange={setSource}
            options={[
              { value: "paycheck", label: "Paycheck", description: "Logged as income, counts toward your average", icon: <ArrowDownLeft size={16} className="faint" /> },
              { value: "transfer", label: "Plain transfer", description: "Money moved from your bank, not income", icon: <ArrowDownLeft size={16} className="faint" /> },
            ]}
          />
        </Field>
        <Field label="Amount">
          <MoneyInput value={amount} onChange={setAmount} large />
        </Field>
        <Toggle checked={instant} onChange={setInstant} label="Land it now" sub="Real ACH takes 1 to 3 business days. Off: it lands in 2 days on the demo clock." />
        <ErrorText>{error}</ErrorText>
        <button
          className="btn btn-primary btn-block btn-lg"
          disabled={amount <= 0}
          onClick={() => {
            const r = act((s) => {
              const logged = source === "paycheck" ? { ...s, incomeLog: [{ id: uid(), at: s.now, amount, source: "Test paycheck" }, ...s.incomeLog] } : s;
              return transferIn(logged, amount, "manual", instant);
            });
            setError(r.error);
            if (!r.error) toast({ status: "good", title: instant ? `${fmt(amount)} landed` : `${fmt(amount)} on the way`, body: instant ? "It's in Unassigned" : "Arrives in 2 days" });
          }}
        >
          Deposit {fmt(amount)}
        </button>
      </div>
      {state.unassigned > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="row">
            <strong>Unassigned: {fmt(state.unassigned)}</strong>
          </div>
          <p className="small muted">The card can't spend this until it's in an envelope.</p>
          {plan.length > 0 ? (
            <button
              className="btn btn-outline btn-block"
              onClick={() => {
                act((s) => applyPlan(s, planFill(s)));
                toast({ status: "good", title: `Assigned ${fmt(planTotal)}`, body: `${plan.length} envelopes filled by priority` });
              }}
            >
              Fill {plan.length} envelopes by priority ({fmt(planTotal)})
            </button>
          ) : (
            <p className="small muted">Every envelope is already at its target. Use the Budget page to put the rest somewhere.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- time

function TimeTest() {
  const { state, act } = useStore();
  const toast = useToast();
  const holds = state.transactions.filter((t) => t.status === "pending");
  const transfers = state.transfers.filter((t) => t.status === "pending");
  const upcoming = [...state.scheduledCharges].sort((a, b) => a.nextAt.localeCompare(b.nextAt)).slice(0, 4);
  const monthEnd = addMonths(state.now, 1).slice(0, 8) + "01";

  const jump = (days: number, label: string) => {
    const before = state.notices.length;
    const r = act((s) => advanceDays(s, days));
    const events = r.state.notices.length - before;
    toast({ status: "info", title: `Jumped ${label}`, body: events > 0 ? `${events} thing${events > 1 ? "s" : ""} happened. Check notifications.` : "Nothing new happened." });
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card" style={{ padding: 16 }}>
        <div className="small muted">Demo date</div>
        <div className="big-number" style={{ fontSize: 24, marginBottom: 12 }}>
          {new Date(state.now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
        </div>
        <div className="grid-3">
          <button className="btn btn-outline" onClick={() => jump(1, "1 day")}>
            +1 day
          </button>
          <button className="btn btn-outline" onClick={() => jump(7, "1 week")}>
            <FastForward size={15} /> +1 week
          </button>
          <button className="btn btn-outline" onClick={() => jump(30, "30 days")}>
            +30 days
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "8px 16px" }}>
        <strong className="small" style={{ display: "block", padding: "8px 0" }}>
          Coming up
        </strong>
        {holds.map((t) => (
          <div key={t.id} className="log-row">
            <Hourglass size={16} className="t-warn" />
            <span style={{ flex: 1 }}>
              {t.merchant} hold of {fmt(t.holdAmount ?? t.amount)} settles {t.settleAt ? fmtDate(t.settleAt) : "soon"}
            </span>
            <button className="link-btn small" onClick={() => act((s) => settle(s, t.id))}>
              Settle
            </button>
          </div>
        ))}
        {transfers.map((t) => (
          <div key={t.id} className="log-row">
            <ArrowDownLeft size={16} className="faint" style={t.direction === "out" ? { transform: "rotate(180deg)" } : undefined} />
            <span style={{ flex: 1 }}>
              {fmt(t.amount)} {t.direction === "in" ? "arrives" : "leaves"} {fmtDate(t.arrivesAt)}
            </span>
          </div>
        ))}
        {upcoming.map((c) => (
          <div key={c.merchant} className="log-row">
            <MerchantAvatar name={c.merchant} mcc={c.mcc} size={24} />
            <span style={{ flex: 1 }}>
              {c.merchant} renews {fmtDate(c.nextAt)}
            </span>
            <span className="num">{fmt(c.amount)}</span>
          </div>
        ))}
        <div className="log-row">
          <RotateCcw size={16} className="faint" />
          <span style={{ flex: 1 }}>Monthly envelopes reset {fmtDate(monthEnd)}</span>
        </div>
      </div>
    </div>
  );
}
