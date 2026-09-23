# Fin

Envelope budgeting where the card enforces the budget. Money gets split into envelopes, and the Fin card declines anything the envelope can't cover. Full product spec in `MASTER_PROMPT.md`.

This repo is the proof of concept for finforfinance.com. It's a static React app with no backend. The budgeting engine is real and tested. Everything that needs a bank, a card network, or an identity provider is simulated in the browser, behind the same shapes the real integrations would use.

## Run it

```
npm install
npm run dev      # http://localhost:5173
npm test         # engine + TOTP tests
npm run build    # static site in dist/
```

On the landing page, "Open the demo account" loads about ten weeks of history. "Go through signup" runs the full onboarding.

## What works

- Onboarding: email or Google/Apple sign-in (simulated), email code, two-factor, identity check, income questionnaire, preset, envelope review, Plaid-style bank link, first ACH transfer, first assignment, virtual card, optional physical card.
- Two-factor is real RFC 6238 TOTP. Scan the QR with any authenticator app and its codes will work. SMS is offered as the fallback, with the SIM-swap warning.
- Zero-based budgeting: new money lands in Unassigned, and the card can't touch it until you assign it. "Assign by priority" fills envelopes in fill order, which is also how irregular-income mode handles each paycheck.
- Presets: starter/debt-focused, balanced (about 50/30/20), percent of income (targets recalculate when income changes), and custom. All of them include the emergency fund, which can't be deleted.
- Weekly or monthly cadence per envelope. Rollover can be set per envelope. By default, spending envelopes send leftovers back to Unassigned at the end of the period, and savings-type envelopes keep theirs.
- Card authorization in `authorize()`: frozen card, blocked merchant codes (gambling), no matching envelope, savings envelope, insufficient funds. Each decline says which envelope was short and by how much.
- Pending holds (gas, hotels) are shown apart from spending and settle to the real amount.
- Override: cover a shortfall from the emergency fund with a note, then retry. Every override lands in Activity under Overrides.
- Categorization: merchant code first, then your corrections. Two corrections for the same merchant make that envelope the default. Transactions can be split across any number of envelopes. Vague merchant codes (Walmart, Target, Amazon) get flagged for a check.
- Subscription detection: same merchant, same amount, 25 to 35 days apart.
- Cash logging debits the envelope like a swipe, then sends the matching amount back to the linked bank.
- Recurring auto-transfers, transfers out, and warnings at 80% and 100%.
- A demo clock (+1 day, +1 week) moves time forward so ACH lands, holds settle, subscriptions renew, the physical card arrives, and periods reset.
- Light and dark themes, and layouts down to phone width.

All state lives in the browser's localStorage (`fin-state-v2`). Nothing is sent anywhere.

## Code map

- `src/engine/ledger.ts`: assign, move, authorize, settle, cover-and-retry, reassign/split, cash, transfers. Pure functions from state to state.
- `src/engine/clock.ts`: the demo clock, period rollover, trailing income average.
- `src/engine/categorize.ts`: envelope suggestion, learning from corrections, recurring charge detection.
- `src/engine/presets.ts`: preset definitions and percent-of-income math.
- `src/engine/seed.ts`: the demo account. It's built by replaying activity through the engine, not by typing in balances.
- `src/engine/totp.ts`: TOTP via WebCrypto.
- `src/views/*`: screens. `src/store.tsx`: state container and persistence.

Money is integer cents everywhere.

## Deploying to finforfinance.com

`.github/workflows/deploy.yml` builds, tests, and publishes to GitHub Pages on every push to `main`. `public/CNAME` already contains `finforfinance.com`.

1. In the repo on GitHub, open Settings, then Pages, and set Source to "GitHub Actions".
2. At the domain registrar, add these DNS records:
   - `A` records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` for `www`: `dollrockjean.github.io`
3. Merge to `main`. When the deploy finishes, go back to Settings, then Pages, confirm the custom domain, and tick "Enforce HTTPS" once the certificate is issued (it can take up to an hour).

Any other static host works too (Netlify, Vercel, Cloudflare Pages). Use `npm run build` as the build command and `dist` as the output directory.

## Going from proof of concept to product

What each simulated piece becomes:

| Here | Production |
| --- | --- |
| `authorize()` | Stripe Issuing `issuing_authorization.request` webhook. It calls the same function against the server-side ledger and approves or declines. |
| Fin account balance | Stripe Treasury financial account (FDIC pass-through through the partner bank) |
| Plaid Link modal, ACH timing | Plaid Auth for account and routing numbers, Treasury inbound transfers for ACH |
| Identity step | Stripe Identity or the issuing partner's KYC |
| Card details modal | Stripe Issuing Elements, so raw card numbers never reach Fin's servers |
| localStorage | A server-side database, encrypted at rest, with access logging (GLBA) |

The engine functions are pure and have no browser dependencies, so they can move to a server as-is.
