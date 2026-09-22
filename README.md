# Fin — proof of concept

A working front-end demo of the Fin budgeting mechanic: money split into envelopes, and a card that can't spend past what's in one. See `MASTER_PROMPT.md` for the full product spec and the architecture reasoning behind it.

This is a client-only React app. There's no backend, no real bank, no real card. Signup, 2FA, KYC, bank linking, and card issuance are all simulated in the UI. What's real is the budgeting logic itself: zero-based envelope allocation, category-level spend enforcement, pending-vs-settled holds, transaction splitting/recategorization, and the emergency-fund override path all run on the actual rules a live version would use.

## Run it

```
npm install
npm run dev
```

Opens at `http://localhost:5173`. Click **"Skip signup — try test mode"** (pinned to the bottom of the screen on any pre-login screen) to drop straight into a seeded demo account with envelopes, a card, and transaction history already in place — no signup required.

To go through onboarding instead, click "Create account" and step through signup, 2FA (the code is shown on screen), identity verification, the income questionnaire, a budget preset, envelope review, funding, and card issuance.

## Where to look

- `src/store.tsx` — the whole enforcement engine: envelope balances, the swipe/decline/override logic, pending-hold settlement, transaction reassignment.
- `src/SimulatePurchase.tsx` — the core demo: pick a merchant, swipe, watch it approve or decline against the envelope balance.
- `src/data.ts` — merchant list (including the two deliberately ambiguous ones, Target and Amazon, to demonstrate why MCC-only categorization isn't trustworthy) and budget presets.
- `MASTER_PROMPT.md` — the full spec, including why "link an existing card" doesn't work and why Fin has to issue its own card instead.

## What this doesn't cover

No real money movement, no KYC, no card issuer integration, no compliance work. It's a proof of concept for the product mechanic, not a bank.
