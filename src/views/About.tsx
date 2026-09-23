import { ArrowLeft, BadgeCheck, Building2, ChevronDown, CreditCard, Hourglass, Inbox, KeyRound, Landmark, Layers, Lock, Repeat, ShieldAlert, ShieldCheck, Sparkles, Tags, UserRound, Wallet } from "lucide-react";
import { Logo } from "../components/ui";

const TOC = [
  ["why", "Why Fin issues the card"],
  ["flow", "The whole process"],
  ["swipe", "What happens at the register"],
  ["money", "Where the money sits"],
  ["holds", "Holds and settlement"],
  ["categories", "Categories"],
  ["periods", "Budget periods"],
  ["safety", "Security and compliance"],
  ["stack", "Production stack"],
  ["faq", "Questions"],
];

const STEPS = [
  {
    icon: UserRound,
    title: "Open an account",
    body: "Email and password, or Google or Apple. The email gets verified with a code before anything else happens.",
  },
  {
    icon: KeyRound,
    title: "Turn on two-factor",
    body: "An authenticator app by default, text messages as the fallback. Required before a bank can be linked, because from here on the account can move money.",
  },
  {
    icon: BadgeCheck,
    title: "Verify identity",
    body: "Legal name, date of birth, SSN or ITIN, and address go to the card issuer's identity check (Stripe Identity or the bank partner's own). Federal rules require this for anyone who holds money and issues a card. Fin keeps the last four digits, nothing more.",
  },
  {
    icon: Sparkles,
    title: "Answer four questions, pick a preset",
    body: "Pay frequency and take-home, debt, household size, main goal. The answers pre-fill a zero-based plan (starter and debt-focused, balanced, percent of income, or custom) that you edit before it's final.",
  },
  {
    icon: Building2,
    title: "Link a bank for funding",
    body: "Plaid Auth returns the account and routing numbers for your existing checking account. That's all Fin ever uses it for: pulling money in and sending it back. Fin can't see or control that bank's own cards.",
  },
  {
    icon: Inbox,
    title: "Money lands in Unassigned",
    body: "An ACH pull moves money into your Fin account in 1 to 3 business days. It arrives unassigned, and the card can't touch unassigned money. Recurring pulls can run every payday.",
  },
  {
    icon: Layers,
    title: "Give every dollar a job",
    body: "You fill envelopes from Unassigned, by hand or with one tap that fills them in priority order: rent and bills, then groceries and gas, then the emergency fund, then everything else.",
  },
  {
    icon: CreditCard,
    title: "Spend with the Fin card",
    body: "A virtual card works right away in Apple Pay, Google Pay and online. A physical card is optional and arrives in about a week. Every swipe gets checked against one envelope's balance.",
  },
];

function SwipeDiagram() {
  const lanes = [
    { x: 70, label: "Checkout", sub: "Terminal or website" },
    { x: 220, label: "Card network", sub: "Visa" },
    { x: 370, label: "Card issuer", sub: "Stripe Issuing" },
    { x: 520, label: "Fin", sub: "Authorization service", fin: true },
    { x: 670, label: "Fin ledger", sub: "Envelope balances", fin: true },
  ];
  const msgs: { from: number; to: number; y: number; text: string; sub?: string; kind?: "ok" | "no" }[] = [
    { from: 0, to: 1, y: 110, text: "Tap card, $45.48", sub: "merchant, MCC 5812" },
    { from: 1, to: 2, y: 150, text: "Authorization request" },
    { from: 2, to: 3, y: 190, text: "Real-time webhook", sub: "must answer in about 2 seconds" },
    { from: 3, to: 4, y: 230, text: "Which envelope? What's free?", sub: "Eating out: $27.48" },
    { from: 4, to: 3, y: 270, text: "$27.48 < $45.48" },
    { from: 3, to: 2, y: 310, text: "Decline, short $18.00", kind: "no" },
    { from: 2, to: 1, y: 350, text: "Declined", kind: "no" },
    { from: 1, to: 0, y: 390, text: "Card declined", kind: "no" },
  ];
  return (
    <div className="diagram">
      <svg viewBox="0 0 740 430" role="img" aria-label="Sequence of a card authorization: the checkout sends a request through the card network to the issuer, which asks Fin; Fin checks the envelope in its ledger and answers approve or decline.">
        <defs>
          {["", "ok", "no"].map((k) => (
            <marker key={k} id={`ah${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className={`arrowhead ${k}`} />
            </marker>
          ))}
        </defs>
        {lanes.map((l) => (
          <g key={l.label}>
            <rect className={`lane-box ${l.fin ? "fin" : ""}`} x={l.x - 62} y={14} width={124} height={50} rx={10} />
            <text className="lane-text" x={l.x} y={36} textAnchor="middle">
              {l.label}
            </text>
            <text className="lane-sub" x={l.x} y={53} textAnchor="middle">
              {l.sub}
            </text>
            <line className="lifeline" x1={l.x} x2={l.x} y1={64} y2={420} />
          </g>
        ))}
        {msgs.map((m, i) => {
          const x1 = lanes[m.from].x;
          const x2 = lanes[m.to].x;
          const dir = x2 > x1 ? 1 : -1;
          const mid = (x1 + x2) / 2;
          return (
            <g key={i}>
              <line className={`msg ${m.kind ?? ""}`} x1={x1 + dir * 4} x2={x2 - dir * 6} y1={m.y} y2={m.y} markerEnd={`url(#ah${m.kind ?? ""})`} />
              <text className="msg-text" x={mid} y={m.y - 7} textAnchor="middle">
                {m.text}
              </text>
              {m.sub && (
                <text className="msg-sub" x={mid} y={m.y + 15} textAnchor="middle">
                  {m.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MoneyDiagram() {
  const envs = [
    { name: "Rent", amt: "$1,176", c: "var(--k-housing)" },
    { name: "Groceries", amt: "$166", c: "var(--k-groceries)" },
    { name: "Gas", amt: "$9", c: "var(--k-transport)" },
    { name: "Eating out", amt: "$27", c: "var(--k-dining)" },
    { name: "Emergency", amt: "$2,260", c: "var(--k-emergency)" },
  ];
  return (
    <div className="diagram">
      <svg viewBox="0 0 740 250" role="img" aria-label="Money flows from your bank by ACH into a pooled account at the partner bank. Stripe Treasury tracks your share as a financial account. Fin's ledger splits that balance into envelopes.">
        <defs>
          <marker id="ahm" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="arrowhead" />
          </marker>
        </defs>
        <rect className="lane-box" x={10} y={90} width={140} height={70} rx={12} />
        <text className="lane-text" x={80} y={120} textAnchor="middle">
          Your bank
        </text>
        <text className="lane-sub" x={80} y={138} textAnchor="middle">
          linked with Plaid
        </text>
        <line className="msg" x1={150} x2={196} y1={125} y2={125} markerEnd="url(#ahm)" />
        <text className="msg-sub" x={173} y={115} textAnchor="middle">
          ACH
        </text>
        <rect className="lane-box" x={200} y={20} width={210} height={210} rx={14} />
        <text className="lane-text" x={305} y={44} textAnchor="middle">
          Partner bank
        </text>
        <text className="lane-sub" x={305} y={61} textAnchor="middle">
          pooled FBO account, FDIC insured
        </text>
        <rect className="lane-box fin" x={222} y={80} width={166} height={130} rx={12} />
        <text className="lane-text" x={305} y={106} textAnchor="middle">
          Your Fin account
        </text>
        <text className="lane-sub" x={305} y={123} textAnchor="middle">
          Stripe Treasury
        </text>
        <text className="lane-text" x={305} y={160} textAnchor="middle" style={{ fontSize: 22 }}>
          $7,188
        </text>
        <text className="lane-sub" x={305} y={182} textAnchor="middle">
          one real balance
        </text>
        <line className="msg" x1={390} x2={446} y1={145} y2={145} markerEnd="url(#ahm)" />
        <text className="msg-sub" x={418} y={135} textAnchor="middle">
          split by
        </text>
        <rect className="ledger" x={450} y={20} width={280} height={210} rx={14} />
        <text className="lane-text" x={590} y={44} textAnchor="middle">
          Fin ledger
        </text>
        {envs.map((e, i) => (
          <g key={e.name}>
            <rect x={466} y={58 + i * 32} width={248} height={26} rx={7} fill="var(--surface-2)" stroke="var(--border)" />
            <circle cx={482} cy={71 + i * 32} r={5} fill={e.c} />
            <text className="msg-text" x={494} y={75 + i * 32}>
              {e.name}
            </text>
            <text className="msg-text" x={702} y={75 + i * 32} textAnchor="end">
              {e.amt}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const STACK = [
  ["Accounts, sign-in, 2FA", "Auth provider plus TOTP (RFC 6238), SMS as fallback", "Real TOTP in the browser; email and OAuth simulated"],
  ["Identity check (KYC/CIP)", "Stripe Identity or the bank partner's KYC", "Form only; 000-00-0000 passes"],
  ["Bank linking", "Plaid Auth for account and routing numbers", "Simulated Plaid Link"],
  ["Holding money", "Stripe Treasury financial account at a partner bank", "A number in the browser"],
  ["Moving money", "Treasury inbound and outbound ACH transfers", "Demo clock lands transfers after 2 days"],
  ["The card", "Stripe Issuing, virtual and physical", "Simulated card"],
  ["Approve or decline", "Issuing real-time authorization webhook, answered by Fin", "The same authorize() function, called by the test panel"],
  ["Envelopes and budget", "Fin's ledger in a server database", "Fin's ledger in local storage"],
  ["Showing the card number", "Stripe Issuing Elements (hosted iframe)", "Never shown"],
];

const FAQ = [
  ["Can Fin block purchases on my other cards?", "No. Only the bank that issued a card can approve or decline it. Apps that link your existing card see purchases after they've gone through. That's why Fin has its own card."],
  [
    "What if Fin's servers don't answer in time?",
    "Card issuers let a program choose what happens when its webhook doesn't respond within the window. Fin would choose decline. Approving blind would break the one promise the product makes.",
  ],
  ["Can I overdraft?", "No. A purchase only clears if the envelope has the money right then, so there's nothing to overdraw and no overdraft fee to charge."],
  ["Is the money insured?", "In production, yes: the balance sits at an FDIC-member partner bank and qualifies for pass-through insurance up to the standard limit when the account records meet FDIC requirements. Fin itself isn't a bank."],
  ["What about refunds?", "A refund would go back to the envelope the purchase came out of, so returning something to Target refills whatever the Target run was filed under."],
  ["Why does leftover money go back to Unassigned?", "So it gets a new job on purpose instead of piling up quietly. You can turn on rollover for any envelope where piling up is the point, like savings goals."],
  ["Does it cost anything?", "This proof of concept doesn't handle real money. A real version would likely earn interchange on card spending, the way most debit card apps do, instead of charging fees."],
];

export default function About({ standalone, onBack }: { standalone?: boolean; onBack?: () => void }) {
  const body = (
    <div className="about">
      <div className="about-hero">
        <div className="eyebrow">
          <ShieldCheck size={14} /> How Fin works
        </div>
        <h1>A budget that holds up at the register, and how it would run for real</h1>
        <p>
          Fin puts your money in envelopes and issues the card that spends it, so it can refuse a purchase the envelope can't cover. This page walks through every step: opening the account, moving
          money, the split second at checkout, and the partners a production version would sit on.
        </p>
        <nav className="toc" aria-label="On this page">
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
      </div>

      <section id="why">
        <h2>
          <span className="num-badge">1</span> Why Fin issues the card
        </h2>
        <p>
          Most budgeting apps connect to the card you already have. They get a copy of each transaction after your bank approves it, which is fine for charts and useless for stopping anything. The
          decision to approve a purchase belongs to the card's issuer, in the second or two after you tap.
        </p>
        <p>
          So Fin is the issuer. It runs on a card-issuing platform (Stripe Issuing is the obvious starting point) and a banking partner that holds the money. Your existing bank stays your bank. Fin
          just pulls money from it.
        </p>
        <div className="feature-grid top-gap">
          <div className="feature">
            <div className="feature-icon">
              <Wallet size={18} />
            </div>
            <strong>Envelopes hold the money</strong>
            <p>Each one has a balance. Unassigned money can't be spent until it's in one.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <Lock size={18} />
            </div>
            <strong>The balance is the rule</strong>
            <p>No scoring or guessing at checkout. The envelope has the money or it doesn't.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <ShieldAlert size={18} />
            </div>
            <strong>One way out</strong>
            <p>A decline can be covered from the emergency fund, with a note about why.</p>
          </div>
        </div>
      </section>

      <section id="flow">
        <h2>
          <span className="num-badge">2</span> The whole process
        </h2>
        <div className="timeline">
          {STEPS.map((s) => (
            <div key={s.title} className="timeline-item">
              <span className="timeline-icon">
                <s.icon size={18} />
              </span>
              <div className="timeline-body">
                <strong>{s.title}</strong>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="swipe">
        <h2>
          <span className="num-badge">3</span> What happens at the register
        </h2>
        <p>
          Here's a $45.48 dinner when Eating out has $27.48 left. The whole round trip takes about a second, and Fin has roughly two of them to answer the issuer's webhook.
        </p>
        <SwipeDiagram />
        <ul className="top-gap">
          <li>
            <strong>Card checks first.</strong> A frozen card, or a blocked merchant type like gambling, declines before any envelope is looked at.
          </li>
          <li>
            <strong>Then the envelope.</strong> Fin picks it from the merchant code, your past corrections, or the envelope you chose in the app before paying.
          </li>
          <li>
            <strong>Then the balance.</strong> If the envelope has enough, Fin approves and takes the money out on the spot. If not, it declines and tells you which envelope and how much short.
          </li>
          <li>
            <strong>The override.</strong> Fin can't approve a purchase after it's declined; card networks don't work that way. Instead it moves exactly the gap from the emergency fund into the
            envelope, you tap again, and the retry goes through. Your note gets saved with it.
          </li>
        </ul>
      </section>

      <section id="money">
        <h2>
          <span className="num-badge">4</span> Where the money sits
        </h2>
        <p>
          Envelopes aren't separate bank accounts. There's one real balance at the partner bank, tracked as your Fin account. Fin's ledger divides that balance, and the rule never bends: Unassigned
          plus every envelope always equals the account balance, to the cent.
        </p>
        <MoneyDiagram />
      </section>

      <section id="holds">
        <h2>
          <span className="num-badge">5</span> Holds and settlement
        </h2>
        <p>
          Gas pumps, hotels and rental cars authorize more than they'll charge. A pump might hold $100 for a $43 fill-up. Fin sets the hold aside in the envelope as its own line, apart from what's
          been spent, so the balance doesn't look wrong for the day it takes to settle.
        </p>
        <div className="feature-grid">
          <div className="feature">
            <div className="feature-icon">
              <Hourglass size={18} />
            </div>
            <strong>At the pump</strong>
            <p>Gas envelope has $150. The $100 hold leaves $50 free to spend.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <BadgeCheck size={18} />
            </div>
            <strong>A day later</strong>
            <p>It settles at $43.42. The hold drops off, $43.42 counts as spent, and $106.58 is free again.</p>
          </div>
        </div>
      </section>

      <section id="categories">
        <h2>
          <span className="num-badge">6</span> How purchases find their envelope
        </h2>
        <ul>
          <li>
            <strong>Merchant codes first.</strong> Every card purchase carries a four-digit merchant category code. 5411 is a grocery store, 5542 is a gas pump.
          </li>
          <li>
            <strong>Some codes are vague.</strong> Walmart and Target use discount-store codes whether you bought milk or a TV. Those get flagged so you can confirm, change, or split them.
          </li>
          <li>
            <strong>Fin learns.</strong> Move a merchant to the same envelope twice and it becomes the default for that merchant. Simple counting, no model.
          </li>
          <li>
            <strong>Splits.</strong> A $120 Target run can be $80 groceries and $40 household. Money moves between envelopes to match.
          </li>
          <li>
            <strong>Subscriptions.</strong> Same merchant, same amount, about a month apart: Fin flags it and offers to route future charges to Subscriptions.
          </li>
          <li>
            <strong>Cash.</strong> The card never sees cash, so you log it. It comes out of the envelope like a swipe, and the same amount goes back to your bank.
          </li>
        </ul>
      </section>

      <section id="periods">
        <h2>
          <span className="num-badge">7</span> Budget periods
        </h2>
        <p>
          Each envelope resets weekly (Mondays) or monthly (the 1st). Weekly envelopes top themselves back up from Unassigned. Monthly spending envelopes send leftover money back to Unassigned for
          you to reassign; savings, debt and bills keep theirs. Warnings go out at 80% and 100% of an envelope.
        </p>
        <p>
          Irregular income works off a 3 or 6 month average of what actually came in. Each paycheck gets assigned top to bottom by fill order until it's spoken for, which covers rent before
          anything fun.
        </p>
      </section>

      <section id="safety">
        <h2>
          <span className="num-badge">8</span> Security and compliance
        </h2>
        <div className="feature-grid">
          <div className="feature">
            <div className="feature-icon">
              <BadgeCheck size={18} />
            </div>
            <strong>Know your customer</strong>
            <p>Identity checks and anti-money-laundering monitoring run through the banking partner's program at account opening and after.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <CreditCard size={18} />
            </div>
            <strong>Card data</strong>
            <p>Full card numbers only appear inside the issuer's hosted component. Fin never stores one, which keeps most of PCI DSS out of scope.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <Lock size={18} />
            </div>
            <strong>Financial privacy</strong>
            <p>Encryption at rest and in transit, access logging, and least-privilege access to customer data, as GLBA expects.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <Landmark size={18} />
            </div>
            <strong>A licensed partner</strong>
            <p>Fin works through a bank partner instead of holding its own money transmitter licenses, the normal route for a startup.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <KeyRound size={18} />
            </div>
            <strong>Two-factor by default</strong>
            <p>Required before money moves. Authenticator apps preferred over SMS because of SIM-swap fraud.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <Tags size={18} />
            </div>
            <strong>Plain method names</strong>
            <p>Presets describe the methods (zero-based budgeting, debt snowball, starter emergency fund) without borrowing anyone's brand.</p>
          </div>
        </div>
      </section>

      <section id="stack">
        <h2>
          <span className="num-badge">9</span> Production stack
        </h2>
        <p>What each piece would be in a real launch, next to what this proof of concept does instead.</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Piece</th>
                <th>In production</th>
                <th>In this demo</th>
              </tr>
            </thead>
            <tbody>
              {STACK.map(([a, b, c]) => (
                <tr key={a}>
                  <td>
                    <strong>{a}</strong>
                  </td>
                  <td>{b}</td>
                  <td className="muted">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted top-gap">
          Alternatives to Stripe for issuing and banking include Marqeta, Lithic, Unit and Synctera, paired with a bank such as Column or Thread Bank. They trade more setup time for more control.
        </p>
      </section>

      <section id="faq" className="faq">
        <h2>
          <span className="num-badge">10</span> Questions
        </h2>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <ChevronDown size={18} />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <section>
        <div className="callout c-neutral">
          <Repeat size={18} className="callout-icon" />
          <div className="callout-body">
            <div className="callout-title">About this proof of concept</div>
            <div className="callout-text">
              The budgeting rules on this site are the real ones, and every number the demo shows came out of them. The bank, the card, the identity check and the passing of time are simulated in your
              browser. No real money moves and nothing leaves your device.
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  if (!standalone) return body;
  return (
    <div className="landing">
      <div className="landing-inner">
        <header className="landing-nav">
          <Logo size={22} />
          <button className="btn btn-outline btn-sm" onClick={onBack}>
            <ArrowLeft size={15} /> Back
          </button>
        </header>
        <div style={{ paddingBottom: 60, display: "flex", justifyContent: "center" }}>{body}</div>
      </div>
    </div>
  );
}
