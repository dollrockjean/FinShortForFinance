import { useState } from "react";
import { useStore } from "../store";
import { Cadence, Cents, Envelope, EnvelopeKind } from "../types";
import { assign, available, move, need, transferIn } from "../engine/ledger";
import { KIND_LABELS, NOT_CARD_SPENDABLE } from "../engine/catalog";
import { makeEnvelope, monthlyEquivalent, recalcPercentTargets, targetFromPercent } from "../engine/presets";
import { trailingAverage } from "../engine/clock";
import { fmt, fmtDate, sum, uid } from "../engine/util";
import { ErrorText, Field, Modal, MoneyInput, Segmented, Toggle } from "../components/ui";
import { EnvelopeRow } from "../components/rows";
import { AssignPlan } from "./Onboarding";

export default function Budget() {
  const { state } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const income = state.income!;
  const planned = sum(state.envelopes.map(monthlyEquivalent));
  const left = income.monthlyIncome - planned;
  const sorted = [...state.envelopes].sort((a, b) => a.priority - b.priority);

  return (
    <div className="page">
      <h1>Budget</h1>

      {state.unassigned > 0 && (
        <section className="card unassigned-card">
          <div className="row">
            <div>
              <div className="muted small">Unassigned</div>
              <div className="big-number t-warn">{fmt(state.unassigned)}</div>
            </div>
            <p className="small muted narrow">The card can't spend this. Give it a job.</p>
          </div>
          <AssignPlan compact />
        </section>
      )}

      <section className="card">
        <div className="row">
          <strong>Monthly plan</strong>
          <span className="small muted">{income.irregular ? `Based on your ${income.averagingMonths}-month average` : "Based on your take-home pay"}</span>
        </div>
        <div className={`plan-bar ${Math.abs(left) < 100 ? "ok" : left < 0 ? "over" : "warn"}`}>
          <span>
            Planned {fmt(planned)} of {fmt(income.monthlyIncome)}
          </span>
          <strong>{Math.abs(left) < 100 ? "Every dollar has a job" : left > 0 ? `${fmt(left)} not planned yet` : `${fmt(-left)} more than you make`}</strong>
        </div>
      </section>

      <div className="section-head">
        <h2>Envelopes</h2>
        <div className="row gap">
          <button className="link-btn small" onClick={() => setOrdering((v) => !v)}>
            {ordering ? "Done" : "Fill order"}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setAdding(true)}>
            New envelope
          </button>
        </div>
      </div>
      {ordering && <p className="muted small">When money comes in, Fin fills envelopes from the top down. Put needs first.</p>}
      <div className="card list">
        {sorted.map((e, i) =>
          ordering ? (
            <OrderRow key={e.id} e={e} up={sorted[i - 1]} down={sorted[i + 1]} />
          ) : (
            <div key={e.id}>
              <EnvelopeRow e={e} onClick={() => setOpen(e.id)} />
              <div className="env-plan small muted">
                Target {fmt(e.target)}/{e.cadence === "weekly" ? "wk" : "mo"}
                {e.percent !== undefined && ` (${e.percent}% of income)`}
                {need(e) > 0 && <span className="t-warn"> · needs {fmt(need(e))}</span>}
                {e.rollover ? " · rolls over" : " · resets"}
              </div>
            </div>
          )
        )}
      </div>

      <IncomeSection />

      {open && <EnvelopeModal id={open} onClose={() => setOpen(null)} />}
      {adding && <NewEnvelopeModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function OrderRow({ e, up, down }: { e: Envelope; up?: Envelope; down?: Envelope }) {
  const { state, set } = useStore();
  // equal priorities can't swap meaningfully, so renumber first
  const renumber = () => {
    const sorted = [...state.envelopes].sort((a, b) => a.priority - b.priority);
    return state.envelopes.map((x) => ({ ...x, priority: sorted.findIndex((y) => y.id === x.id) * 10 }));
  };
  const moveBy = (dir: -1 | 1) => {
    const envs = renumber();
    const sorted = [...envs].sort((a, b) => a.priority - b.priority);
    const i = sorted.findIndex((x) => x.id === e.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    set({ envelopes: envs.map((x) => (x.id === a.id ? { ...x, priority: b.priority } : x.id === b.id ? { ...x, priority: a.priority } : x)) });
  };
  return (
    <div className="order-row">
      <span>{e.name}</span>
      <div className="row gap">
        <button className="btn btn-outline btn-xs" disabled={!up} onClick={() => moveBy(-1)} aria-label={`Move ${e.name} up`}>
          Up
        </button>
        <button className="btn btn-outline btn-xs" disabled={!down} onClick={() => moveBy(1)} aria-label={`Move ${e.name} down`}>
          Down
        </button>
      </div>
    </div>
  );
}

function EnvelopeModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, act, set } = useStore();
  const e = state.envelopes.find((x) => x.id === id);
  const [tab, setTab] = useState<"money" | "settings">("money");
  const [amount, setAmount] = useState<Cents>(0);
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string>();
  if (!e) return null;
  const others = state.envelopes.filter((x) => x.id !== e.id);
  const isEmergency = e.kind === "emergency";

  const run = (fn: Parameters<typeof act>[0]) => {
    const r = act(fn);
    setError(r.error);
    if (!r.error) setAmount(0);
  };
  const patch = (p: Partial<Envelope>) => set({ envelopes: state.envelopes.map((x) => (x.id === e.id ? { ...x, ...p } : x)) });

  return (
    <Modal title={e.name} onClose={onClose}>
      <Segmented
        label="Section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "money", label: "Money" },
          { value: "settings", label: "Settings" },
        ]}
      />
      {tab === "money" && (
        <div className="top-gap">
          <div className="kv">
            <span>Available</span>
            <strong>{fmt(available(e))}</strong>
            {e.held > 0 && (
              <>
                <span>Pending holds</span>
                <span>{fmt(e.held)}</span>
              </>
            )}
            <span>Spent this {e.cadence === "weekly" ? "week" : "month"}</span>
            <span>{fmt(e.spentThisPeriod)}</span>
            <span>Target</span>
            <span>{fmt(e.target)}</span>
          </div>
          <Field label="Amount">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <div className="grid-2">
            <button className="btn btn-primary" disabled={amount <= 0 || amount > state.unassigned} onClick={() => run((s) => assign(s, e.id, amount))}>
              Add from Unassigned
            </button>
            <button className="btn btn-outline" disabled={amount <= 0 || amount > available(e)} onClick={() => run((s) => assign(s, e.id, -amount))}>
              Send back to Unassigned
            </button>
          </div>
          <p className="muted small">Unassigned has {fmt(state.unassigned)}.</p>
          <div className="split-row top-gap">
            <select value={moveTo} onChange={(ev) => setMoveTo(ev.target.value)} aria-label="Move to envelope">
              <option value="">Move to another envelope...</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button className="btn btn-outline" disabled={!moveTo || amount <= 0} onClick={() => run((s) => move(s, e.id, moveTo, amount))}>
              Move
            </button>
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {tab === "settings" && (
        <div className="top-gap">
          <Field label="Name">
            <input value={e.name} onChange={(ev) => patch({ name: ev.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="Resets every">
              <select
                value={e.cadence}
                onChange={(ev) => {
                  const cadence = ev.target.value as Cadence;
                  patch({ cadence, target: e.percent !== undefined ? targetFromPercent(state.income!.monthlyIncome, e.percent, cadence) : e.target });
                }}
              >
                <option value="monthly">Month</option>
                <option value="weekly">Week (Monday)</option>
              </select>
            </Field>
            {e.percent !== undefined ? (
              <Field label="Percent of income" hint={`${fmt(e.target)} per ${e.cadence === "weekly" ? "week" : "month"}`}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={e.percent}
                  onChange={(ev) => {
                    const pct = Math.max(0, Math.min(100, Number(ev.target.value) || 0));
                    patch({ percent: pct, target: targetFromPercent(state.income!.monthlyIncome, pct, e.cadence) });
                  }}
                />
              </Field>
            ) : (
              <Field label={`Target per ${e.cadence === "weekly" ? "week" : "month"}`}>
                <MoneyInput value={e.target} onChange={(v) => patch({ target: v })} />
              </Field>
            )}
          </div>
          <Toggle
            checked={e.percent !== undefined}
            onChange={(on) =>
              patch(
                on
                  ? { percent: Math.round((monthlyEquivalent(e) / Math.max(1, state.income!.monthlyIncome)) * 1000) / 10 }
                  : { percent: undefined }
              )
            }
            label="Set as a percent of income"
          />
          <Toggle
            checked={e.rollover}
            onChange={(v) => patch({ rollover: v })}
            label="Unspent money rolls over (off: it goes back to Unassigned each period for you to reassign)"
          />
          {!isEmergency && (
            <Toggle checked={e.cardSpendable} onChange={(v) => patch({ cardSpendable: v })} label="The Fin card can spend from this envelope" />
          )}
          {isEmergency ? (
            <p className="muted small top-gap">The emergency fund can't be removed or spent by card. It's where declined purchases get covered from.</p>
          ) : (
            <button
              className="btn btn-danger-outline btn-block top-gap"
              disabled={e.held > 0}
              onClick={() => {
                set({
                  envelopes: state.envelopes.filter((x) => x.id !== e.id),
                  unassigned: state.unassigned + e.balance,
                  nextPurchaseEnvelopeId: state.nextPurchaseEnvelopeId === e.id ? null : state.nextPurchaseEnvelopeId,
                });
                onClose();
              }}
            >
              {e.held > 0 ? "Can't delete while a hold is pending" : `Delete envelope${e.balance > 0 ? ` (${fmt(e.balance)} goes to Unassigned)` : ""}`}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

const KINDS: EnvelopeKind[] = ["groceries", "household", "transport", "dining", "subscriptions", "shopping", "entertainment", "health", "utilities", "housing", "debt", "savings", "custom"];

function NewEnvelopeModal({ onClose }: { onClose: () => void }) {
  const { state, set } = useStore();
  const [kind, setKind] = useState<EnvelopeKind>("custom");
  const [name, setName] = useState("");
  const [target, setTarget] = useState<Cents>(0);
  const [cadence, setCadence] = useState<Cadence>("monthly");
  return (
    <Modal title="New envelope" onClose={onClose}>
      <Field label="Type" hint={NOT_CARD_SPENDABLE.includes(kind) ? "Savings-type: the card can't spend it, money leaves by transfer." : "The card can spend from this. Purchases get matched to it by merchant type."}>
        <select value={kind} onChange={(e) => setKind(e.target.value as EnvelopeKind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={KIND_LABELS[kind]} />
      </Field>
      <div className="grid-2">
        <Field label="Target">
          <MoneyInput value={target} onChange={setTarget} />
        </Field>
        <Field label="Per">
          <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
            <option value="monthly">Month</option>
            <option value="weekly">Week</option>
          </select>
        </Field>
      </div>
      <button
        className="btn btn-primary btn-block"
        onClick={() => {
          const maxP = Math.max(0, ...state.envelopes.map((e) => e.priority));
          set({ envelopes: [...state.envelopes, makeEnvelope(kind, { now: state.now, name: name.trim() || undefined, target, cadence, priority: maxP + 10 })] });
          onClose();
        }}
      >
        Create
      </button>
    </Modal>
  );
}

function IncomeSection() {
  const { state, act, set } = useStore();
  const income = state.income!;
  const [amount, setAmount] = useState<Cents>(0);
  const [source, setSource] = useState("");
  const [moveIn, setMoveIn] = useState(true);
  const [error, setError] = useState<string>();
  const avg = trailingAverage(state.incomeLog, state.now, income.averagingMonths);

  const setIncome = (monthlyIncome: Cents, extra: Partial<typeof income> = {}) =>
    set({ income: { ...income, ...extra, monthlyIncome }, envelopes: recalcPercentTargets(state.envelopes, monthlyIncome) });

  return (
    <>
      <div className="section-head">
        <h2>Income</h2>
      </div>
      <div className="card">
        <Toggle
          checked={income.irregular}
          onChange={(on) => (on ? setIncome(avg.average || income.monthlyIncome, { irregular: true }) : set({ income: { ...income, irregular: false } }))}
          label="Irregular income mode"
        />
        {!income.irregular ? (
          <Field label="Monthly take-home" hint="Percent-based envelopes recalculate when this changes.">
            <MoneyInput value={income.monthlyIncome} onChange={(v) => setIncome(v)} />
          </Field>
        ) : (
          <>
            <p className="small muted top-gap">
              No fixed monthly number. Your plan runs on what actually came in, averaged. Log each paycheck when it lands, then assign it top to bottom by fill order until it's spoken for.
            </p>
            <div className="row top-gap">
              <Segmented
                label="Average over"
                value={String(income.averagingMonths) as "3" | "6"}
                onChange={(v) => set({ income: { ...income, averagingMonths: Number(v) as 3 | 6 } })}
                options={[
                  { value: "3", label: "3 months" },
                  { value: "6", label: "6 months" },
                ]}
              />
              <div className="right">
                <div className="muted small">Average</div>
                <strong>{fmt(avg.average)}/mo</strong>
              </div>
            </div>
            {avg.average !== income.monthlyIncome && avg.average > 0 && (
              <button className="btn btn-outline btn-block top-gap" onClick={() => setIncome(avg.average)}>
                Budget off {fmt(avg.average)} instead of {fmt(income.monthlyIncome)}
              </button>
            )}
          </>
        )}

        <div className="divider">Log a paycheck</div>
        <div className="grid-2">
          <Field label="Amount">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="From">
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Client, employer, tips" />
          </Field>
        </div>
        {state.bank && <Toggle checked={moveIn} onChange={setMoveIn} label={`Also pull it into Fin from ${state.bank.institution} (lands in 2 days)`} />}
        <ErrorText>{error}</ErrorText>
        <button
          className="btn btn-primary btn-block top-gap"
          disabled={amount <= 0}
          onClick={() => {
            const entry = { id: uid(), at: state.now, amount, source: source.trim() || "Paycheck" };
            const r = act((s) => {
              const logged = { ...s, incomeLog: [entry, ...s.incomeLog] };
              return moveIn && s.bank ? transferIn(logged, amount, "manual") : logged;
            });
            setError(r.error);
            if (!r.error) {
              setAmount(0);
              setSource("");
            }
          }}
        >
          Log {amount > 0 ? fmt(amount) : "paycheck"}
        </button>
        {state.incomeLog.length > 0 && (
          <div className="list top-gap">
            {state.incomeLog.slice(0, 6).map((i) => (
              <div key={i.id} className="row small">
                <span>
                  {fmtDate(i.at)} · {i.source}
                </span>
                <span>{fmt(i.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
