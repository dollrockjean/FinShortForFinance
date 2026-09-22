import React, { useState } from "react";
import { useStore } from "./store";
import { CATEGORIES, categoryLabel } from "./data";
import { CategoryId } from "./types";
import { formatDate, money } from "./utils";

export default function Transactions() {
  const { state, dispatch } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  return (
    <div>
      <div className="row-between">
        <h2>Transactions</h2>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowManual((s) => !s)}>
          {showManual ? "Close" : "+ Add cash expense"}
        </button>
      </div>
      <p>Cash spending never touches the card, so it can't be blocked — log it here to keep the budget honest.</p>

      {showManual && <ManualExpenseForm onDone={() => setShowManual(false)} />}

      <div className="card">
        {state.transactions.length === 0 && <p>No transactions yet.</p>}
        {state.transactions.map((t) => (
          <div key={t.id}>
            <div className="tx-row" style={{ cursor: t.status === "declined" ? "default" : "pointer" }} onClick={() => t.status !== "declined" && setOpenId(openId === t.id ? null : t.id)}>
              <div className="tx-main">
                <span className="tx-merchant">{t.merchant}</span>
                <span className="tx-meta">
                  {t.splits ? t.splits.map((s) => `${categoryLabel(s.category)} ${money(s.amount)}`).join(" + ") : categoryLabel(t.category)}
                  {" · "}
                  {formatDate(t.date)}
                  {t.source === "manual" && " · cash"}
                  {t.status === "pending" && " · pending hold"}
                  {t.status === "declined" && " · declined"}
                  {t.overrideFrom && " · covered from emergency fund"}
                </span>
                {t.declineReason && <span className="tx-meta" style={{ color: "var(--red)" }}>{t.declineReason}</span>}
              </div>
              <span className={`tx-amount ${t.status === "declined" ? "declined" : "negative"}`}>{money(-t.amount)}</span>
            </div>
            {openId === t.id && t.status === "pending" && <SettleForm txId={t.id} defaultAmount={t.amount} onDone={() => setOpenId(null)} />}
            {openId === t.id && t.status === "approved" && <RecategorizeForm txId={t.id} tx={t} onDone={() => setOpenId(null)} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettleForm({ txId, defaultAmount, onDone }: { txId: string; defaultAmount: number; onDone: () => void }) {
  const { dispatch } = useStore();
  const [amount, setAmount] = useState(defaultAmount);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <p>This was a pending hold. Enter the final settled amount to release the rest of the hold back to the envelope.</p>
      <div className="two-col">
        <input type="number" value={amount} min={0} step={0.01} onChange={(e) => setAmount(Number(e.target.value))} />
        <button
          className="btn btn-primary"
          onClick={() => {
            dispatch({ type: "SETTLE_TRANSACTION", txId, finalAmount: amount });
            onDone();
          }}
        >
          Settle
        </button>
      </div>
    </div>
  );
}

function RecategorizeForm({ txId, tx, onDone }: { txId: string; tx: { amount: number; category: CategoryId }; onDone: () => void }) {
  const { dispatch } = useStore();
  const [splitMode, setSplitMode] = useState(false);
  const [category, setCategory] = useState<CategoryId>(tx.category);
  const [splits, setSplits] = useState<{ category: CategoryId; amount: number }[]>([
    { category: tx.category, amount: tx.amount },
    { category: "shopping", amount: 0 },
  ]);

  const splitTotal = splits.reduce((s, x) => s + x.amount, 0);
  const splitValid = Math.abs(splitTotal - tx.amount) < 0.01;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row-between">
        <span className="section-title" style={{ margin: 0 }}>{splitMode ? "Split transaction" : "Recategorize"}</span>
        <button className="muted-link" onClick={() => setSplitMode((s) => !s)}>
          {splitMode ? "Use one category instead" : "Split across categories instead"}
        </button>
      </div>

      {!splitMode && (
        <>
          <div className="field">
            <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
              {CATEGORIES.filter((c) => c.spendable).map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              dispatch({ type: "REASSIGN_TRANSACTION", txId, splits: [{ category, amount: tx.amount }] });
              onDone();
            }}
          >
            Save
          </button>
        </>
      )}

      {splitMode && (
        <>
          {splits.map((s, i) => (
            <div className="two-col" key={i} style={{ marginBottom: 8 }}>
              <select
                value={s.category}
                onChange={(e) => {
                  const next = [...splits];
                  next[i] = { ...next[i], category: e.target.value as CategoryId };
                  setSplits(next);
                }}
              >
                {CATEGORIES.filter((c) => c.spendable).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={s.amount}
                min={0}
                step={0.01}
                onChange={(e) => {
                  const next = [...splits];
                  next[i] = { ...next[i], amount: Number(e.target.value) };
                  setSplits(next);
                }}
              />
            </div>
          ))}
          <p className="hint">
            {money(splitTotal)} of {money(tx.amount)} assigned
            {!splitValid && " — needs to add up exactly"}
          </p>
          <button className="btn btn-primary" disabled={!splitValid} onClick={() => {
            dispatch({ type: "REASSIGN_TRANSACTION", txId, splits });
            onDone();
          }}>
            Save split
          </button>
        </>
      )}
    </div>
  );
}

function ManualExpenseForm({ onDone }: { onDone: () => void }) {
  const { dispatch } = useStore();
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<CategoryId>("groceries");
  const [amount, setAmount] = useState(10);
  const valid = merchant.trim().length > 0 && amount > 0;

  return (
    <div className="card">
      <div className="field">
        <label>Where</label>
        <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Farmers market" />
      </div>
      <div className="two-col">
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
            {CATEGORIES.filter((c) => c.spendable).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Amount</label>
          <input type="number" value={amount} min={0} step={0.01} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
      </div>
      <button
        className="btn btn-primary"
        disabled={!valid}
        onClick={() => {
          dispatch({ type: "ADD_MANUAL_EXPENSE", merchant: merchant.trim(), category, amount });
          setMerchant("");
          setAmount(10);
          onDone();
        }}
      >
        Log it
      </button>
    </div>
  );
}
