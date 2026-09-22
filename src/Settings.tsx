import React, { useState } from "react";
import { useStore } from "./store";
import { ThemeToggle } from "./ui";
import { money } from "./utils";

export default function Settings() {
  const { state, dispatch } = useStore();
  const [addAmount, setAddAmount] = useState(100);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div>
      <h2>Settings</h2>

      <div className="section-title">Appearance</div>
      <div className="card row-between">
        <span>Theme</span>
        <ThemeToggle />
      </div>

      <div className="section-title">Account</div>
      <div className="card">
        <div className="row-between">
          <span>Name</span>
          <strong>{state.user?.name ?? "—"}</strong>
        </div>
        <div className="row-between">
          <span>Email</span>
          <strong>{state.user?.email ?? "—"}</strong>
        </div>
        <div className="row-between">
          <span>Linked bank</span>
          <strong>{state.linkedBank ?? "—"}</strong>
        </div>
        {state.testMode && <span className="badge badge-amber" style={{ marginTop: 8 }}>Test mode account</span>}
      </div>

      <div className="section-title">Add funds</div>
      <div className="card">
        <p>Simulates a transfer from your linked bank into your unassigned envelope. Real ACH takes 1-3 business days.</p>
        <div className="two-col">
          <input type="number" value={addAmount} min={0} onChange={(e) => setAddAmount(Number(e.target.value))} />
          <button className="btn btn-primary" onClick={() => dispatch({ type: "ADD_FUNDS", amount: addAmount })}>
            Transfer {money(addAmount)}
          </button>
        </div>
      </div>

      <div className="section-title">What's real vs. simulated here</div>
      <div className="card">
        <p>This build is a proof of concept for the budgeting mechanic, not a working bank product. Specifically simulated:</p>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-muted)", fontSize: 14 }}>
          <li>2FA (shows the code instead of using an authenticator app)</li>
          <li>Identity verification (KYC)</li>
          <li>Bank linking and ACH transfers</li>
          <li>Card issuance and real-time authorization</li>
          <li>Merchant transaction data (a fixed merchant list instead of live card network data)</li>
        </ul>
        <p style={{ marginTop: 10 }}>
          What is real: the budgeting logic itself — zero-based envelope allocation, category-level enforcement, pending vs.
          settled holds, split/recategorization, and the emergency-fund override path all run on the same rules a live
          version would use.
        </p>
      </div>

      <div className="section-title">Reset</div>
      <div className="card">
        <p>Clears all data in this browser and returns to the landing screen.</p>
        {!confirmReset ? (
          <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>Reset demo data</button>
        ) : (
          <div className="two-col">
            <button className="btn btn-secondary" onClick={() => setConfirmReset(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => dispatch({ type: "RESET" })}>Confirm reset</button>
          </div>
        )}
      </div>
    </div>
  );
}
