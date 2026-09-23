import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useStore } from "../store";
import { AppState, Cents, Envelope, EnvelopeKind, Goal, OnboardingStep, PayFrequency, PresetId } from "../types";
import { Callout, Dropdown, ErrorText, Field, Logo, Modal, MoneyInput, Segmented, Toggle } from "../components/ui";
import { KindBadge, GROUP_LABEL, KIND_META } from "../components/meta";
import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Building2, ClipboardList, CreditCard, Inbox, KeyRound, Layers, Lock, Mail, Sparkles, Trash2, UserRound, Apple } from "lucide-react";
import { KIND_LABELS } from "../engine/catalog";
import { PRESETS, buildEnvelopes, makeEnvelope, monthlyEquivalent, recommendedPreset } from "../engine/presets";
import { applyPlan, assign, planFill, transferIn } from "../engine/ledger";
import { trailingAverage } from "../engine/clock";
import { newCard } from "../engine/seed";
import { envelopeOptions } from "../components/options";
import { otpauthUri, randomSecret, totp, verifyTotp } from "../engine/totp";
import { addDays, addMonths, fmt, fmtShort, sum, uid } from "../engine/util";

const STEPS: OnboardingStep[] = ["signup", "verifyEmail", "twoFactor", "kyc", "questionnaire", "preset", "review", "fund", "assign", "card"];

const STEP_ICONS: Record<string, LucideIcon> = {
  signup: UserRound,
  verifyEmail: Mail,
  twoFactor: KeyRound,
  kyc: BadgeCheck,
  questionnaire: ClipboardList,
  preset: Sparkles,
  review: Layers,
  fund: Building2,
  assign: Inbox,
  card: CreditCard,
};

const STEP_NAMES: Record<string, string> = {
  signup: "Account",
  verifyEmail: "Email",
  twoFactor: "Two-factor",
  kyc: "Identity",
  questionnaire: "Your money",
  preset: "Preset",
  review: "Envelopes",
  fund: "Funding",
  assign: "Assign",
  card: "Card",
};

function Shell({ step, children, wide }: { step: OnboardingStep; children: React.ReactNode; wide?: boolean }) {
  const { state, set } = useStore();
  const i = STEPS.indexOf(step);
  const Icon = STEP_ICONS[step];
  return (
    <div className="onboard-wrap">
      <div className={`onboard ${wide ? "wide" : ""}`}>
        <div className="onboard-top">
          <button className="link-btn" onClick={() => set({ step: "landing" })} aria-label="Back to start">
            <Logo size={21} />
          </button>
          <span className="small muted">
            {STEP_NAMES[step]} · {i + 1} of {STEPS.length}
          </span>
        </div>
        <div className="steps" aria-hidden="true">
          {STEPS.map((s, j) => (
            <span key={s} className={j <= i ? "on" : ""} />
          ))}
        </div>
        <div className="onboard-card">
          {Icon && (
            <span className="step-icon">
              <Icon size={21} />
            </span>
          )}
          {children}
        </div>
        {state.user && (
          <p className="muted xs center top-gap" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
            <Lock size={12} /> Signed up as {state.user.email}. Everything stays in this browser.
          </p>
        )}
      </div>
    </div>
  );
}

export function BankLogo({ name }: { name: string }) {
  const colors: Record<string, string> = {
    Chase: "#117aca",
    "Bank of America": "#c8102e",
    "Wells Fargo": "#b31b1b",
    "Capital One": "#004977",
    Ally: "#650360",
    "Navy Federal": "#0b2d71",
    USAA: "#12284c",
    Citi: "#056dae",
  };
  return (
    <span className="bank-logo" style={{ background: colors[name] ?? "#52514e" }} aria-hidden="true">
      {name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)}
    </span>
  );
}

// ---------- 1. account

function SignUp() {
  const { set } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [oauth, setOauth] = useState<null | "google" | "apple">(null);
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const pwOk = password.length >= 10 && /\d/.test(password) && /[a-zA-Z]/.test(password);

  return (
    <Shell step="signup">
      <h1>Create your account</h1>
      <p className="muted">You'll verify your email and set up two-factor before any money moves.</p>
      <div className="stack">
        <button className="btn btn-outline btn-block" onClick={() => setOauth("google")}>
          <span style={{ fontWeight: 700, color: "#4285f4", width: 18, textAlign: "center" }}>G</span> Continue with Google
        </button>
        <button className="btn btn-outline btn-block" onClick={() => setOauth("apple")}>
          <Apple size={17} /> Continue with Apple
        </button>
      </div>
      <div className="divider">or use email</div>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </Field>
      <Field label="Email">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
      </Field>
      <Field label="Password" hint="At least 10 characters, with a letter and a number.">
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" />
      </Field>
      <button
        className="btn btn-primary btn-block"
        disabled={!name.trim() || !emailOk || !pwOk}
        onClick={() =>
          set({
            user: { name: name.trim(), email: email.trim(), provider: "password" },
            security: { emailVerified: false, twoFactor: null },
            step: "verifyEmail",
          })
        }
      >
        Create account
      </button>
      {oauth && <OAuthModal provider={oauth} onClose={() => setOauth(null)} />}
    </Shell>
  );
}

function OAuthModal({ provider, onClose }: { provider: "google" | "apple"; onClose: () => void }) {
  const { set } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const label = provider === "google" ? "Google" : "Apple";
  return (
    <Modal title={`Sign in with ${label}`} onClose={onClose}>
      <p className="muted small">
        Simulated. A real build hands off to {label}'s OAuth screen and gets back a verified email, so the email step is skipped.
      </p>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={`${label} account email`}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      </Field>
      <button
        className="btn btn-primary btn-block"
        disabled={!name.trim() || !/^\S+@\S+\.\S+$/.test(email)}
        onClick={() =>
          set({
            user: { name: name.trim(), email: email.trim(), provider },
            security: { emailVerified: true, twoFactor: null },
            step: "twoFactor",
          })
        }
      >
        Continue
      </button>
    </Modal>
  );
}

function VerifyEmail() {
  const { state, set } = useStore();
  const code = useMemo(() => String(100000 + Math.floor(Math.random() * 900000)), []);
  const [entered, setEntered] = useState("");
  const [sentAt, setSentAt] = useState(Date.now());
  return (
    <Shell step="verifyEmail">
      <h1>Check your email</h1>
      <p className="muted">We sent a 6-digit code to {state.user?.email}. It expires in 15 minutes.</p>
      <div className="demo-box" key={sentAt}>
        <div className="demo-label">Demo inbox</div>
        <p>
          <strong>Your Fin code is {code}</strong>
          <br />
          <span className="muted small">No email was actually sent.</span>
        </p>
      </div>
      <Field label="Code">
        <input value={entered} onChange={(e) => setEntered(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
      </Field>
      <ErrorText>{entered.length === 6 && entered !== code ? "That code doesn't match." : undefined}</ErrorText>
      <button
        className="btn btn-primary btn-block"
        disabled={entered !== code}
        onClick={() => set({ security: { ...state.security, emailVerified: true }, step: "twoFactor" })}
      >
        Verify email
      </button>
      <button className="btn btn-ghost btn-block" onClick={() => setSentAt(Date.now())}>
        Resend code
      </button>
    </Shell>
  );
}

// ---------- 2. two-factor

function TwoFactor() {
  const { state, set } = useStore();
  const [method, setMethod] = useState<"totp" | "sms">("totp");
  return (
    <Shell step="twoFactor">
      <h1>Turn on two-factor</h1>
      <p className="muted">Required before you link a bank. An authenticator app is safer than text messages, which can be hijacked with a SIM swap.</p>
      <Segmented
        label="Two-factor method"
        value={method}
        onChange={setMethod}
        options={[
          { value: "totp", label: "Authenticator app" },
          { value: "sms", label: "Text message" },
        ]}
      />
      <div className="top-gap">
        {method === "totp" ? (
          <TotpSetup onDone={(secret) => set({ security: { ...state.security, twoFactor: "totp", totpSecret: secret }, step: "kyc" })} />
        ) : (
          <SmsSetup onDone={(phone) => set({ security: { ...state.security, twoFactor: "sms", smsPhone: phone }, step: "kyc" })} />
        )}
      </div>
    </Shell>
  );
}

function TotpSetup({ onDone }: { onDone: (secret: string) => void }) {
  const { state } = useStore();
  const secret = useMemo(() => randomSecret(), []);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [peek, setPeek] = useState<string>();

  useEffect(() => {
    QRCode.toDataURL(otpauthUri(secret, state.user?.email ?? "you"), { margin: 1, width: 180 }).then(setQr);
  }, [secret, state.user?.email]);

  return (
    <>
      <div className="totp">
        {qr ? <img src={qr} width={180} height={180} alt="QR code for your authenticator app" /> : <div className="qr-placeholder" />}
        <div>
          <p className="small">Scan this with Google Authenticator, 1Password, Authy, or any TOTP app. It's a real code: your app will work with it.</p>
          <p className="small muted">Can't scan? Enter this key:</p>
          <code className="secret">{secret.match(/.{1,4}/g)?.join(" ")}</code>
        </div>
      </div>
      <Field label="6-digit code from the app">
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button
        className="btn btn-primary btn-block"
        disabled={code.length !== 6}
        onClick={async () => {
          if (await verifyTotp(secret, code)) onDone(secret);
          else setError("That code didn't match. Codes change every 30 seconds.");
        }}
      >
        Verify and turn on
      </button>
      <button className="btn btn-ghost btn-block" onClick={async () => setPeek(await totp(secret))}>
        {peek ? `Current code: ${peek}` : "No phone handy? Show the current code (demo only)"}
      </button>
    </>
  );
}

function SmsSetup({ onDone }: { onDone: (phone: string) => void }) {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const digits = phone.replace(/\D/g, "");
  return (
    <>
      <Callout status="warning">Text codes are the fallback. Anyone who ports your number to their SIM gets your codes too.</Callout>
      <Field label="Mobile number">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(512) 555-0142" />
      </Field>
      {!sent ? (
        <button className="btn btn-primary btn-block" disabled={digits.length < 10} onClick={() => setSent(String(100000 + Math.floor(Math.random() * 900000)))}>
          Text me a code
        </button>
      ) : (
        <>
          <div className="demo-box">
            <div className="demo-label">Demo text message</div>
            <p>Fin: your code is {sent}</p>
          </div>
          <Field label="Code">
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" />
          </Field>
          <button className="btn btn-primary btn-block" disabled={code !== sent} onClick={() => onDone(`•••• ${digits.slice(-4)}`)}>
            Verify and turn on
          </button>
        </>
      )}
    </>
  );
}

// ---------- 3. identity

const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

function Kyc() {
  const { state, set } = useStore();
  const [first, setFirst] = useState(state.user?.name.split(" ")[0] ?? "");
  const [last, setLast] = useState(state.user?.name.split(" ").slice(1).join(" ") ?? "");
  const [dob, setDob] = useState("");
  const [ssn, setSsn] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [st, setSt] = useState("TX");
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | "failed">(null);

  const ssnDigits = ssn.replace(/\D/g, "");
  const age = dob ? (Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000) : 0;
  const problems = [
    !first.trim() || !last.trim() ? "legal name" : "",
    !dob ? "date of birth" : age < 18 ? "you need to be 18 or older" : "",
    ssnDigits.length !== 9 ? "9-digit SSN or ITIN" : "",
    !street.trim() || !city.trim() ? "street address" : "",
    !/^\d{5}$/.test(zip) ? "5-digit ZIP" : "",
  ].filter(Boolean);

  function formatSsn(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 9);
    return [d.slice(0, 3), d.slice(3, 5), d.slice(5)].filter(Boolean).join("-");
  }

  function submit() {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (ssnDigits === "111111111") {
        setResult("failed");
        set({ kyc: { status: "failed" } });
        return;
      }
      set({
        kyc: { status: "verified", legalName: `${first.trim()} ${last.trim()}`, ssnLast4: ssnDigits.slice(-4), city: city.trim(), state: st },
        step: "questionnaire",
      });
    }, 1400);
  }

  return (
    <Shell step="kyc">
      <h1>Verify your identity</h1>
      <p className="muted">
        Fin issues you a card and holds your money, so federal know-your-customer rules apply. In production this goes through the card issuer's identity check
        (Stripe Identity or similar), not Fin's own servers.
      </p>
      <Callout status="warning">
        This is a demo. Don't enter your real SSN. Use <strong>000-00-0000</strong> to pass, or <strong>111-11-1111</strong> to see a failed check. Only the last 4 digits are kept.
      </Callout>
      <div className="grid-2">
        <Field label="Legal first name">
          <input value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
        </Field>
        <Field label="Legal last name">
          <input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Date of birth">
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} autoComplete="bday" />
        </Field>
        <Field label="SSN or ITIN">
          <input value={formatSsn(ssn)} onChange={(e) => setSsn(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="000-00-0000" />
        </Field>
      </div>
      <Field label="Street address">
        <input value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" />
      </Field>
      <div className="grid-3">
        <Field label="City">
          <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
        </Field>
        <Field label="State">
          <Dropdown value={st} onChange={setSt} options={US_STATES.map((x) => ({ value: x, label: x }))} searchable />
        </Field>
        <Field label="ZIP">
          <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" autoComplete="postal-code" />
        </Field>
      </div>
      {result === "failed" && (
        <Callout status="critical">
          We couldn't verify you automatically. A real account would move to document review (photo ID plus a selfie). In this demo, fix the SSN and try again.
        </Callout>
      )}
      {problems.length > 0 && (dob || ssn || zip) && <p className="muted small">Still needed: {problems.join(", ")}.</p>}
      <button className="btn btn-primary btn-block" disabled={problems.length > 0 || busy} onClick={submit}>
        {busy ? "Checking..." : "Verify identity"}
      </button>
    </Shell>
  );
}

// ---------- 4. income and goals

const PER_MONTH: Record<PayFrequency, number> = { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1 };

function Questionnaire() {
  const { state, set } = useStore();
  const [irregular, setIrregular] = useState(false);
  const [frequency, setFrequency] = useState<PayFrequency>("biweekly");
  const [perCheck, setPerCheck] = useState<Cents>(0);
  const [months, setMonths] = useState<Cents[]>([0, 0, 0]);
  const [hasDebt, setHasDebt] = useState(false);
  const [debt, setDebt] = useState<Cents>(0);
  const [household, setHousehold] = useState(1);
  const [goal, setGoal] = useState<Goal>("discipline");

  const monthly = irregular ? Math.round(sum(months) / 3) : Math.round(perCheck * PER_MONTH[frequency]);

  function next() {
    const incomeLog = irregular
      ? months.map((amount, i) => ({ id: uid(), at: addMonths(state.now, -(3 - i)), amount, source: "Reported at signup" })).filter((e) => e.amount > 0)
      : [];
    const income = {
      frequency,
      monthlyIncome: irregular ? trailingAverage(incomeLog, state.now, 3).average : monthly,
      irregular,
      averagingMonths: 3 as const,
      debtTotal: hasDebt ? debt : 0,
      householdSize: household,
      goal,
    };
    set({ income, incomeLog, step: "preset" });
  }

  return (
    <Shell step="questionnaire">
      <h1>Your money, roughly</h1>
      <p className="muted">This sets your starting budget. Ballpark is fine and everything can change later.</p>

      <Toggle checked={irregular} onChange={setIrregular} label="My income is irregular (freelance, gig work, commission, tips)" />

      {!irregular ? (
        <div className="grid-2 top-gap">
          <Field label="How often you're paid">
            <Dropdown
              value={frequency}
              onChange={(v: PayFrequency) => setFrequency(v)}
              options={[
                { value: "weekly", label: "Weekly", description: "52 paychecks a year" },
                { value: "biweekly", label: "Every two weeks", description: "26 a year, the most common" },
                { value: "semimonthly", label: "Twice a month", description: "Like the 1st and 15th" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
          </Field>
          <Field label="Take-home per paycheck">
            <MoneyInput value={perCheck} onChange={setPerCheck} />
          </Field>
        </div>
      ) : (
        <div className="top-gap">
          <p className="small muted">What actually landed in each of the last three months? Fin budgets off the average and updates it as you log paychecks.</p>
          <div className="grid-3">
            {months.map((m, i) => (
              <Field key={i} label={new Date(addMonths(state.now, -(3 - i))).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}>
                <MoneyInput value={m} onChange={(v) => setMonths(months.map((x, j) => (j === i ? v : x)))} />
              </Field>
            ))}
          </div>
        </div>
      )}
      {monthly > 0 && <p className="small">That's about <strong>{fmtShort(monthly)}</strong> a month.</p>}

      <Toggle checked={hasDebt} onChange={setHasDebt} label="I have debt I want to pay down (not counting a mortgage)" />
      {hasDebt && (
        <Field label="Roughly how much, total" hint="Credit cards, car loan, student loans, medical. Optional.">
          <MoneyInput value={debt} onChange={setDebt} />
        </Field>
      )}

      <div className="grid-2 top-gap">
        <Field label="People in your household">
          <input type="number" min={1} max={12} value={household} onChange={(e) => setHousehold(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
        </Field>
        <Field label="Main goal right now">
          <Dropdown
            value={goal}
            onChange={(v: Goal) => setGoal(v)}
            options={[
              { value: "discipline", label: "Get control of spending", description: "Balanced preset" },
              { value: "debt", label: "Pay off debt", description: "Starter preset, debt snowball" },
              { value: "emergency", label: "Build an emergency fund", description: "Bigger emergency share" },
              { value: "purchase", label: "Save for something specific", description: "Adds a savings envelope" },
            ]}
          />
        </Field>
      </div>
      <button className="btn btn-primary btn-block" disabled={monthly <= 0} onClick={next}>
        Continue
      </button>
    </Shell>
  );
}

// ---------- 5. preset and review

function Preset() {
  const { state, set } = useStore();
  const income = state.income!;
  const rec = recommendedPreset(income);
  const [pick, setPick] = useState<PresetId>(rec);
  const preview = useMemo(() => buildEnvelopes(pick, income, state.now), [pick, income, state.now]);

  return (
    <Shell step="preset" wide>
      <h1>Pick a starting point</h1>
      <p className="muted">
        Every preset is zero-based: your {fmtShort(income.monthlyIncome)} a month gets split until nothing's left over. You'll edit the numbers next.
      </p>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button key={p.id} className={`tile ${pick === p.id ? "on" : ""}`} onClick={() => setPick(p.id)}>
            <span className="tile-title">
              {p.label}
              {p.id === rec && <span className="pill">Suggested for you</span>}
            </span>
            <span className="tile-sub">{p.blurb}</span>
          </button>
        ))}
      </div>
      <div className="card top-gap">
        <div className="preview-list">
          {preview.map((e) => (
            <div key={e.id} className="row">
              <span>
                <KindBadge kind={e.kind} size={26} />
                {e.name}
              </span>
              <span className="muted num">
                {e.percent !== undefined ? `${e.percent}% · ` : ""}
                {fmtShort(e.target)}
                {e.cadence === "weekly" ? " / week" : " / month"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <button
        className="btn btn-primary btn-block top-gap"
        onClick={() => set({ preset: pick, envelopes: buildEnvelopes(pick, income, state.now), step: "review" })}
      >
        Use {PRESETS.find((p) => p.id === pick)!.label.toLowerCase()}
      </button>
    </Shell>
  );
}

const ADDABLE: EnvelopeKind[] = ["groceries", "household", "transport", "dining", "subscriptions", "shopping", "entertainment", "health", "utilities", "housing", "debt", "savings", "custom"];

export function planSummary(envelopes: Envelope[], income: Cents) {
  const planned = sum(envelopes.map(monthlyEquivalent));
  return { planned, left: income - planned };
}

function Review() {
  const { state, set } = useStore();
  const income = state.income!.monthlyIncome;
  const envs = state.envelopes;
  const { planned, left: rawLeft } = planSummary(envs, income);
  const left = Math.abs(rawLeft) < 100 ? 0 : rawLeft;
  const [addKind, setAddKind] = useState<EnvelopeKind>("custom");

  const update = (id: string, patch: Partial<Envelope>) => set({ envelopes: envs.map((e) => (e.id === id ? { ...e, ...patch, percent: patch.target !== undefined ? undefined : e.percent } : e)) });

  return (
    <Shell step="review" wide>
      <h1>Give every dollar a job</h1>
      <p className="muted">Change anything. Weekly envelopes count about 4.3 times toward the month.</p>
      <div className={`plan-bar ${left === 0 ? "ok" : left < 0 ? "over" : "warn"}`}>
        <span>
          Planned {fmtShort(planned)} of {fmtShort(income)}
        </span>
        <strong>{left === 0 ? "Every dollar has a job" : left > 0 ? `${fmt(left)} still needs a job` : `${fmt(-left)} over your income`}</strong>
      </div>
      <div className="card">
        {envs.map((e) => (
          <div key={e.id} className="review-row">
            <KindBadge kind={e.kind} size={30} />
            <input className="name-input" value={e.name} onChange={(ev) => update(e.id, { name: ev.target.value })} aria-label="Envelope name" />
            <MoneyInput value={e.target} onChange={(v) => update(e.id, { target: v })} ariaLabel={`${e.name} amount`} />
            <Dropdown
              ariaLabel={`${e.name} cadence`}
              value={e.cadence}
              onChange={(v: Envelope["cadence"]) => update(e.id, { cadence: v })}
              options={[
                { value: "monthly", label: "per month" },
                { value: "weekly", label: "per week" },
              ]}
            />
            {e.kind === "emergency" ? (
              <span className="icon-btn" title="Required. Declined purchases get covered from here." aria-label="Required envelope">
                <Lock size={15} />
              </span>
            ) : (
              <button className="icon-btn" onClick={() => set({ envelopes: envs.filter((x) => x.id !== e.id) })} aria-label={`Remove ${e.name}`}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        <div className="review-add">
          <Dropdown
            ariaLabel="Envelope type to add"
            value={addKind}
            onChange={setAddKind}
            options={ADDABLE.map((k) => ({ value: k, label: KIND_LABELS[k], icon: <KindBadge kind={k} size={30} />, group: GROUP_LABEL[KIND_META[k].group] }))}
          />
          <button
            className="btn btn-outline btn-sm"
            onClick={() => set({ envelopes: [...envs, makeEnvelope(addKind, { now: state.now, target: Math.max(0, left), priority: 100 + envs.length })] })}
          >
            Add envelope
          </button>
        </div>
      </div>
      <ErrorText>{left < 0 ? "You've planned more than you bring in. Trim something before you continue." : undefined}</ErrorText>
      <button className="btn btn-primary btn-block top-gap" disabled={left < 0 || envs.some((e) => !e.name.trim())} onClick={() => set({ step: "fund" })}>
        {left > 0 ? `Continue with ${fmt(left)} unplanned` : "Looks right"}
      </button>
    </Shell>
  );
}

// ---------- 6. funding

const INSTITUTIONS = ["Chase", "Bank of America", "Wells Fargo", "Capital One", "Ally", "Navy Federal", "USAA", "Citi"];

function Fund() {
  const { state, act, set } = useStore();
  const planned = planSummary(state.envelopes, state.income!.monthlyIncome).planned;
  const [linking, setLinking] = useState(false);
  const [amount, setAmount] = useState<Cents>(planned);
  const [instant, setInstant] = useState(true);
  const [auto, setAuto] = useState(true);
  const perCheck = Math.round(state.income!.monthlyIncome / PER_MONTH[state.income!.frequency]);
  const [autoAmount, setAutoAmount] = useState<Cents>(perCheck);
  const [error, setError] = useState<string>();

  function go() {
    const r = act((s) => transferIn(s, amount, "onboarding", instant));
    if (r.error) return setError(r.error);
    if (auto && autoAmount > 0) {
      const cadence = state.income!.frequency === "weekly" ? "weekly" : state.income!.frequency === "monthly" ? "monthly" : "biweekly";
      act((s) => ({ ...s, autoTransfers: [{ id: uid(), amount: autoAmount, cadence, nextAt: addDays(s.now, 14), active: true }] }));
    }
    set({ step: "assign" });
  }

  return (
    <Shell step="fund">
      <h1>Move money into Fin</h1>
      <p className="muted">
        Your bank stays your bank. Fin only pulls money in by ACH, and never reads or controls your other cards. The Fin card can only spend what's inside Fin.
      </p>
      {!state.bank ? (
        <button className="btn btn-primary btn-block" onClick={() => setLinking(true)}>
          Link your bank
        </button>
      ) : (
        <>
          <div className="tile row" style={{ gap: 10, cursor: "default", marginBottom: 14 }}>
            <BankLogo name={state.bank.institution} />
            <span style={{ flex: 1 }}>
              <strong>{state.bank.institution}</strong> {state.bank.accountName}
            </span>
            <span className="muted">•••• {state.bank.mask}</span>
          </div>
          <Field label="First transfer" hint={`Your plan is ${fmtShort(planned)} a month.`}>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Toggle checked={auto} onChange={setAuto} label="Repeat every payday" />
          {auto && (
            <Field label="Auto-transfer amount" hint={`Pulls from ${state.bank.institution} on your pay schedule. Pause or change it any time.`}>
              <MoneyInput value={autoAmount} onChange={setAutoAmount} />
            </Field>
          )}
          <Toggle checked={instant} onChange={setInstant} label="Land it now (demo). Real ACH takes 1 to 3 business days." />
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-primary btn-block top-gap" disabled={amount <= 0} onClick={go}>
            Transfer {fmt(amount)}
          </button>
        </>
      )}
      {linking && (
        <PlaidLinkModal
          onClose={() => setLinking(false)}
          onLinked={(bank) => {
            set({ bank });
            setLinking(false);
          }}
        />
      )}
    </Shell>
  );
}

export function PlaidLinkModal({ onClose, onLinked }: { onClose: () => void; onLinked: (b: NonNullable<AppState["bank"]>) => void }) {
  const [inst, setInst] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const accounts = [
    { accountName: "Checking", mask: "1187" },
    { accountName: "Savings", mask: "5521" },
  ];
  return (
    <Modal title={inst ? inst : "Select your bank"} onClose={onClose}>
      <p className="muted small">Simulated Plaid Link (Auth product). A real build opens Plaid's hosted flow; Fin never sees your bank password.</p>
      {!inst && (
        <div className="bank-grid">
          {INSTITUTIONS.map((i) => (
            <button key={i} className="tile" onClick={() => setInst(i)}>
              <BankLogo name={i} />
              {i}
            </button>
          ))}
        </div>
      )}
      {inst && !authed && (
        <>
          <Field label="Username" hint="Any value works here.">
            <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Password">
            <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" autoComplete="off" />
          </Field>
          <button
            className="btn btn-primary btn-block"
            disabled={!user || !pass || busy}
            onClick={() => {
              setBusy(true);
              setTimeout(() => {
                setBusy(false);
                setAuthed(true);
              }, 900);
            }}
          >
            {busy ? "Connecting..." : "Continue"}
          </button>
        </>
      )}
      {inst && authed && (
        <div className="stack">
          <p className="small">Which account should fund Fin?</p>
          {accounts.map((a) => (
            <button key={a.mask} className="tile row" style={{ gap: 10 }} onClick={() => onLinked({ institution: inst, ...a })}>
              <BankLogo name={inst} />
              <span>{a.accountName}</span>
              <span className="muted">•••• {a.mask}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------- 7. assign

export function AssignPlan({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const { state, act } = useStore();
  const plan = planFill(state);
  const total = sum(plan.map((p) => p.amount));
  const leftover = state.unassigned - total;
  const [error, setError] = useState<string>();
  if (state.unassigned <= 0) return null;
  return (
    <div className={compact ? "" : "card"}>
      {plan.length > 0 ? (
        <>
          <p className="small">Fills envelopes top to bottom by priority until the money runs out. Needs first, then the emergency fund, then everything else.</p>
          <div className="preview-list">
            {plan.map((p) => {
              const e = state.envelopes.find((x) => x.id === p.envelopeId)!;
              return (
                <div key={p.envelopeId} className="row">
                  <span>
                    <KindBadge kind={e.kind} size={26} />
                    {e.name}
                  </span>
                  <span className="num t-good">+{fmt(p.amount)}</span>
                </div>
              );
            })}
          </div>
          {leftover > 0 && <p className="small muted top-gap">That meets every target, with {fmt(leftover)} left over.</p>}
          <ErrorText>{error}</ErrorText>
          <button
            className="btn btn-primary btn-block top-gap"
            onClick={() => {
              const r = act((s) => applyPlan(s, planFill(s)));
              if (r.error) setError(r.error);
              else onDone?.();
            }}
          >
            Assign {fmt(total)}
          </button>
        </>
      ) : (
        <p className="small muted">Every envelope is at its target for this period. Put the extra {fmt(state.unassigned)} somewhere on purpose: debt, the emergency fund, or a savings goal.</p>
      )}
      {(leftover > 0 || plan.length === 0) && <PutRest amount={plan.length === 0 ? state.unassigned : leftover} />}
    </div>
  );
}

function PutRest({ amount }: { amount: Cents }) {
  const { state, act } = useStore();
  const savings = state.envelopes.filter((e) => !e.cardSpendable && e.kind !== "housing");
  const [to, setTo] = useState(savings.find((e) => e.kind === "debt")?.id ?? savings[0]?.id ?? state.envelopes[0]?.id ?? "");
  return (
    <div className="split-row top-gap">
      <Dropdown ariaLabel="Envelope for the extra money" value={to} onChange={setTo} options={envelopeOptions(state.envelopes)} />
      <button className="btn btn-outline" disabled={!to} onClick={() => act((s) => assign(s, to, Math.min(amount, s.unassigned)))}>
        Put {fmt(amount)} there
      </button>
    </div>
  );
}

function Assign() {
  const { state, set } = useStore();
  const pending = state.transfers.find((t) => t.direction === "in" && t.status === "pending");
  return (
    <Shell step="assign">
      <h1>Fill your envelopes</h1>
      {pending ? (
        <p className="muted">
          Your {fmt(pending.amount)} transfer is on its way and should land around {new Date(pending.arrivesAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}.
          When it does, it goes to Unassigned and you'll fill envelopes from the Budget tab.
        </p>
      ) : (
        <>
          <p className="muted">
            {fmt(state.unassigned)} just landed in Unassigned. The card can't touch it until it's in an envelope. That's the point.
          </p>
          <AssignPlan onDone={() => set({ step: "card" })} />
        </>
      )}
      <button className="btn btn-ghost btn-block top-gap" onClick={() => set({ step: "card" })}>
        {pending || state.unassigned === 0 ? "Continue" : "I'll do this later"}
      </button>
    </Shell>
  );
}

// ---------- 8. card

function CardStep() {
  const { state, set } = useStore();
  const [physical, setPhysical] = useState(false);
  return (
    <Shell step="card">
      <h1>Your Fin card</h1>
      <p className="muted">
        A virtual card is ready now for Apple Pay, Google Pay, and online checkout. It can only spend what's in an envelope, so a purchase that doesn't fit gets declined at the register.
      </p>
      <Toggle checked={physical} onChange={setPhysical} label={`Also mail me a physical card${state.kyc.city ? ` (to ${state.kyc.city}, ${state.kyc.state})` : ""}`} />
      <button
        className="btn btn-primary btn-block top-gap"
        onClick={() => {
          const card = newCard(state.now)!;
          if (physical) card.physical = { status: "shipping", orderedAt: state.now, arrivesAt: addDays(state.now, 7) };
          set({ card, step: "done", view: "home" });
        }}
      >
        Issue my card
      </button>
    </Shell>
  );
}

export default function Onboarding() {
  const { state } = useStore();
  // a reload mid-signup with missing earlier data goes back to the step that collects it
  if (["preset", "review", "fund", "assign", "card"].includes(state.step) && !state.income) return <Questionnaire />;
  if (state.step !== "signup" && !state.user) return <SignUp />;
  switch (state.step) {
    case "signup":
      return <SignUp />;
    case "verifyEmail":
      return <VerifyEmail />;
    case "twoFactor":
      return <TwoFactor />;
    case "kyc":
      return <Kyc />;
    case "questionnaire":
      return <Questionnaire />;
    case "preset":
      return <Preset />;
    case "review":
      return <Review />;
    case "fund":
      return <Fund />;
    case "assign":
      return <Assign />;
    case "card":
      return <CardStep />;
    default:
      return null;
  }
}
