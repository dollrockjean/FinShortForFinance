import { useState } from "react";
import { useStore } from "../store";
import { freshState, demoState } from "../engine/seed";
import { Segmented } from "../components/ui";

export default function Settings() {
  const { state, set } = useStore();
  const [confirm, setConfirm] = useState(false);
  const sec = state.security;

  return (
    <div className="page narrow-page">
      <h1>Settings</h1>

      <div className="card">
        <strong>Appearance</strong>
        <div className="top-gap">
          <Segmented
            label="Theme"
            value={state.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: "system", label: "Match device" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
      </div>

      <div className="card top-gap">
        <strong>Account</strong>
        <div className="kv top-gap">
          <span>Name</span>
          <span>{state.user?.name}</span>
          <span>Email</span>
          <span>
            {state.user?.email} {sec.emailVerified && <span className="tag">verified</span>}
          </span>
          <span>Sign-in</span>
          <span>{state.user?.provider === "password" ? "Email and password" : state.user?.provider === "google" ? "Google" : "Apple"}</span>
          <span>Two-factor</span>
          <span>{sec.twoFactor === "totp" ? "Authenticator app" : sec.twoFactor === "sms" ? `Text message to ${sec.smsPhone}` : "Off"}</span>
          <span>Identity</span>
          <span>{state.kyc.status === "verified" ? `Verified, SSN ending ${state.kyc.ssnLast4}` : state.kyc.status}</span>
          <span>Funding bank</span>
          <span>{state.bank ? `${state.bank.institution} •••• ${state.bank.mask}` : "None"}</span>
        </div>
        {sec.twoFactor === "sms" && <p className="small muted top-gap">Text codes can be stolen with a SIM swap. Switching to an authenticator app is worth the two minutes.</p>}
      </div>

      <div className="card top-gap">
        <strong>What's real in this proof of concept</strong>
        <p className="small">
          The budgeting engine is real: zero-based assignment, envelope-level card enforcement, pending holds, the emergency-fund override, split and recategorized transactions, learning from
          corrections, subscription detection, period rollover, and irregular-income averaging all run on the same rules a live version would. So does the two-factor code (standard TOTP).
        </p>
        <p className="small">
          Simulated: email delivery, OAuth, identity checks, Plaid bank linking, ACH timing (the demo clock), card issuance, and the card network. In production these are Stripe Identity,
          Plaid Auth, Stripe Treasury for the account, and Stripe Issuing with its real-time authorization webhook doing what the Test terminal does here.
        </p>
        <p className="small muted">Everything is stored in this browser's local storage. Nothing is sent anywhere.</p>
      </div>

      <div className="card top-gap">
        <strong>Start over</strong>
        <p className="small muted">Wipes this browser's Fin data.</p>
        {!confirm ? (
          <div className="grid-2">
            <button className="btn btn-outline" onClick={() => set(demoState())}>
              Reload demo account
            </button>
            <button className="btn btn-danger-outline" onClick={() => setConfirm(true)}>
              Erase everything
            </button>
          </div>
        ) : (
          <div className="grid-2">
            <button className="btn btn-outline" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={() => set(freshState())}>
              Yes, erase it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
