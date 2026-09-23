import { useStore } from "../store";
import { FinMark, Logo, Progress } from "../components/ui";
import { demoState } from "../engine/seed";

function DemoPreview() {
  const rows = [
    { name: "Groceries", left: "$166.50", u: 0.68 },
    { name: "Gas and transport", left: "$6.61", u: 0.97 },
    { name: "Eating out", left: "$27.48", u: 0.6 },
  ];
  return (
    <div className="hero-preview" aria-hidden="true">
      <div className="card">
        {rows.map((r) => (
          <div key={r.name} className="mini-env">
            <div className="row">
              <span>{r.name}</span>
              <span className="muted">{r.left} left</span>
            </div>
            <Progress value={r.u} tone={r.u >= 0.8 ? "warn" : "ok"} />
          </div>
        ))}
      </div>
      <div className="card decline-card">
        <div className="decline-title">Declined at Olive Garden</div>
        <p className="small">Eating out has $27.48 and this was $45.48. Short by $18.00.</p>
        <div className="row small">
          <span className="chip">Cover $18 from emergency fund</span>
          <span className="muted">Leave it</span>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { set, state } = useStore();
  const resume = state.user && state.step !== "landing";
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo size={22} />
        <div className="row gap">
          <button className="btn btn-ghost btn-sm" onClick={() => set(demoState())}>
            Try the demo
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => set({ step: resume ? state.step : "signup" })}>
            {resume ? "Resume signup" : "Sign up"}
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <h1 className="hero-title">A budget your card actually follows.</h1>
          <p className="hero-sub">
            Fin splits your paycheck into envelopes: groceries, gas, eating out, whatever you need. The Fin card can only spend what's in the envelope. When eating out is
            empty, the next burrito gets declined. Not flagged, not a sad notification after the fact. Declined.
          </p>
          <div className="row gap wrap">
            <button className="btn btn-primary" onClick={() => set(demoState())}>
              Open the demo account
            </button>
            <button className="btn btn-outline" onClick={() => set({ step: resume ? state.step : "signup" })}>
              Go through signup
            </button>
          </div>
          <p className="muted small top-gap">Proof of concept. No real money, no real card, nothing leaves your browser.</p>
        </div>
        <DemoPreview />
      </section>

      <section className="how">
        <div>
          <h2>Every dollar gets a job</h2>
          <p>
            Money comes in from your bank and lands in Unassigned. The card can't touch it there. You give it a job first: rent, groceries, the emergency fund, debt. That's zero-based
            budgeting, the old cash-envelope system without the envelopes.
          </p>
        </div>
        <div>
          <h2>The card enforces it</h2>
          <p>
            Fin is the card issuer, so it approves or declines each swipe itself. If groceries has $40 and the total is $52, it declines and tells you exactly which envelope came up short
            and by how much. Gas pumps and hotels that pre-authorize extra show up as a pending hold, apart from what you've actually spent.
          </p>
        </div>
        <div>
          <h2>With a way out for real emergencies</h2>
          <p>
            A flat no at the pump when you need gas to get to work is a hazard. So a decline comes with one option: cover the gap from your emergency fund, write down why, and tap
            again. The note is there for you to reread at the end of the month.
          </p>
        </div>
        <div>
          <h2>It learns your stores</h2>
          <p>
            Merchant codes are blunt. Walmart is "discount store" whether you bought milk or a TV. Fin guesses, you correct it, and after two corrections it stops guessing wrong. Split one
            receipt across envelopes when you need to.
          </p>
        </div>
      </section>

      <section className="why card">
        <FinMark size={36} />
        <div>
          <h2>Why Fin has its own card</h2>
          <p>
            Apps that "link your card" only see purchases after your bank has approved them. They can't stop anything. Blocking a purchase at the register means being the one who approves
            it, which means issuing the card. In production that's Stripe Issuing on top of a Stripe Treasury account (FDIC pass-through through a partner bank), with Plaid only for moving money in from the bank you already have.
          </p>
        </div>
      </section>

      <footer className="landing-foot">
        <span>finforfinance.com</span>
        <span>Fin is a proof of concept, not a bank. Nothing here is a real account, card, or money transfer.</span>
      </footer>
    </div>
  );
}
