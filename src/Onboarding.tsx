import React, { useMemo, useState } from "react";
import { useStore } from "./store";
import { Logo, StepDots, ThemeToggle } from "./ui";
import { PRESETS, categoryLabel } from "./data";
import { CategoryId, IncomeFrequency, PresetId } from "./types";
import { money } from "./utils";

const STEP_ORDER = ["signup", "twofactor", "kyc", "questionnaire", "preset", "envelopeReview", "fund", "cardIssued"];

function Frame({ children, step }: { children: React.ReactNode; step: string }) {
  const idx = STEP_ORDER.indexOf(step);
  return (
    <div className="center-shell">
      <div className="row-between" style={{ marginBottom: 18 }}>
        <Logo />
        <ThemeToggle />
      </div>
      {idx >= 0 && <StepDots total={STEP_ORDER.length} current={idx} />}
      {children}
    </div>
  );
}

function SignUp() {
  const { dispatch } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const valid = name.trim().length > 1 && /\S+@\S+\.\S+/.test(email) && password.length >= 8;

  return (
    <Frame step="signup">
      <h2>Create your account</h2>
      <p>This is a proof of concept. Nothing here leaves your browser.</p>
      <div className="field">
        <label>Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Rivera" />
      </div>
      <div className="field">
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" />
      </div>
      <div className="field">
        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" type="password" />
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={!valid}
        onClick={() => dispatch({ type: "SIGNUP", name, email })}
      >
        Continue
      </button>
    </Frame>
  );
}

function TwoFactor() {
  const { dispatch } = useStore();
  const code = useMemo(() => String(Math.floor(100000 + Math.random() * 900000)), []);
  const [entered, setEntered] = useState("");

  return (
    <Frame step="twofactor">
      <h2>Set up two-factor authentication</h2>
      <p>In production this pairs with an authenticator app. Here, we just show you the code.</p>
      <div className="info-box" style={{ marginBottom: 16 }}>
        <p>Simulated authenticator code: <strong>{code}</strong></p>
      </div>
      <div className="field">
        <label>Enter the 6-digit code</label>
        <input value={entered} onChange={(e) => setEntered(e.target.value)} maxLength={6} placeholder="000000" />
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={entered !== code}
        onClick={() => dispatch({ type: "VERIFY_2FA" })}
      >
        Verify and continue
      </button>
    </Frame>
  );
}

function Kyc() {
  const { dispatch } = useStore();
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const valid = dob.length > 0 && address.trim().length > 4;

  return (
    <Frame step="kyc">
      <h2>Verify your identity</h2>
      <p>
        Issuing a real card requires KYC through the card-issuing partner (Stripe Identity or similar). This form is a
        stand-in — nothing is actually verified in this proof of concept.
      </p>
      <div className="field">
        <label>Date of birth</label>
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
      </div>
      <div className="field">
        <label>Home address</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Austin, TX" />
      </div>
      <button className="btn btn-primary btn-block" disabled={!valid} onClick={() => dispatch({ type: "SUBMIT_KYC" })}>
        Continue
      </button>
    </Frame>
  );
}

function Questionnaire() {
  const { dispatch } = useStore();
  const [frequency, setFrequency] = useState<IncomeFrequency>("biweekly");
  const [monthlyIncome, setMonthlyIncome] = useState(4000);
  const [dependents, setDependents] = useState(0);
  const [hasDebt, setHasDebt] = useState(false);
  const [goal, setGoal] = useState<"debt" | "emergency" | "discipline" | "goal">("discipline");

  return (
    <Frame step="questionnaire">
      <h2>A few questions about your money</h2>
      <p>This drives your starting budget. Every number here can be changed later.</p>
      <div className="field">
        <label>How often are you paid?</label>
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as IncomeFrequency)}>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every two weeks</option>
          <option value="monthly">Monthly</option>
          <option value="irregular">Irregular (freelance, tips, commission)</option>
        </select>
        {frequency === "irregular" && (
          <p className="hint">
            Irregular income gets budgeted off a trailing average instead of a fixed monthly figure once you're in the app.
          </p>
        )}
      </div>
      <div className="field">
        <label>Typical take-home income per month</label>
        <input
          type="number"
          value={monthlyIncome}
          onChange={(e) => setMonthlyIncome(Number(e.target.value))}
          min={0}
        />
      </div>
      <div className="field">
        <label>Dependents</label>
        <input type="number" value={dependents} onChange={(e) => setDependents(Number(e.target.value))} min={0} />
      </div>
      <div className="field">
        <label>
          <input type="checkbox" checked={hasDebt} onChange={(e) => setHasDebt(e.target.checked)} style={{ width: "auto", marginRight: 8 }} />
          I'm carrying debt I want to pay down
        </label>
      </div>
      <div className="field">
        <label>Main goal right now</label>
        <select value={goal} onChange={(e) => setGoal(e.target.value as typeof goal)}>
          <option value="discipline">General budgeting discipline</option>
          <option value="debt">Pay off debt</option>
          <option value="emergency">Build an emergency fund</option>
          <option value="goal">Save for something specific</option>
        </select>
      </div>
      <button
        className="btn btn-primary btn-block"
        onClick={() => dispatch({ type: "SUBMIT_QUESTIONNAIRE", income: { frequency, monthlyIncome, dependents, hasDebt, goal } })}
      >
        Continue
      </button>
    </Frame>
  );
}

function PresetPicker() {
  const { dispatch } = useStore();
  const [selected, setSelected] = useState<PresetId | null>(null);

  return (
    <Frame step="preset">
      <h2>Pick a starting budget</h2>
      <p>Every preset uses zero-based budgeting: every dollar gets assigned somewhere. You can edit it on the next screen.</p>
      <div className="stack-gap">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`choice-tile ${selected === p.id ? "selected" : ""}`}
            onClick={() => setSelected(p.id)}
          >
            <div className="label">{p.label}</div>
            <div className="sub">{p.blurb}</div>
          </button>
        ))}
      </div>
      <div style={{ height: 14 }} />
      <button
        className="btn btn-primary btn-block"
        disabled={!selected}
        onClick={() => selected && dispatch({ type: "SELECT_PRESET", preset: selected })}
      >
        Continue
      </button>
    </Frame>
  );
}

function EnvelopeReview() {
  const { state, dispatch } = useStore();
  const income = state.income?.monthlyIncome ?? 0;
  const totalAllocated = state.envelopes.reduce((sum, e) => sum + e.allocated, 0);
  const unassigned = income - totalAllocated;

  function updateAmount(category: CategoryId, value: number) {
    const envelopes = state.envelopes.map((e) => (e.category === category ? { ...e, allocated: value } : e));
    dispatch({ type: "UPDATE_ENVELOPES", envelopes });
  }

  return (
    <Frame step="envelopeReview">
      <h2>Review your envelopes</h2>
      <p>Adjust anything before it's final. Every dollar should end up with a job.</p>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row-between">
          <span>Monthly income</span>
          <strong>{money(income)}</strong>
        </div>
        <div className="row-between">
          <span>Left unassigned</span>
          <strong style={{ color: unassigned === 0 ? "var(--green-dark)" : unassigned < 0 ? "var(--red)" : "var(--amber)" }}>
            {money(unassigned)}
          </strong>
        </div>
      </div>
      <div className="stack-gap">
        {state.envelopes
          .filter((e) => e.category !== "unassigned")
          .map((e) => (
            <div key={e.category} className="field" style={{ marginBottom: 0 }}>
              <label>{categoryLabel(e.category)}</label>
              <input type="number" value={e.allocated} min={0} onChange={(ev) => updateAmount(e.category, Number(ev.target.value))} />
            </div>
          ))}
      </div>
      <div style={{ height: 14 }} />
      <button className="btn btn-primary btn-block" onClick={() => dispatch({ type: "CONFIRM_ENVELOPES" })}>
        Confirm envelopes
      </button>
    </Frame>
  );
}

const MOCK_BANKS = ["Chase •••• 1187", "Bank of America •••• 5521", "Ally •••• 0093"];

function FundAccount() {
  const { state, dispatch } = useStore();
  const [bank, setBank] = useState(MOCK_BANKS[0]);
  const suggested = state.envelopes.reduce((sum, e) => sum + e.allocated, 0);
  const [amount, setAmount] = useState(suggested);

  return (
    <Frame step="fund">
      <h2>Fund your Fin account</h2>
      <p>
        Fin issues its own card, so money has to move into a Fin-held account before the card can spend it. This links a
        real bank for the money-in side only (via Plaid, in a real build) — Fin never touches that outside card.
      </p>
      <div className="field">
        <label>Linked bank</label>
        <select value={bank} onChange={(e) => setBank(e.target.value)}>
          {MOCK_BANKS.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Transfer amount</label>
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} min={0} />
        <p className="hint">Simulated instant transfer. Real ACH typically takes 1-3 business days.</p>
      </div>
      <button className="btn btn-primary btn-block" onClick={() => dispatch({ type: "FUND_ACCOUNT", bankName: bank, amount })}>
        Transfer and continue
      </button>
    </Frame>
  );
}

function CardIssued() {
  const { state, dispatch } = useStore();
  const [issued, setIssued] = useState(!!state.card);

  return (
    <Frame step="cardIssued">
      <h2>Your Fin card</h2>
      {!issued && (
        <>
          <p>This provisions a virtual card immediately. A physical card would mail separately in a real build.</p>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              dispatch({ type: "ISSUE_CARD" });
              setIssued(true);
            }}
          >
            Issue my card
          </button>
        </>
      )}
      {issued && state.card && (
        <>
          <div className="virtual-card" style={{ marginBottom: 16 }}>
            <div className="top">
              <Logo size={20} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>VIRTUAL</span>
            </div>
            <div className="number">•••• •••• •••• {state.card.last4}</div>
            <div className="bottom">
              <span>{state.user?.name}</span>
              <span>Active</span>
            </div>
          </div>
          <p>Your card only spends from envelopes with money in them. That's the whole mechanism.</p>
          <button className="btn btn-primary btn-block" onClick={() => dispatch({ type: "SET_STEP", step: "done" })}>
            Enter Fin
          </button>
        </>
      )}
    </Frame>
  );
}

export default function Onboarding() {
  const { state } = useStore();
  switch (state.onboardingStep) {
    case "signup":
      return <SignUp />;
    case "twofactor":
      return <TwoFactor />;
    case "kyc":
      return <Kyc />;
    case "questionnaire":
      return <Questionnaire />;
    case "preset":
      return <PresetPicker />;
    case "envelopeReview":
      return <EnvelopeReview />;
    case "fund":
      return <FundAccount />;
    case "cardIssued":
      return <CardIssued />;
    default:
      return null;
  }
}
