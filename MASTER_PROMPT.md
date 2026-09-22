# Fin — master build prompt

Use this as the spec to build the product end to end. It assumes a small team or an AI coding agent implementing in phases. Read the whole thing before starting; the architecture section overrides anything in the concept summary that conflicts with it.

## 1. What Fin is

Fin is a personal finance app built around one idea: money gets split into envelopes by category (groceries, gas, eating out, subscriptions, etc.), and you physically cannot overspend an envelope, because Fin's own card declines the charge when that envelope is empty. It's Dave Ramsey-style zero-based budgeting and the envelope system, digitized, enforced at the point of sale instead of relying on willpower or after-the-fact alerts.

Brand name: **Fin**. Logo: the word "Fin" set next to (or worked into) a minimal shark fin outline — single clean stroke, no gradients, no texture, reads at 16px in a nav bar.

## 2. Why this is not "just link your card" — read before building

A linked external card (Plaid-style) is read-only. You get transaction history after the bank has settled it. You cannot approve or decline someone else's card swipe. Real-time spend blocking requires Fin to be the card issuer of record.

**Architecture decision, non-negotiable for the core feature to work:**

- Fin issues its own virtual (and optionally physical) debit card via a card-issuing platform: Stripe Issuing is the recommended starting point because it pairs with Stripe Treasury for the underlying FDIC pass-through cash account, and it minimizes how much banking-license overhead you have to own directly. Marqeta, Lithic, or Unit are alternatives if you outgrow Stripe's constraints.
- The user links their existing bank via Plaid (Auth product) for **funding only** — moving money into their Fin account via ACH. Fin never tries to read or control their outside bank's card.
- Inside Fin, the cash balance is split into envelopes (categories with allocated amounts). The Fin card can only spend against envelope balances.
- A purchase declines when its envelope balance is insufficient. This is enforced by the ledger having the money or not, not by a real-time rules engine trying to beat a webhook timeout. Optionally, also wire up the issuer's real-time authorization webhook (Stripe Issuing supports this) to add MCC-based soft warnings or category restrictions, but the hard block comes from balance, not from a judgment call under time pressure.

Build the MVP around this. Do not build a version where Fin merely watches a Plaid-linked external card and tries to veto its purchases; that is not achievable with these tools.

## 3. Brand and design system

- Colors: light green (primary, something like `#4CAF7D`–`#6FCF97` range, pick one and use consistently) and white for light mode. Dark mode: near-black background (`#101512` range, not pure `#000`), the same green shifted slightly brighter/more saturated for contrast (`#4CAF7D` tends to hold up; test against WCAG AA on the dark background).
- Typography: one clean sans-serif (Inter, or similar), no more than two weights in regular UI.
- Logo: shark fin outline only, no body of the shark, no waves, no water texture. Wordmark "Fin" in lowercase or sentence case, not all caps.
- Keep density low. This is a money app people check when anxious; the UI should read as calm, not busy. Avoid red as an accent except for genuine over-budget/declined states — reserve it, don't decorate with it.

## 4. Onboarding flow

1. **Account creation**: email + password, or OAuth (Google/Apple). Email verification required before proceeding.
2. **2FA setup**: TOTP (authenticator app) preferred over SMS (SIM-swap risk); offer SMS as a fallback, not the default. Required before linking any money.
3. **Identity verification (KYC)**: required because Fin is issuing a card and holding funds. Collect legal name, DOB, SSN/ITIN, address; run through the issuing partner's KYC flow (Stripe Identity or equivalent). This step exists because of section 2's architecture, not because of vanity — don't skip it or the card issuance will fail downstream.
4. **Income and goals questionnaire** (this is what drives the budget presets):
   - Pay frequency and typical take-home income (or "irregular income" toggle, see section 7).
   - Existing debt (optional, informs whether to suggest a debt-snowball-oriented preset).
   - Dependents / household size (affects suggested grocery and household ranges).
   - Primary goal: pay off debt, build emergency savings, general budgeting discipline, save for a specific purchase.
5. **Budget preset selection**: offer a short list of starting templates (see section 7), each pre-filling envelope categories and suggested amounts based on the questionnaire, fully editable before confirming.
6. **Fund the account**: link external bank via Plaid Auth, initiate an ACH transfer to seed the Fin balance. Card is provisioned (virtual immediately, physical optional, mailed).

## 5. Money in / money out

- **Money in**: Plaid-linked external bank → ACH transfer into the Fin Treasury-backed account. Support recurring auto-transfers (e.g., "$200 every payday into Fin").
- **Money out**: purchases on the Fin-issued card, draining the relevant envelope. Also support manual transfers out (back to the linked bank) for envelope categories like "savings" that aren't meant to be spent by card.
- **Uncategorized/unallocated balance**: money not yet assigned to an envelope sits in a default "unassigned" bucket and cannot be spent by card until assigned — this is the zero-based budgeting discipline (give every dollar a job before it can move).

## 6. Transaction categorization

- Auto-tag transactions using merchant name + MCC from the issuer's transaction data as a first pass.
- MCC is coarse (a single big-box code can span groceries, electronics, and gifts) — never treat it as final. Show the category as a suggestion, let the user confirm or change it, and let them split a single transaction across multiple envelopes (e.g., a $120 Target run split $80 groceries / $40 household).
- Learn from corrections: if a user recategorizes "Walmart" from groceries to household twice, bias future Walmart transactions toward household as the suggested default (simple frequency-based rule is enough for v1, no need for a trained model initially).
- Recurring transaction detection (subscriptions) — flag same-merchant, same-amount, monthly-cadence charges and suggest a "subscriptions" envelope.

## 7. Budgeting engine

- **Zero-based budgeting** as the core model: total funded balance = sum of all envelope allocations. The UI should make it uncomfortable to leave money unassigned.
- **Presets** (editable after selection, not locked in):
  - *Starter / debt-focused*: tight envelopes, minimal discretionary spend, larger "debt payoff" and "emergency fund" allocations — for users who flagged existing debt in onboarding.
  - *Balanced*: standard percentage split across needs / wants / savings (a common reference point is roughly 50/30/20, adjustable).
  - *Percent-of-income*: user sets a percentage per category instead of a flat dollar amount; envelope targets recalculate automatically when income changes.
  - *Custom*: user builds every envelope and amount from scratch.
- **Irregular income mode**: instead of a fixed monthly budget, use a trailing 3-6 month average income, or Ramsey's income-prioritization method — list income sources/paychecks as they arrive and assign each one to categories in priority order until it's spoken for, rather than assuming a flat monthly figure.
- **Emergency fund envelope**: present by default, not optional to hide. This is both good practice and the designated override source (section 8).
- Weekly and monthly cadence should both be supported per envelope (some categories like "eating out" make more sense weekly).

## 8. Enforcement and overrides

- Card declines automatically when an envelope balance is insufficient — this falls out of the ledger, not a rules engine (see section 2).
- Handle **pending vs. settled** amounts distinctly: gas pumps, hotels, and rental cars often pre-auth for more than the final charge. Show "pending hold" separately from "available in envelope" so balances don't look wrong for the day or two it takes to settle.
- **Override flow**: when a charge would decline, offer a one-tap "cover this from Emergency Fund" option (with a confirmation step and a note field — "why," logged for their own review later), rather than a dead end. This is deliberate: a flat decline on a real need (gas to get to work, urgent medical) is a hazard, not just friction.
- **Cash and off-app spending**: card enforcement obviously can't see ATM withdrawals or spending elsewhere. Provide manual expense entry that debits an envelope the same way a card swipe would, so the budget stays honest.
- **Notifications**: warn at 80% and 100% of an envelope, and on decline, explain which envelope and by how much it was short — not just "declined."

## 9. Data model (sketch)

- `User` — identity, KYC status, auth/2FA state.
- `LinkedBankAccount` — Plaid item, used for funding only.
- `FinAccount` — Treasury-backed cash account, balance.
- `Card` — issuer token, virtual/physical, status (active/frozen).
- `Envelope` — name, category, allocated amount, cadence (weekly/monthly), current balance, rollover setting (does unspent money carry to next period or reset).
- `Transaction` — amount, merchant, MCC, matched envelope(s) (supports split), status (pending/settled/declined), source (card/manual/transfer).
- `BudgetPreset` — template definition, applied-from reference on a user's envelope set.
- `IncomeProfile` — pay frequency, trailing average, irregular-income flag.

## 10. Compliance, don't skip this

- KYC/AML on account opening (via issuing/BaaS partner's tooling).
- PCI DSS scope reduction: use the issuer's hosted card-details components, never store raw PANs yourself.
- GLBA-compliant handling of financial data (encryption at rest/in transit, access logging).
- Use a bank-as-a-service partner (Column, Thread Bank, Unit, Synctera) rather than pursuing your own money transmitter license — this is the standard path for a startup at this stage.
- Don't use Dave Ramsey's name or brand on presets without a license. Describe the method (zero-based budgeting, debt snowball, starter emergency fund) rather than attaching his name to it.

## 11. Suggested MVP phasing

1. Auth, 2FA, KYC, Plaid funding link, Stripe Treasury account provisioning — no card yet, just get money in and show a balance.
2. Envelope creation and zero-based allocation UI, manual expense entry, budget presets from the questionnaire.
3. Issue the virtual card, wire up real transaction ingestion and MCC-based categorization with user correction.
4. Hard-block spend via envelope balance, pending/settled handling, override-from-emergency-fund flow.
5. Physical card issuance, subscription detection, recurring auto-transfers, irregular-income mode.

## 12. Open decisions to make before or during build

- Which issuing/BaaS stack: Stripe Issuing + Treasury (fastest to ship, more constraints on eligibility) vs. Unit/Synctera/Marqeta + a bank partner (more control, more setup time).
- Physical card at launch, or virtual-only for MVP.
- Rollover policy default: unspent envelope money carries over vs. resets each period (Ramsey's method typically wants intentional reallocation, not silent rollover).
- How aggressive the MCC-correction learning should be in v1 (simple frequency bias vs. a real model) — start simple.
