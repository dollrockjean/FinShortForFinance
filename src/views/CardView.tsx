import { useState } from "react";
import { useStore } from "../store";
import { Cents, Transaction } from "../types";
import { MCC, MERCHANTS, findMerchant } from "../engine/catalog";
import { suggestEnvelope } from "../engine/categorize";
import { authorize, available } from "../engine/ledger";
import { newCard } from "../engine/seed";
import { addDays, fmt, fmtDate } from "../engine/util";
import { ErrorText, Field, FinMark, Modal, MoneyInput, Toggle } from "../components/ui";
import { DeclineModal } from "../components/Decline";

export default function CardView() {
  const { state, set } = useStore();
  const card = state.card;
  const [details, setDetails] = useState(false);
  const [activating, setActivating] = useState(false);

  if (!card) {
    return (
      <div className="page">
        <h1>Card</h1>
        <button className="btn btn-primary" onClick={() => set({ card: newCard(state.now) })}>
          Issue a virtual card
        </button>
      </div>
    );
  }

  const frozen = card.status === "frozen";
  const p = card.physical;

  return (
    <div className="page">
      <h1>Card</h1>
      <div className="two-col">
        <section>
          <div className={`fin-card ${frozen ? "frozen" : ""}`}>
            <div className="row">
              <span className="fin-card-brand">
                <FinMark size={22} /> Fin
              </span>
              <span className="small">{frozen ? "Frozen" : "Debit"}</span>
            </div>
            <div className="fin-card-number">•••• •••• •••• {card.last4}</div>
            <div className="row small">
              <span>{state.kyc.legalName ?? state.user?.name}</span>
              <span>{card.expiry}</span>
            </div>
          </div>
          <div className="grid-2 top-gap">
            <button className="btn btn-outline" onClick={() => set({ card: { ...card, status: frozen ? "active" : "frozen" } })}>
              {frozen ? "Unfreeze" : "Freeze card"}
            </button>
            <button className="btn btn-outline" onClick={() => setDetails(true)}>
              Card details
            </button>
          </div>

          <div className="card top-gap">
            <Toggle checked={card.blockGambling} onChange={(v) => set({ card: { ...card, blockGambling: v } })} label="Block gambling merchants (MCC 7995)" />
            <p className="small muted">Checked on every authorization, before any envelope. A real build can block other merchant categories the same way.</p>
          </div>

          <div className="card top-gap">
            <strong>Physical card</strong>
            {!p && (
              <>
                <p className="small muted">Same number rules, same envelopes. Arrives in about a week.</p>
                <button className="btn btn-outline btn-block" onClick={() => set({ card: { ...card, physical: { status: "shipping", orderedAt: state.now, arrivesAt: addDays(state.now, 7) } } })}>
                  Order a physical card
                </button>
              </>
            )}
            {p?.status === "shipping" && <p className="small muted">In the mail. Expected {fmtDate(p.arrivesAt)}. Move the demo clock forward to get it.</p>}
            {p?.status === "delivered" && (
              <>
                <p className="small muted">Delivered. Activate it before using it.</p>
                <button className="btn btn-primary btn-block" onClick={() => setActivating(true)}>
                  Activate
                </button>
              </>
            )}
            {p?.status === "active" && <p className="small muted">Active.</p>}
          </div>
        </section>

        <section>
          <PayFrom />
          <Terminal />
        </section>
      </div>

      {details && (
        <Modal title="Card details" onClose={() => setDetails(false)}>
          <div className="kv">
            <span>Number</span>
            <span>•••• •••• •••• {card.last4}</span>
            <span>Expires</span>
            <span>{card.expiry}</span>
            <span>CVC</span>
            <span>•••</span>
          </div>
          <p className="small muted top-gap">
            In production the full number and CVC render inside the card issuer's hosted component (Stripe Issuing Elements), in an iframe Fin's own code can't read. Fin never stores or
            sees a raw card number, which keeps it out of most PCI scope. This demo has no real number to show.
          </p>
        </Modal>
      )}
      {activating && <Activate onClose={() => setActivating(false)} />}
    </div>
  );
}

function Activate({ onClose }: { onClose: () => void }) {
  const { state, set } = useStore();
  const [digits, setDigits] = useState("");
  const card = state.card!;
  return (
    <Modal title="Activate your card" onClose={onClose}>
      <Field label="Last 4 digits on the card" hint={`Demo: it's ${card.last4}.`}>
        <input value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" />
      </Field>
      <button
        className="btn btn-primary btn-block"
        disabled={digits !== card.last4}
        onClick={() => {
          set({ card: { ...card, physical: { ...card.physical!, status: "active" } } });
          onClose();
        }}
      >
        Activate
      </button>
    </Modal>
  );
}

function PayFrom() {
  const { state, set } = useStore();
  const spendable = state.envelopes.filter((e) => e.cardSpendable);
  return (
    <div className="card">
      <strong>Next purchase comes out of</strong>
      <p className="small muted">Leave it on automatic and Fin picks by merchant type and what you've taught it. At a store that sells everything, pick here before you pay.</p>
      <select value={state.nextPurchaseEnvelopeId ?? ""} onChange={(e) => set({ nextPurchaseEnvelopeId: e.target.value || null })} aria-label="Envelope for next purchase">
        <option value="">Automatic</option>
        {spendable.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} ({fmt(available(e))})
          </option>
        ))}
      </select>
    </div>
  );
}

function Terminal() {
  const { state, act } = useStore();
  const [merchant, setMerchant] = useState("Whole Foods Market");
  const [custom, setCustom] = useState("");
  const [mcc, setMcc] = useState("5411");
  const [amount, setAmount] = useState<Cents>(4500);
  const [result, setResult] = useState<Transaction | null>(null);
  const [declined, setDeclined] = useState<Transaction | null>(null);
  const [error, setError] = useState<string>();

  const isCustom = merchant === "__custom";
  const m = isCustom ? undefined : findMerchant(merchant);
  const name = isCustom ? custom.trim() : merchant;
  const code = m?.mcc ?? mcc;
  const suggestion = suggestEnvelope(state, name || "?", code);
  const chosen = state.nextPurchaseEnvelopeId ? state.envelopes.find((e) => e.id === state.nextPurchaseEnvelopeId) : suggestion.envelope;
  const needed = m?.hold ?? amount;

  function pick(n: string) {
    setMerchant(n);
    setResult(null);
    const mm = findMerchant(n);
    if (mm) setAmount(mm.fixed ?? Math.round((mm.typical[0] + mm.typical[1]) / 200) * 100);
  }

  function tap() {
    const r = act((s) => authorize(s, { merchant: name, mcc: code, amount, hold: m?.hold }));
    if (r.error) return setError(r.error);
    setError(undefined);
    const tx = r.state.transactions.find((t) => t.id === r.txId);
    if (!tx) return;
    if (tx.status === "declined") {
      setResult(null);
      setDeclined(tx);
    } else setResult(tx);
  }

  return (
    <div className="card top-gap terminal">
      <div className="row">
        <strong>Test terminal</strong>
        <span className="small muted">Simulates a real card swipe</span>
      </div>
      <Field label="Merchant">
        <select value={merchant} onChange={(e) => pick(e.target.value)}>
          {MERCHANTS.map((x) => (
            <option key={x.name} value={x.name}>
              {x.name}
            </option>
          ))}
          <option value="__custom">Somewhere else...</option>
        </select>
      </Field>
      {isCustom && (
        <div className="grid-2">
          <Field label="Name">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Corner deli" />
          </Field>
          <Field label="Merchant code">
            <select value={mcc} onChange={(e) => setMcc(e.target.value)}>
              {Object.entries(MCC).map(([k, v]) => (
                <option key={k} value={k}>
                  {k} {v.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <Field label={m?.hold ? "Final charge (after the hold)" : "Amount"}>
        <MoneyInput value={amount} onChange={setAmount} />
      </Field>
      <div className="terminal-info small">
        <div>
          Merchant code {code} · {MCC[code]?.label ?? "Unknown"}
          {MCC[code]?.ambiguous && <span className="tag tag-attn">covers several kinds of spending</span>}
        </div>
        <div>
          Fin will charge: <strong>{chosen?.name ?? "no matching envelope"}</strong>
          {chosen && ` (${fmt(available(chosen))} free)`}
        </div>
        {(state.nextPurchaseEnvelopeId || !suggestion.reason.startsWith("Merchant code")) && (
          <div className="muted">{state.nextPurchaseEnvelopeId ? "You picked this envelope above." : suggestion.reason}</div>
        )}
        {m?.hold && <div className="muted">This merchant pre-authorizes {fmt(m.hold)}. The envelope needs that much free until it settles.</div>}
      </div>
      <ErrorText>{error}</ErrorText>
      <button
        className="btn btn-primary btn-block btn-lg"
        disabled={!name || amount <= 0}
        onClick={tap}
      >
        Tap to pay {fmt(m?.hold ? needed : amount)}
        {m?.hold ? " hold" : ""}
      </button>
      {result && (
        <div className="note ok-note top-gap" role="status">
          <strong>Approved.</strong> {result.merchant}, {fmt(result.status === "pending" ? result.holdAmount ?? result.amount : result.amount)}
          {result.status === "pending" ? " held" : ""} from {state.envelopes.find((e) => e.id === result.allocations[0]?.envelopeId)?.name}.
          {!result.confirmed && " The merchant code is vague, so check the envelope in Activity."}
        </div>
      )}
      {declined && <DeclineModal tx={declined} onClose={() => setDeclined(null)} />}
    </div>
  );
}
