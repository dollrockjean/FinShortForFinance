import { useState } from "react";
import {
  ArrowDownUp,
  ArrowRightLeft,
  ArrowUp,
  ArrowDown,
  Banknote,
  CalendarDays,
  CircleMinus,
  CirclePlus,
  Inbox,
  ListOrdered,
  Pencil,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useStore } from "../store";
import { Cadence, Cents, Envelope, EnvelopeKind } from "../types";
import { assign, available, move, need, transferIn, usage } from "../engine/ledger";
import { KIND_LABELS, NOT_CARD_SPENDABLE } from "../engine/catalog";
import { makeEnvelope, monthlyEquivalent, recalcPercentTargets, targetFromPercent } from "../engine/presets";
import { trailingAverage } from "../engine/clock";
import { fmt, fmtDate, sum, uid } from "../engine/util";
import { Callout, Dropdown, ErrorText, Field, Menu, Modal, MoneyInput, Option, Progress, Segmented, StatusPill, Toggle, toneFor, useToast } from "../components/ui";
import { GROUP_LABEL, KIND_META, KindBadge } from "../components/meta";
import { envStatus } from "../components/rows";
import { envelopeOptions } from "../components/options";
import { AssignPlan } from "./Onboarding";

type Sort = "order" | "name" | "left" | "used";

export default function Budget() {
  const { state } = useStore();
  const [open, setOpen] = useState<{ id: string; tab: ModalTab } | null>(null);
  const [adding, setAdding] = useState(false);
  const [sort, setSort] = useState<Sort>("order");
  const [grouping, setGrouping] = useState<"type" | "none">("type");
  const [ordering, setOrdering] = useState(false);
  const income = state.income!;
  const planned = sum(state.envelopes.map(monthlyEquivalent));
  const left = income.monthlyIncome - planned;

  const sorted = [...state.envelopes].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "left") return available(a) - available(b);
    if (sort === "used") return usage(b) - usage(a);
    return a.priority - b.priority;
  });
  const groups =
    grouping === "type"
      ? (["needs", "wants", "saving"] as const).map((g) => ({ key: g, label: GROUP_LABEL[g], items: sorted.filter((e) => KIND_META[e.kind].group === g) })).filter((g) => g.items.length)
      : [{ key: "all", label: "", items: sorted }];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stat-row">
        <div className="stat">
          <div className="label">
            <TrendingUp size={14} /> Monthly income
          </div>
          <div className="value">{fmt(income.monthlyIncome)}</div>
          <div className="sub">{income.irregular ? `${income.averagingMonths}-month average` : "Take-home pay"}</div>
        </div>
        <div className="stat">
          <div className="label">
            <Target size={14} /> Planned
          </div>
          <div className="value">{fmt(planned)}</div>
          <div className="sub">{state.envelopes.length} envelopes</div>
        </div>
        <div className="stat">
          <div className="label">
            <CalendarDays size={14} /> Left to plan
          </div>
          <div className={`value ${Math.abs(left) < 100 ? "t-good" : left < 0 ? "t-over" : "t-warn"}`}>{Math.abs(left) < 100 ? fmt(0) : fmt(left)}</div>
          <div className="sub">{Math.abs(left) < 100 ? "Every dollar has a job" : left > 0 ? "Not planned yet" : "More than you make"}</div>
        </div>
        <div className="stat">
          <div className="label">
            <Inbox size={14} /> Unassigned
          </div>
          <div className={`value ${state.unassigned > 0 ? "t-warn" : ""}`}>{fmt(state.unassigned)}</div>
          <div className="sub">Cash with no envelope</div>
        </div>
      </div>

      {state.unassigned > 0 && (
        <section className="card unassigned-card">
          <div className="card-head">
            <h2>
              <Inbox size={17} /> Give {fmt(state.unassigned)} a job
            </h2>
            <StatusPill status="warning">Card can't spend this</StatusPill>
          </div>
          <AssignPlan compact />
        </section>
      )}

      <div className="card flush">
        <div className="toolbar" style={{ padding: "8px 16px 0", marginBottom: 10 }}>
          <h2 style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <Wallet size={17} className="faint" /> Envelopes
          </h2>
          {!ordering && (
            <>
              <Dropdown
                compact
                ariaLabel="Group by"
                value={grouping}
                onChange={setGrouping}
                options={[
                  { value: "type", label: "Group by type" },
                  { value: "none", label: "No grouping" },
                ]}
              />
              <Dropdown
                compact
                ariaLabel="Sort"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "order", label: "Fill order", icon: <ListOrdered size={15} className="faint" /> },
                  { value: "name", label: "Name", icon: <ArrowDownUp size={15} className="faint" /> },
                  { value: "left", label: "Least left", icon: <ArrowDown size={15} className="faint" /> },
                  { value: "used", label: "Most used", icon: <ArrowUp size={15} className="faint" /> },
                ]}
              />
            </>
          )}
          <button className={`btn btn-sm ${ordering ? "btn-primary" : "btn-outline"}`} onClick={() => setOrdering((v) => !v)}>
            <ListOrdered size={15} /> {ordering ? "Done" : "Edit fill order"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={15} /> New envelope
          </button>
        </div>
        {ordering ? (
          <>
            <p className="small muted" style={{ padding: "0 16px" }}>
              New money fills envelopes from the top down, one target at a time. Needs go first.
            </p>
            {[...state.envelopes]
              .sort((a, b) => a.priority - b.priority)
              .map((e, i, arr) => (
                <OrderRow key={e.id} e={e} index={i} up={arr[i - 1]} down={arr[i + 1]} />
              ))}
          </>
        ) : (
          <div className="env-table">
            <div className="env-table-head">
              <span>Envelope</span>
              <span>Target</span>
              <span>This period</span>
              <span className="right">Available</span>
              <span />
            </div>
            {groups.map((g) => (
              <div key={g.key}>
                {g.label && (
                  <div className="group-row">
                    <span>{g.label}</span>
                    <span className="num">{fmt(sum(g.items.map(available)))} available</span>
                  </div>
                )}
                {g.items.map((e) => (
                  <EnvelopeLine key={e.id} e={e} onOpen={(tab) => setOpen({ id: e.id, tab })} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <IncomeSection />

      {open && <EnvelopeModal id={open.id} initialTab={open.tab} onClose={() => setOpen(null)} />}
      {adding && <NewEnvelopeModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function EnvelopeLine({ e, onOpen }: { e: Envelope; onOpen: (tab: ModalTab) => void }) {
  const u = usage(e);
  const st = envStatus(e);
  const n = need(e);
  return (
    <div className="env-line" onClick={() => onOpen("money")} role="button" tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && onOpen("money")}>
      <div className="env-line-name">
        <KindBadge kind={e.kind} size={34} />
        <div style={{ minWidth: 0 }}>
          <strong>{e.name}</strong>
          <span className="xs muted">
            {e.cadence === "weekly" ? "Weekly" : "Monthly"} · {e.rollover ? "rolls over" : "resets"}
            {!e.cardSpendable && " · no card"}
          </span>
        </div>
      </div>
      <div className="small">
        <div className="num">{fmt(e.target)}</div>
        <div className="xs muted">{e.percent !== undefined ? `${e.percent}% of income` : e.cadence === "weekly" ? "per week" : "per month"}</div>
      </div>
      <div>
        {e.cardSpendable ? <Progress value={u} tone={toneFor(u)} /> : <Progress value={e.target ? e.fundedThisPeriod / e.target : 1} tone="ok" />}
        <div className="xs muted" style={{ marginTop: 5, display: "flex", justifyContent: "space-between", gap: 6 }}>
          <span>{e.cardSpendable ? `${fmt(e.spentThisPeriod)} spent` : `${fmt(e.fundedThisPeriod)} added`}</span>
          {n > 0 ? <span className="t-warn">needs {fmt(n)}</span> : e.held > 0 ? <span className="t-warn">{fmt(e.held)} held</span> : null}
        </div>
      </div>
      <div className="right">
        <div className="num" style={{ fontWeight: 600 }}>
          {fmt(available(e))}
        </div>
        <StatusPill status={st.status}>{st.label}</StatusPill>
      </div>
      <div onClick={(ev) => ev.stopPropagation()}>
        <Menu
          label={`${e.name} actions`}
          items={[
            { label: "Add money", icon: <CirclePlus size={16} />, onClick: () => onOpen("money") },
            { label: "Move money", icon: <ArrowRightLeft size={16} />, onClick: () => onOpen("move") },
            { label: "Edit envelope", icon: <Pencil size={16} />, onClick: () => onOpen("settings") },
          ]}
        />
      </div>
    </div>
  );
}

function OrderRow({ e, index, up, down }: { e: Envelope; index: number; up?: Envelope; down?: Envelope }) {
  const { state, set } = useStore();
  const moveBy = (dir: -1 | 1) => {
    const sorted = [...state.envelopes].sort((a, b) => a.priority - b.priority);
    const envs = state.envelopes.map((x) => ({ ...x, priority: sorted.findIndex((y) => y.id === x.id) * 10 }));
    const order = [...envs].sort((a, b) => a.priority - b.priority);
    const i = order.findIndex((x) => x.id === e.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const a = order[i];
    const b = order[j];
    set({ envelopes: envs.map((x) => (x.id === a.id ? { ...x, priority: b.priority } : x.id === b.id ? { ...x, priority: a.priority } : x)) });
  };
  return (
    <div className="env-line order-line">
      <span className="faint num" style={{ fontWeight: 600 }}>
        {index + 1}
      </span>
      <div className="env-line-name">
        <KindBadge kind={e.kind} size={30} />
        <div>
          <strong>{e.name}</strong>
          <span className="xs muted">needs {fmt(need(e))} this period</span>
        </div>
      </div>
      <div className="row gap" style={{ gap: 4 }}>
        <button className="icon-btn" disabled={!up} onClick={() => moveBy(-1)} aria-label={`Move ${e.name} up`}>
          <ArrowUp size={16} />
        </button>
        <button className="icon-btn" disabled={!down} onClick={() => moveBy(1)} aria-label={`Move ${e.name} down`}>
          <ArrowDown size={16} />
        </button>
      </div>
    </div>
  );
}

type ModalTab = "money" | "move" | "settings";

export function EnvelopeModal({ id, onClose, initialTab = "money" }: { id: string; onClose: () => void; initialTab?: ModalTab }) {
  const { state, act, set } = useStore();
  const toast = useToast();
  const e = state.envelopes.find((x) => x.id === id);
  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [amount, setAmount] = useState<Cents>(0);
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string>();
  if (!e) return null;
  const others = state.envelopes.filter((x) => x.id !== e.id);
  const isEmergency = e.kind === "emergency";
  const st = envStatus(e);

  const run = (fn: Parameters<typeof act>[0], msg: string) => {
    const r = act(fn);
    setError(r.error);
    if (!r.error) {
      setAmount(0);
      toast({ status: "good", title: msg });
    }
  };
  const patch = (p: Partial<Envelope>) => set({ envelopes: state.envelopes.map((x) => (x.id === e.id ? { ...x, ...p } : x)) });

  return (
    <Modal title={e.name} onClose={onClose} icon={<KindBadge kind={e.kind} size={38} />}>
      <div className="row" style={{ marginBottom: 14 }}>
        <div>
          <div className="big-number">{fmt(available(e))}</div>
          <div className="xs muted">{e.cardSpendable ? "available to spend" : "saved"}</div>
        </div>
        <StatusPill status={st.status}>{st.label}</StatusPill>
      </div>
      <Segmented
        full
        label="Section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "money", label: "Add", icon: <CirclePlus size={14} /> },
          { value: "move", label: "Move", icon: <ArrowRightLeft size={14} /> },
          { value: "settings", label: "Edit", icon: <Pencil size={14} /> },
        ]}
      />
      {tab === "money" && (
        <div className="top-gap">
          <div className="kv" style={{ marginBottom: 14 }}>
            <span>Spent this {e.cadence === "weekly" ? "week" : "month"}</span>
            <span className="num">{fmt(e.spentThisPeriod)}</span>
            {e.held > 0 && (
              <>
                <span>Pending holds</span>
                <span className="num t-warn">{fmt(e.held)}</span>
              </>
            )}
            <span>Target</span>
            <span className="num">{fmt(e.target)}</span>
            <span>Still needs</span>
            <span className="num">{fmt(need(e))}</span>
          </div>
          <Field label="Amount" hint={`Unassigned has ${fmt(state.unassigned)}.`}>
            <MoneyInput value={amount} onChange={setAmount} large />
          </Field>
          <div className="amount-chips" style={{ marginTop: -4, marginBottom: 12 }}>
            {need(e) > 0 && <button onClick={() => setAmount(Math.min(need(e), state.unassigned))}>Fill to target</button>}
            {state.unassigned > 0 && <button onClick={() => setAmount(state.unassigned)}>All of Unassigned</button>}
            {available(e) > 0 && <button onClick={() => setAmount(available(e))}>Everything in here</button>}
          </div>
          <div className="grid-2">
            <button className="btn btn-primary" disabled={amount <= 0 || amount > state.unassigned} onClick={() => run((s) => assign(s, e.id, amount), `Added ${fmt(amount)} to ${e.name}`)}>
              <CirclePlus size={16} /> Add
            </button>
            <button className="btn btn-outline" disabled={amount <= 0 || amount > available(e)} onClick={() => run((s) => assign(s, e.id, -amount), `Sent ${fmt(amount)} back to Unassigned`)}>
              <CircleMinus size={16} /> Take out
            </button>
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {tab === "move" && (
        <div className="top-gap">
          <Field label="Move to">
            <Dropdown value={moveTo} onChange={setMoveTo} options={envelopeOptions(others)} placeholder="Pick an envelope" />
          </Field>
          <Field label="Amount" hint={`${e.name} has ${fmt(available(e))} free.`}>
            <MoneyInput value={amount} onChange={setAmount} large />
          </Field>
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-primary btn-block" disabled={!moveTo || amount <= 0} onClick={() => run((s) => move(s, e.id, moveTo, amount), `Moved ${fmt(amount)}`)}>
            <ArrowRightLeft size={16} /> Move {amount > 0 ? fmt(amount) : "money"}
          </button>
        </div>
      )}
      {tab === "settings" && (
        <div className="top-gap">
          <div className="grid-2">
            <Field label="Name">
              <input value={e.name} onChange={(ev) => patch({ name: ev.target.value })} />
            </Field>
            <Field label="Type">
              <Dropdown value={e.kind} onChange={(k) => !isEmergency && patch({ kind: k })} options={kindOptions(isEmergency)} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Resets every">
              <Dropdown
                value={e.cadence}
                onChange={(cadence: Cadence) => patch({ cadence, target: e.percent !== undefined ? targetFromPercent(state.income!.monthlyIncome, e.percent, cadence) : e.target })}
                options={[
                  { value: "monthly", label: "Month", description: "Resets on the 1st" },
                  { value: "weekly", label: "Week", description: "Resets Monday, tops itself up" },
                ]}
              />
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
            onChange={(on) => patch(on ? { percent: Math.round((monthlyEquivalent(e) / Math.max(1, state.income!.monthlyIncome)) * 1000) / 10 } : { percent: undefined })}
            label="Percent of income"
            sub="The target follows your income when it changes"
          />
          <Toggle checked={e.rollover} onChange={(v) => patch({ rollover: v })} label="Roll over unspent money" sub="Off: leftovers go back to Unassigned each period for you to reassign" />
          {!isEmergency && <Toggle checked={e.cardSpendable} onChange={(v) => patch({ cardSpendable: v })} label="Card can spend from this" sub="Off for savings, debt and bills paid by transfer" />}
          {isEmergency ? (
            <Callout status="neutral">The emergency fund can't be deleted or spent by card. Declined purchases get covered from here.</Callout>
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
                toast({ status: "info", title: `Deleted ${e.name}`, body: e.balance > 0 ? `${fmt(e.balance)} went back to Unassigned` : undefined });
                onClose();
              }}
            >
              <Trash2 size={16} /> {e.held > 0 ? "Can't delete while a hold is pending" : `Delete envelope${e.balance > 0 ? ` (${fmt(e.balance)} goes to Unassigned)` : ""}`}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

const KINDS: EnvelopeKind[] = ["groceries", "household", "transport", "dining", "subscriptions", "shopping", "entertainment", "health", "utilities", "housing", "debt", "savings", "custom"];

function kindOptions(includeEmergency = false): Option<EnvelopeKind>[] {
  const list = includeEmergency ? (["emergency"] as EnvelopeKind[]) : KINDS;
  return list.map((k) => ({
    value: k,
    label: KIND_LABELS[k],
    icon: <KindBadge kind={k} size={30} />,
    group: GROUP_LABEL[KIND_META[k].group],
    description: NOT_CARD_SPENDABLE.includes(k) ? "Paid by transfer, not card" : undefined,
  }));
}

function NewEnvelopeModal({ onClose }: { onClose: () => void }) {
  const { state, set } = useStore();
  const toast = useToast();
  const [kind, setKind] = useState<EnvelopeKind>("groceries");
  const [name, setName] = useState("");
  const [target, setTarget] = useState<Cents>(0);
  const [cadence, setCadence] = useState<Cadence>("monthly");
  return (
    <Modal title="New envelope" onClose={onClose} icon={<KindBadge kind={kind} size={38} />}>
      <Field label="Type" hint={NOT_CARD_SPENDABLE.includes(kind) ? "The card can't spend this type. Money leaves by transfer." : "The card spends from this. Purchases match by merchant code."}>
        <Dropdown value={kind} onChange={setKind} options={kindOptions()} />
      </Field>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={KIND_LABELS[kind]} />
      </Field>
      <div className="grid-2">
        <Field label="Target">
          <MoneyInput value={target} onChange={setTarget} />
        </Field>
        <Field label="Per">
          <Dropdown
            value={cadence}
            onChange={setCadence}
            options={[
              { value: "monthly", label: "Month" },
              { value: "weekly", label: "Week" },
            ]}
          />
        </Field>
      </div>
      <button
        className="btn btn-primary btn-block"
        onClick={() => {
          const maxP = Math.max(0, ...state.envelopes.map((e) => e.priority));
          set({ envelopes: [...state.envelopes, makeEnvelope(kind, { now: state.now, name: name.trim() || undefined, target, cadence, priority: maxP + 10 })] });
          toast({ status: "good", title: `Created ${name.trim() || KIND_LABELS[kind]}` });
          onClose();
        }}
      >
        <Plus size={16} /> Create envelope
      </button>
    </Modal>
  );
}

function IncomeSection() {
  const { state, act, set } = useStore();
  const toast = useToast();
  const income = state.income!;
  const [amount, setAmount] = useState<Cents>(0);
  const [source, setSource] = useState("");
  const [moveIn, setMoveIn] = useState(true);
  const [error, setError] = useState<string>();
  const avg = trailingAverage(state.incomeLog, state.now, income.averagingMonths);

  const setIncome = (monthlyIncome: Cents, extra: Partial<typeof income> = {}) =>
    set({ income: { ...income, ...extra, monthlyIncome }, envelopes: recalcPercentTargets(state.envelopes, monthlyIncome) });

  return (
    <div className="page-grid">
      <div>
        <div className="card">
          <div className="card-head">
            <h2>
              <TrendingUp size={17} /> Income
            </h2>
            <Segmented
              label="Income mode"
              value={income.irregular ? "irregular" : "steady"}
              onChange={(v) => (v === "irregular" ? setIncome(avg.average || income.monthlyIncome, { irregular: true }) : set({ income: { ...income, irregular: false } }))}
              options={[
                { value: "steady", label: "Steady" },
                { value: "irregular", label: "Irregular" },
              ]}
            />
          </div>
          {!income.irregular ? (
            <Field label="Monthly take-home" hint="Envelopes set as a percent of income recalculate when this changes.">
              <MoneyInput value={income.monthlyIncome} onChange={(v) => setIncome(v)} />
            </Field>
          ) : (
            <>
              <p className="small muted">
                No fixed number. The plan runs on what actually came in, averaged. Log each paycheck when it lands, then fill envelopes from the top of your fill order down until it's spoken for.
              </p>
              <div className="row">
                <Dropdown
                  compact
                  ariaLabel="Average over"
                  value={String(income.averagingMonths) as "3" | "6"}
                  onChange={(v) => set({ income: { ...income, averagingMonths: Number(v) as 3 | 6 } })}
                  options={[
                    { value: "3", label: "3-month average" },
                    { value: "6", label: "6-month average" },
                  ]}
                />
                <div className="right">
                  <div className="big-number" style={{ fontSize: 22 }}>{fmt(avg.average)}</div>
                  <div className="xs muted">per month</div>
                </div>
              </div>
              {avg.average !== income.monthlyIncome && avg.average > 0 && (
                <button className="btn btn-outline btn-block top-gap" onClick={() => setIncome(avg.average)}>
                  Budget off {fmt(avg.average)} instead of {fmt(income.monthlyIncome)}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div>
        <div className="card">
          <div className="card-head">
            <h2>
              <Banknote size={17} /> Log a paycheck
            </h2>
          </div>
          <div className="grid-2">
            <Field label="Amount">
              <MoneyInput value={amount} onChange={setAmount} />
            </Field>
            <Field label="From">
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Employer, client, tips" />
            </Field>
          </div>
          {state.bank && <Toggle checked={moveIn} onChange={setMoveIn} label={`Pull it in from ${state.bank.institution}`} sub="Lands in Unassigned in 2 days" />}
          <ErrorText>{error}</ErrorText>
          <button
            className="btn btn-primary btn-block"
            disabled={amount <= 0}
            onClick={() => {
              const entry = { id: uid(), at: state.now, amount, source: source.trim() || "Paycheck" };
              const r = act((s) => {
                const logged = { ...s, incomeLog: [entry, ...s.incomeLog] };
                return moveIn && s.bank ? transferIn(logged, amount, "manual") : logged;
              });
              setError(r.error);
              if (!r.error) {
                toast({ status: "good", title: `Logged ${fmt(amount)}`, body: moveIn ? "Transfer started" : undefined });
                setAmount(0);
                setSource("");
              }
            }}
          >
            Log {amount > 0 ? fmt(amount) : "paycheck"}
          </button>
          {state.incomeLog.length > 0 && (
            <div className="list top-gap">
              {state.incomeLog.slice(0, 5).map((i) => (
                <div key={i.id} className="row small list-row" style={{ padding: "7px 0" }}>
                  <span className="muted">
                    {fmtDate(i.at)} · {i.source}
                  </span>
                  <span className="num">{fmt(i.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
