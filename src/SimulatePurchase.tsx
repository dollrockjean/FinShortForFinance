import React, { useEffect, useRef, useState } from "react";
import { suggestedCategory, useStore } from "./store";
import { CATEGORIES, MERCHANTS, categoryLabel, findMerchant } from "./data";
import { CategoryId, TransactionStatus } from "./types";
import { Modal } from "./ui";
import { envelopeAvailable, money } from "./utils";

type Outcome = { status: TransactionStatus; merchant: string; amount: number; category: CategoryId; reason?: string };

export default function SimulatePurchase() {
  const { state, dispatch } = useStore();
  const [merchantName, setMerchantName] = useState<string | null>(null);
  const [customMerchant, setCustomMerchant] = useState("");
  const [category, setCategory] = useState<CategoryId | "">("");
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState("");
  const [openDeclineId, setOpenDeclineId] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<Outcome | null>(null);
  const prevTopId = useRef<string | null>(state.transactions[0]?.id ?? null);

  useEffect(() => {
    const top = state.transactions[0];
    if (top && top.id !== prevTopId.current) {
      prevTopId.current = top.id;
      setLastOutcome({ status: top.status, merchant: top.merchant, amount: top.amount, category: top.category, reason: top.declineReason });
      if (top.status === "declined") setOpenDeclineId(top.id);
    }
  }, [state.transactions]);

  const merchant = merchantName ? findMerchant(merchantName) : undefined;
  const isCustom = merchantName === "__custom__";
  const effectiveName = isCustom ? customMerchant.trim() : merchantName ?? "";

  function pickMerchant(name: string) {
    setMerchantName(name);
    setLastOutcome(null);
    const m = findMerchant(name);
    if (!m) return;
    setAmount(m.fixedAmount ?? Math.round((m.minAmount + m.maxAmount) / 2));
    setCategory(m.ambiguous ? "" : suggestedCategory(name, state.merchantCategoryBias));
  }

  function pickCustom() {
    setMerchantName("__custom__");
    setCustomMerchant("");
    setAmount(20);
    setCategory("");
    setLastOutcome(null);
  }

  const canSwipe = effectiveName.length > 0 && category !== "" && amount > 0;

  function swipe() {
    if (!canSwipe) return;
    dispatch({
      type: "SWIPE_CARD",
      merchant: effectiveName,
      category: category as CategoryId,
      amount,
      isHold: merchant?.isPreAuthHold,
      holdAmount: merchant?.holdAmount,
    });
  }

  const declinedTx = state.transactions.find((t) => t.id === openDeclineId);
  const declinedEnvelope = declinedTx ? state.envelopes.find((e) => e.category === declinedTx.category) : undefined;
  const availableInDeclinedCategory = declinedEnvelope ? Math.max(0, envelopeAvailable(declinedEnvelope)) : 0;
  const shortfall = declinedTx ? Math.round((declinedTx.amount - availableInDeclinedCategory) * 100) / 100 : 0;
  const emergency = state.envelopes.find((e) => e.category === "emergency");
  const canCover = declinedTx && emergency ? envelopeAvailable(emergency) >= shortfall : false;

  return (
    <div>
      <h2>Simulate a purchase</h2>
      <p>Pick a merchant and an amount, then swipe. This is the actual mechanism: the card can only pull from an envelope's balance.</p>

      <div className="section-title">Merchant</div>
      <div className="choice-grid">
        {MERCHANTS.map((m) => (
          <button key={m.name} className={`choice-tile ${merchantName === m.name ? "selected" : ""}`} onClick={() => pickMerchant(m.name)}>
            <div className="label">{m.name}</div>
            <div className="sub">{m.mccLabel}</div>
          </button>
        ))}
        <button className={`choice-tile ${isCustom ? "selected" : ""}`} onClick={pickCustom}>
          <div className="label">Custom merchant</div>
          <div className="sub">Type your own</div>
        </button>
      </div>

      {merchantName && (
        <div className="card" style={{ marginTop: 14 }}>
          {isCustom && (
            <div className="field">
              <label>Merchant name</label>
              <input value={customMerchant} onChange={(e) => setCustomMerchant(e.target.value)} placeholder="Corner Deli" />
            </div>
          )}

          {merchant?.ambiguous && (
            <div className="info-box" style={{ marginBottom: 12 }}>
              <p>
                {merchant.name}'s merchant code ({merchant.mccLabel}) covers more than one real category. Auto-tagging can't be
                trusted here, so pick the right one.
              </p>
            </div>
          )}

          {merchant?.isPreAuthHold && (
            <div className="info-box" style={{ marginBottom: 12 }}>
              <p>
                Pumps and hotels pre-authorize more than the final charge. This will place a ${merchant.holdAmount} hold and
                settle to the actual amount later — check it under Transactions.
              </p>
            </div>
          )}

          <div className="two-col">
            <div className="field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
                <option value="">Choose category</option>
                {CATEGORIES.filter((c) => c.spendable).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Amount</label>
              <input type="number" value={amount} min={0} step={0.01} onChange={(e) => setAmount(Number(e.target.value))} disabled={!!merchant?.fixedAmount} />
            </div>
          </div>

          {category !== "" && (() => {
            const env = state.envelopes.find((e) => e.category === category);
            if (!env) return null;
            const avail = envelopeAvailable(env);
            const required = merchant?.isPreAuthHold ? merchant.holdAmount ?? amount : amount;
            return (
              <p className="hint">
                {categoryLabel(category)}: {money(avail)} available. This {merchant?.isPreAuthHold ? "hold" : "purchase"} needs {money(required)}.
              </p>
            );
          })()}

          <button className="btn btn-primary btn-block" disabled={!canSwipe} onClick={swipe}>
            Swipe Fin card — {money(amount)}
          </button>
        </div>
      )}

      {lastOutcome && lastOutcome.status !== "declined" && (
        <div className="info-box" style={{ marginTop: 14 }}>
          <p>
            {lastOutcome.status === "pending" ? "Approved, pending settlement" : "Approved"} — {lastOutcome.merchant},{" "}
            {money(lastOutcome.amount)} from {categoryLabel(lastOutcome.category)}.
          </p>
        </div>
      )}

      {openDeclineId && declinedTx && (
        <Modal onClose={() => setOpenDeclineId(null)}>
          <h3 style={{ color: "var(--red)" }}>Declined</h3>
          <p>
            {declinedTx.merchant} for {money(declinedTx.amount)} was declined. {categoryLabel(declinedTx.category)} only has{" "}
            {money(availableInDeclinedCategory)} left — short by {money(shortfall)}.
          </p>
          <div className="field">
            <label>Note (why cover it)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
          <div className="stack-gap">
            <button
              className="btn btn-primary btn-block"
              disabled={!canCover}
              onClick={() => {
                dispatch({ type: "OVERRIDE_DECLINE", txId: declinedTx.id, note });
                setOpenDeclineId(null);
                setNote("");
              }}
            >
              {canCover ? `Cover ${money(shortfall)} from emergency fund` : "Not enough in emergency fund to cover"}
            </button>
            <button className="btn btn-secondary btn-block" onClick={() => setOpenDeclineId(null)}>
              Leave it declined
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
