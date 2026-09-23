import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Baby, Check, Layers, Leaf, Lock, Minus, PenLine, PiggyBank, Plus, RotateCcw, Scale, Snowflake, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useStore } from "../store";
import { Cadence, Cents, EnvelopeKind, Goal, IncomeProfile, PayFrequency, PresetId } from "../types";
import { KIND_LABELS, NOT_CARD_SPENDABLE } from "../engine/catalog";
import { PRESETS, buildEnvelopes, makeEnvelope, monthlyEquivalent, recommendedPreset } from "../engine/presets";
import { resetCategories } from "../engine/ledger";
import { trailingAverage } from "../engine/clock";
import { fmt, sum, uid } from "../engine/util";
import { Callout, Dropdown, ErrorText, Field, Modal, MoneyInput, Option, Segmented, Toggle, useToast } from "../components/ui";
import { GROUP_LABEL, KIND_META, KindBadge } from "../components/meta";

const PER_MONTH: Record<PayFrequency, number> = { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1 };

const PRESET_ICONS: Record<PresetId, LucideIcon> = {
  starter: Snowflake,
  balanced: Scale,
  percent: Layers,
  lean: Leaf,
  saver: PiggyBank,
  family: Baby,
  custom: PenLine,
};

export interface DraftRow {
  id: string;
  kind: EnvelopeKind;
  name: string;
  target: Cents;
  cadence: Cadence;
  percent?: number;
}

const ALL_KINDS: EnvelopeKind[] = ["housing", "utilities", "groceries", "transport", "health", "household", "dining", "subscriptions", "shopping", "entertainment", "custom", "debt", "savings", "emergency"];

function kindOptions(): Option<EnvelopeKind>[] {
  return ALL_KINDS.filter((k) => k !== "emergency").map((k) => ({
    value: k,
    label: KIND_LABELS[k],
    icon: <KindBadge kind={k} size={28} />,
    group: GROUP_LABEL[KIND_META[k].group],
    description: NOT_CARD_SPENDABLE.includes(k) ? "Paid by transfer, not card" : undefined,
  }));
}

const emergencyRow = (): DraftRow => ({ id: uid(), kind: "emergency", name: KIND_LABELS.emergency, target: 0, cadence: "monthly" });

// ---------- the editable list both paths share

export function DraftEditor({ rows, setRows, income }: { rows: DraftRow[]; setRows: (r: DraftRow[]) => void; income: Cents }) {
  const planned = sum(rows.map(monthlyEquivalent));
  const left = income - planned;
  const update = (id: string, patch: Partial<DraftRow>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch, percent: patch.target !== undefined ? undefined : r.percent } : r)));
  const missing = ALL_KINDS.filter((k) => k !== "custom" && k !== "emergency" && !rows.some((r) => r.kind === k));

  return (
    <div>
      {income > 0 && (
        <div className={`plan-bar ${Math.abs(left) < 100 ? "ok" : left < 0 ? "over" : "warn"}`}>
          <span>
            Planned {fmt(planned)} of {fmt(income)} a month
          </span>
          <strong>{Math.abs(left) < 100 ? <><Check size={15} /> Every dollar has a job</> : left > 0 ? `${fmt(left)} not planned` : <><TriangleAlert size={15} /> {fmt(-left)} over</>}</strong>
        </div>
      )}
      <div className="draft-list">
        {rows.map((r) => (
          <div key={r.id} className="draft-row">
            {r.kind === "emergency" ? (
              <span className="draft-type">
                <KindBadge kind="emergency" size={30} />
              </span>
            ) : (
              <span className="draft-type">
                <Dropdown iconOnly ariaLabel={`Type for ${r.name}`} value={r.kind} onChange={(k) => update(r.id, { kind: k, name: r.name === KIND_LABELS[r.kind] ? KIND_LABELS[k] : r.name })} options={kindOptions()} />
              </span>
            )}
            <input value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} aria-label="Category name" placeholder="Name" />
            <MoneyInput value={r.target} onChange={(v) => update(r.id, { target: v })} ariaLabel={`${r.name} limit`} />
            <Dropdown
              ariaLabel={`${r.name} period`}
              value={r.cadence}
              onChange={(v: Cadence) => update(r.id, { cadence: v })}
              options={[
                { value: "monthly", label: "a month" },
                { value: "weekly", label: "a week" },
              ]}
            />
            {r.kind === "emergency" ? (
              <span className="icon-btn" title="Every setup keeps an emergency fund. Declined purchases get covered from it." aria-label="Required">
                <Lock size={15} />
              </span>
            ) : (
              <button className="icon-btn" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} aria-label={`Remove ${r.name}`}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="quick-add">
        <span className="xs muted">Add:</span>
        {missing.map((k) => (
          <button key={k} className="chip-btn" onClick={() => setRows([...rows.filter((x) => x.kind !== "emergency"), { id: uid(), kind: k, name: KIND_LABELS[k], target: 0, cadence: k === "dining" ? "weekly" : "monthly" }, ...rows.filter((x) => x.kind === "emergency")])}>
            <KindBadge kind={k} size={20} /> {KIND_LABELS[k]}
          </button>
        ))}
        <button className="chip-btn" onClick={() => setRows([...rows.filter((x) => x.kind !== "emergency"), { id: uid(), kind: "custom", name: "", target: 0, cadence: "monthly" }, ...rows.filter((x) => x.kind === "emergency")])}>
          <Plus size={14} /> Something else
        </button>
      </div>
    </div>
  );
}

// ---------- setup screen

export default function CategorySetup() {
  const { state, set } = useStore();
  const toast = useToast();
  const [mode, setMode] = useState<"choose" | "profile" | "manual">("choose");

  // profile inputs, prefilled from what Fin already knows
  const inc = state.income;
  const [irregular, setIrregular] = useState(inc?.irregular ?? false);
  const [frequency, setFrequency] = useState<PayFrequency>(inc?.frequency ?? "biweekly");
  const [perCheck, setPerCheck] = useState<Cents>(inc ? Math.round(inc.monthlyIncome / PER_MONTH[inc.frequency]) : 0);
  const avg = trailingAverage(state.incomeLog, state.now, inc?.averagingMonths ?? 3);
  const [avgIncome, setAvgIncome] = useState<Cents>(avg.average || inc?.monthlyIncome || 0);
  const [household, setHousehold] = useState(inc?.householdSize ?? 1);
  const [debt, setDebt] = useState<Cents>(inc?.debtTotal ?? 0);
  const [goal, setGoal] = useState<Goal>(inc?.goal ?? "discipline");
  const monthly = irregular ? avgIncome : Math.round(perCheck * PER_MONTH[frequency]);
  const profile: IncomeProfile = useMemo(
    () => ({ frequency, monthlyIncome: monthly, irregular, averagingMonths: inc?.averagingMonths ?? 3, debtTotal: debt, householdSize: household, goal }),
    [frequency, monthly, irregular, inc?.averagingMonths, debt, household, goal]
  );
  const rec = recommendedPreset(profile);
  const [preset, setPreset] = useState<PresetId>(rec);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [manualIncome, setManualIncome] = useState<Cents>(inc?.monthlyIncome ?? 0);
  const [manualRows, setManualRows] = useState<DraftRow[]>([emergencyRow()]);
  const [error, setError] = useState<string>();

  // rebuild the preview whenever the answers or the profile change
  useEffect(() => {
    if (mode !== "profile") return;
    setRows(
      buildEnvelopes(preset, profile, state.now).map((e) => ({ id: uid(), kind: e.kind, name: e.name, target: e.target, cadence: e.cadence, percent: e.percent }))
    );
  }, [mode, preset, profile, state.now]);

  function apply(list: DraftRow[], income: IncomeProfile, presetId: PresetId) {
    if (list.some((r) => !r.name.trim())) return setError("Every category needs a name.");
    const envelopes = list.map((r, i) =>
      makeEnvelope(r.kind, { now: state.now, name: r.name.trim(), target: r.target, cadence: r.cadence, percent: r.percent, priority: r.kind === "emergency" ? 45 : i * 10 })
    );
    set({ envelopes, income, preset: presetId });
    toast({ status: "good", title: `Created ${envelopes.length} categories`, body: state.unassigned > 0 ? `Now give ${fmt(state.unassigned)} a job` : undefined });
  }

  if (mode === "choose") {
    return (
      <div className="card setup">
        <div className="setup-head">
          <span className="step-icon">
            <Sparkles size={21} />
          </span>
          <div>
            <h2 style={{ fontSize: 20 }}>Set up your categories</h2>
            <p className="muted small" style={{ margin: 0 }}>
              You have no categories right now, so the card can't spend anything.
              {state.unassigned > 0 && ` ${fmt(state.unassigned)} is waiting in Unassigned.`}
            </p>
          </div>
        </div>
        <div className="setup-choices">
          <button className="setup-choice" onClick={() => setMode("profile")}>
            <span className="quick-icon">
              <Scale size={18} />
            </span>
            <strong>Use a profile</strong>
            <span className="small muted">Tell Fin your income and a few basics. It builds a full plan you can edit line by line before anything is created.</span>
            <span className="setup-tags">
              {PRESETS.filter((p) => p.id !== "custom").map((p) => (
                <span key={p.id} className="chip">
                  {p.label}
                </span>
              ))}
            </span>
          </button>
          <button className="setup-choice" onClick={() => setMode("manual")}>
            <span className="quick-icon">
              <PenLine size={18} />
            </span>
            <strong>Build my own</strong>
            <span className="small muted">Start blank. Add the categories you want, name them whatever you like, and set each limit yourself.</span>
            <span className="setup-tags">
              <span className="chip">Your names</span>
              <span className="chip">Your limits</span>
              <span className="chip">Weekly or monthly</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  const back = (
    <button className="btn btn-ghost btn-sm" onClick={() => setMode("choose")}>
      <ArrowLeft size={15} /> Back
    </button>
  );

  if (mode === "manual") {
    return (
      <div className="card setup">
        <div className="card-head">
          <h2>
            <PenLine size={17} /> Build my own
          </h2>
          {back}
        </div>
        <div className="grid-2">
          <Field label="Monthly take-home (optional)" hint="Only used to show how much of it you've planned.">
            <MoneyInput value={manualIncome} onChange={setManualIncome} />
          </Field>
        </div>
        <DraftEditor rows={manualRows} setRows={setManualRows} income={manualIncome} />
        <ErrorText>{error}</ErrorText>
        <div className="row top-gap">
          <span className="small muted">{manualRows.length} categories. You can change icons, colors and limits any time.</span>
          <button
            className="btn btn-primary"
            disabled={manualRows.length < 2}
            onClick={() =>
              apply(
                manualRows,
                { ...(inc ?? { frequency: "monthly", irregular: false, averagingMonths: 3, debtTotal: 0, householdSize: 1, goal: "discipline" }), monthlyIncome: manualIncome || inc?.monthlyIncome || 0 },
                "custom"
              )
            }
          >
            <Check size={16} /> Create {manualRows.length} categories
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-grid">
      <div className="setup-side">
      <div className="card setup">
        <div className="card-head">
          <h2>Your money</h2>
          {back}
        </div>
        <Segmented
          full
          label="Income type"
          value={irregular ? "irregular" : "steady"}
          onChange={(v) => setIrregular(v === "irregular")}
          options={[
            { value: "steady", label: "Steady paychecks" },
            { value: "irregular", label: "Irregular income" },
          ]}
        />
        <div className="top-gap">
          {!irregular ? (
            <div className="grid-2">
              <Field label="Paid">
                <Dropdown
                  value={frequency}
                  onChange={(v: PayFrequency) => setFrequency(v)}
                  options={[
                    { value: "weekly", label: "Weekly" },
                    { value: "biweekly", label: "Every two weeks" },
                    { value: "semimonthly", label: "Twice a month" },
                    { value: "monthly", label: "Monthly" },
                  ]}
                />
              </Field>
              <Field label="Take-home per paycheck">
                <MoneyInput value={perCheck} onChange={setPerCheck} />
              </Field>
            </div>
          ) : (
            <Field label="Average monthly income" hint={avg.average > 0 ? `Your logged paychecks average ${fmt(avg.average)} over ${avg.monthsOfData} month${avg.monthsOfData > 1 ? "s" : ""}.` : "A rough average of the last few months."}>
              <MoneyInput value={avgIncome} onChange={setAvgIncome} />
            </Field>
          )}
        </div>
        <div className="grid-2">
          <Field label="People in your household">
            <div className="stepper">
              <button className="icon-btn" onClick={() => setHousehold(Math.max(1, household - 1))} aria-label="Fewer people">
                <Minus size={15} />
              </button>
              <strong className="num">{household}</strong>
              <button className="icon-btn" onClick={() => setHousehold(Math.min(12, household + 1))} aria-label="More people">
                <Plus size={15} />
              </button>
            </div>
          </Field>
          <Field label="Debt to pay down" hint="Not counting a mortgage. Zero is fine.">
            <MoneyInput value={debt} onChange={setDebt} />
          </Field>
        </div>
        <Field label="Main goal">
          <Dropdown
            value={goal}
            onChange={(v: Goal) => setGoal(v)}
            options={[
              { value: "discipline", label: "Get control of spending" },
              { value: "debt", label: "Pay off debt" },
              { value: "emergency", label: "Build an emergency fund" },
              { value: "purchase", label: "Save for something specific" },
            ]}
          />
        </Field>
        <div className="plan-bar ok" style={{ marginBottom: 0 }}>
          <span>Budgeting off</span>
          <strong className="num">{fmt(monthly)} a month</strong>
        </div>
      </div>
      <PlanSplit rows={rows} income={monthly} />
      </div>

      <div className="card setup">
        <div className="card-head">
          <h2>Pick a profile</h2>
        </div>
        <div className="profile-grid">
          {PRESETS.map((p) => {
            const Icon = PRESET_ICONS[p.id];
            return (
              <button key={p.id} className={`tile ${preset === p.id ? "on" : ""}`} onClick={() => setPreset(p.id)}>
                <span className="tile-title">
                  <Icon size={16} className="faint" /> {p.label}
                  {p.id === rec && <span className="pill">Suggested</span>}
                </span>
                <span className="tile-sub">{p.blurb}</span>
              </button>
            );
          })}
        </div>
        <div className="section-head" style={{ marginTop: 18 }}>
          <h2>Your categories</h2>
          <span className="xs muted">Edit anything. Changing the answers or profile rebuilds this list.</span>
        </div>
        {monthly <= 0 ? (
          <Callout status="info">Enter your income to see the plan.</Callout>
        ) : (
          <DraftEditor rows={rows} setRows={setRows} income={monthly} />
        )}
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-primary btn-block top-gap" disabled={monthly <= 0 || rows.length === 0} onClick={() => apply(rows, profile, preset)}>
          <Check size={16} /> Use this plan ({rows.length} categories)
        </button>
      </div>
    </div>
  );
}

// Needs, wants and saving shares of whatever plan is on screen.
function PlanSplit({ rows, income }: { rows: DraftRow[]; income: Cents }) {
  if (rows.length === 0 || income <= 0) return null;
  const groups = (["needs", "wants", "saving"] as const).map((g) => {
    const amt = sum(rows.filter((r) => KIND_META[r.kind].group === g).map(monthlyEquivalent));
    return { g, amt, pct: Math.round((amt / income) * 100) };
  });
  const colors = { needs: "var(--k-transport)", wants: "var(--k-dining)", saving: "var(--k-emergency)" };
  return (
    <div className="card setup">
      <div className="card-head">
        <h2>How this plan splits</h2>
      </div>
      <div className="split-bar" role="img" aria-label={groups.map((x) => `${GROUP_LABEL[x.g]} ${x.pct}%`).join(", ")}>
        {groups.map((x) => (
          <span key={x.g} style={{ width: `${Math.max(0, x.pct)}%`, background: colors[x.g] }} />
        ))}
      </div>
      {groups.map((x) => (
        <div key={x.g} className="row small" style={{ padding: "6px 0" }}>
          <span className="row gap" style={{ gap: 8 }}>
            <span className="dot-c" style={{ ["--c" as string]: colors[x.g] }} /> {GROUP_LABEL[x.g]}
          </span>
          <span className="num">
            {fmt(x.amt)} <span className="muted">· {x.pct}%</span>
          </span>
        </div>
      ))}
      <div className="xs muted top-gap">A common rule of thumb is about 50% needs, 30% wants and 20% saving and debt.</div>
    </div>
  );
}

// ---------- reset

export function ResetModal({ onClose }: { onClose: () => void }) {
  const { state, act, set } = useStore();
  const toast = useToast();
  const holds = state.transactions.filter((t) => t.status === "pending");
  const [settle, setSettle] = useState(true);
  const [error, setError] = useState<string>();
  const inCategories = sum(state.envelopes.map((e) => e.balance));

  return (
    <Modal
      title="Reset all categories"
      onClose={onClose}
      icon={
        <span className="notice-icon s-critical" style={{ width: 38, height: 38 }}>
          <RotateCcw size={18} />
        </span>
      }
    >
      <p className="small">
        All {state.envelopes.length} categories get deleted, along with their limits, colors and what Fin learned about your stores. Your transaction history stays.
      </p>
      <div className="preview-box" style={{ marginBottom: 12 }}>
        <div className="preview-line">
          <span>Money in categories now</span>
          <strong className="num">{fmt(inCategories)}</strong>
        </div>
        <div className="preview-line">
          <span>Unassigned after reset</span>
          <strong className="num">{fmt(state.unassigned + inCategories)}</strong>
        </div>
      </div>
      {holds.length > 0 && <Toggle checked={settle} onChange={setSettle} label={`Settle ${holds.length} pending hold${holds.length > 1 ? "s" : ""} first`} sub="Holds belong to a category, so they have to finish before it can be deleted." />}
      <Callout status="warning">Until you set up new categories, the card declines everything.</Callout>
      <ErrorText>{error}</ErrorText>
      <div className="grid-2 top-gap">
        <button className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-danger"
          onClick={() => {
            const r = act((s) => resetCategories(s, { settleHolds: settle }));
            if (r.error) return setError(r.error);
            set({ view: "budget" });
            toast({ status: "info", title: "Categories reset", body: "Pick a profile or build your own" });
            onClose();
          }}
        >
          <RotateCcw size={15} /> Reset categories
        </button>
      </div>
    </Modal>
  );
}
