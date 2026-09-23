import { ArrowRight, BookOpen, CircleX, CreditCard, Inbox, Layers, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useStore } from "../store";
import { FinMark, Logo, Progress, StatusPill } from "../components/ui";
import { KindBadge } from "../components/meta";
import { demoState } from "../engine/seed";
import { EnvelopeKind } from "../types";

function PhonePreview() {
  const rows: { kind: EnvelopeKind; name: string; left: string; u: number }[] = [
    { kind: "groceries", name: "Groceries", left: "$166.50", u: 0.68 },
    { kind: "transport", name: "Gas and transport", left: "$9.24", u: 0.96 },
    { kind: "dining", name: "Eating out", left: "$27.48", u: 0.6 },
    { kind: "subscriptions", name: "Subscriptions", left: "$110.51", u: 0.12 },
  ];
  return (
    <div className="phone" aria-hidden="true">
      <div className="hero">
        <div className="hero-label">
          <FinMark size={14} color="rgba(242,251,246,0.85)" /> Jordan's Fin account
        </div>
        <div className="hero-amount">
          $7,188<span className="cents">.14</span>
        </div>
        <div className="small" style={{ color: "rgba(242,251,246,0.8)" }}>
          $1,074.93 the card can spend
        </div>
      </div>
      <div style={{ padding: "10px 4px 0" }}>
        {rows.map((r) => (
          <div key={r.name} className="mini-env">
            <KindBadge kind={r.kind} size={32} />
            <div className="grow">
              <div className="row small" style={{ marginBottom: 5 }}>
                <strong>{r.name}</strong>
                <span className="muted num">{r.left}</span>
              </div>
              <Progress value={r.u} tone={r.u >= 0.8 ? "warn" : "ok"} />
            </div>
          </div>
        ))}
      </div>
      <div className="float-card">
        <div className="row" style={{ marginBottom: 4 }}>
          <strong className="small t-over" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <CircleX size={15} /> Declined at Olive Garden
          </strong>
        </div>
        <div className="xs muted">Eating out has $27.48. This was $45.48, so it's short by $18.00.</div>
        <div className="row top-gap" style={{ marginTop: 10 }}>
          <span className="btn btn-dark btn-xs">Cover from emergency fund</span>
          <span className="xs muted">Leave it</span>
        </div>
      </div>
    </div>
  );
}

export default function Landing({ onAbout }: { onAbout: () => void }) {
  const { set, state } = useStore();
  const resume = state.user && state.step !== "landing";
  const signup = () => set({ step: resume ? state.step : "signup" });
  const demo = () => set(demoState());

  return (
    <div className="landing">
      <div className="landing-inner">
        <header className="landing-nav">
          <Logo size={23} />
          <div className="row gap">
            <button className="btn btn-ghost btn-sm hide-sm" onClick={onAbout}>
              How it works
            </button>
            <button className="btn btn-outline btn-sm" onClick={demo}>
              Try the demo
            </button>
            <button className="btn btn-primary btn-sm" onClick={signup}>
              {resume ? "Resume signup" : "Sign up"}
            </button>
          </div>
        </header>

        <section className="landing-hero">
          <div>
            <span className="eyebrow">
              <Sparkles size={13} /> Envelope budgeting, enforced at checkout
            </span>
            <h1 className="hero-title">
              A budget your card <em>actually follows.</em>
            </h1>
            <p className="hero-sub">
              Fin splits each paycheck into envelopes for groceries, gas, eating out, rent. The Fin card can only spend what's in the envelope. When eating out is empty, the next dinner gets
              declined at the register instead of showing up as a guilty notification three days later.
            </p>
            <div className="row gap wrap">
              <button className="btn btn-primary btn-lg" onClick={demo}>
                Open the demo account <ArrowRight size={17} />
              </button>
              <button className="btn btn-outline btn-lg" onClick={signup}>
                Go through signup
              </button>
            </div>
            <div className="trust-row">
              <span>
                <ShieldCheck size={15} /> No real money moves
              </span>
              <span>
                <Lock size={15} /> Nothing leaves your browser
              </span>
              <span>
                <CreditCard size={15} /> Real budgeting rules
              </span>
            </div>
          </div>
          <PhonePreview />
        </section>

        <section className="landing-section">
          <h2>Four steps, then it runs itself</h2>
          <p>The old cash-envelope system, minus the envelopes and the cash.</p>
          <div className="steps-row">
            <div className="step-card">
              <div className="step-n">
                <span className="quick-icon">
                  <Inbox size={17} />
                </span>
                Step 1
              </div>
              <strong>Money comes in</strong>
              <p>Your paycheck moves from your bank into Fin and lands in Unassigned. The card can't touch it there.</p>
            </div>
            <div className="step-card">
              <div className="step-n">
                <span className="quick-icon">
                  <Layers size={17} />
                </span>
                Step 2
              </div>
              <strong>Every dollar gets a job</strong>
              <p>One tap fills envelopes in order: rent and bills, groceries and gas, the emergency fund, then the fun stuff.</p>
            </div>
            <div className="step-card">
              <div className="step-n">
                <span className="quick-icon">
                  <CreditCard size={17} />
                </span>
                Step 3
              </div>
              <strong>The card checks first</strong>
              <p>Each swipe draws on one envelope. If it doesn't have the money, the purchase declines and Fin tells you by how much.</p>
            </div>
            <div className="step-card">
              <div className="step-n">
                <span className="quick-icon">
                  <ShieldCheck size={17} />
                </span>
                Step 4
              </div>
              <strong>A way out when it matters</strong>
              <p>Need gas to get to work? Cover the gap from your emergency fund, jot down why, and tap again.</p>
            </div>
          </div>
        </section>

        <section className="landing-section">
          <h2>Why other apps can't do this</h2>
          <p>
            Apps that link your existing card only find out about a purchase after your bank has approved it. They can send an alert. They can't say no. Only the company that issues a card gets a
            vote at checkout, so Fin issues its own card. Your bank stays your bank.
          </p>
          <div className="row gap wrap">
            <StatusPill status="good">Holds from gas pumps shown separately</StatusPill>
            <StatusPill status="info">Vague store codes flagged for a check</StatusPill>
            <StatusPill status="warning">Warnings at 80% and 100%</StatusPill>
            <StatusPill status="neutral">Cash logged by hand</StatusPill>
          </div>
          <button className="btn btn-outline top-gap" onClick={onAbout}>
            <BookOpen size={16} /> Read how the whole thing works
          </button>
        </section>

        <section className="cta-band">
          <svg className="hero-watermark" width="240" height="240" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M4 26 C8 18 13 8 22 4 C18 12 20 22 27 26 Z" stroke="#fff" strokeWidth={1.2} strokeLinejoin="round" />
          </svg>
          <div style={{ position: "relative" }}>
            <h2>See it decline something</h2>
            <p>The demo account has ten weeks of history and a panel for testing payments.</p>
          </div>
          <button className="btn btn-light btn-lg" style={{ position: "relative" }} onClick={demo}>
            Open the demo <ArrowRight size={17} />
          </button>
        </section>

        <footer className="landing-foot">
          <span className="row gap">
            <FinMark size={16} /> finforfinance.com
          </span>
          <span>Fin is a proof of concept, not a bank. Nothing here is a real account, card or money transfer.</span>
        </footer>
      </div>
    </div>
  );
}
