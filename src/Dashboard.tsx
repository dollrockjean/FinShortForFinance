import React from "react";
import { useStore } from "./store";
import { categoryLabel } from "./data";
import { ProgressBar } from "./ui";
import { envelopeAvailable, formatDate, money, pct, progressClass } from "./utils";

export default function Dashboard() {
  const { state, dispatch } = useStore();
  const spendable = state.envelopes.filter((e) => e.category !== "unassigned");
  const unassigned = state.envelopes.find((e) => e.category === "unassigned");
  const totalBalance = state.envelopes.reduce((sum, e) => sum + envelopeAvailable(e), 0);
  const recent = state.transactions.slice(0, 6);

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 2 }}>Total available</p>
        <h1 style={{ fontSize: 34 }}>{money(totalBalance)}</h1>
        {state.card && (
          <div className="row-between" style={{ marginTop: 6 }}>
            <span className="badge badge-green">Card active •••• {state.card.last4}</span>
            {unassigned && unassigned.allocated > 0 && (
              <span className="badge badge-amber">{money(unassigned.allocated)} unassigned</span>
            )}
          </div>
        )}
      </div>

      <div className="row-between">
        <div className="section-title" style={{ margin: 0 }}>Envelopes</div>
        <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "SET_VIEW", view: "simulate" })}>
          Simulate a purchase
        </button>
      </div>
      <div className="envelope-grid">
        {spendable.map((e) => {
          const p = pct(e.spent + e.pendingHold, e.allocated);
          const cls = progressClass(e.spent + e.pendingHold, e.allocated);
          return (
            <div className="card envelope-card" key={e.category}>
              <div className="envelope-head">
                <h3 style={{ fontSize: 15 }}>{categoryLabel(e.category)}</h3>
                <span className={`badge ${cls === "red" ? "badge-red" : cls === "amber" ? "badge-amber" : "badge-green"}`}>
                  {money(envelopeAvailable(e))} left
                </span>
              </div>
              <ProgressBar pct={p} cls={cls} />
              <div className="envelope-amounts">
                <span>{money(e.spent)} spent</span>
                <span>of {money(e.allocated)}</span>
              </div>
              {e.pendingHold > 0 && <span className="badge badge-muted">{money(e.pendingHold)} on hold</span>}
            </div>
          );
        })}
      </div>

      <div className="section-title">Recent activity</div>
      <div className="card">
        {recent.length === 0 && <p>Nothing yet. Try simulating a purchase.</p>}
        {recent.map((t) => (
          <div className="tx-row" key={t.id}>
            <div className="tx-main">
              <span className="tx-merchant">{t.merchant}</span>
              <span className="tx-meta">
                {categoryLabel(t.category)} · {formatDate(t.date)}
                {t.status === "declined" && " · declined"}
                {t.status === "pending" && " · pending hold"}
                {t.overrideFrom && " · covered from emergency fund"}
              </span>
            </div>
            <span className={`tx-amount ${t.status === "declined" ? "declined" : "negative"}`}>
              {money(-t.amount)}
            </span>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => dispatch({ type: "SET_VIEW", view: "transactions" })}>
          View all transactions
        </button>
      </div>
    </div>
  );
}

