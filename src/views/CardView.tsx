import { useState } from "react";
import { Dices, Eye, Lock, Mailbox, Package, PackageCheck, ShieldCheck, Snowflake, Sparkles, Wifi, Zap } from "lucide-react";
import { useStore } from "../store";
import { newCard } from "../engine/seed";
import { available } from "../engine/ledger";
import { addDays, fmt, fmtDate, sum } from "../engine/util";
import { Callout, Dropdown, Field, FinMark, Modal, StatusPill, Toggle, useToast } from "../components/ui";
import { envelopeOptions, useUi } from "../components/options";

export function FinCard({ last4, name, expiry, frozen }: { last4: string; name?: string; expiry: string; frozen?: boolean }) {
  return (
    <div className={`fin-card ${frozen ? "frozen" : ""}`}>
      <div className="shine" />
      <svg className="watermark" width="220" height="220" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M4 26 C8 18 13 8 22 4 C18 12 20 22 27 26 Z" stroke="#fff" strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
      <div className="row">
        <span className="fin-card-brand">
          <FinMark size={24} color="#8fe0b4" /> Fin
        </span>
        <span className="row gap" style={{ gap: 6, fontSize: 12, opacity: 0.85 }}>
          {frozen ? (
            <>
              <Snowflake size={14} /> Frozen
            </>
          ) : (
            <Wifi size={18} style={{ transform: "rotate(90deg)" }} />
          )}
        </span>
      </div>
      <div className="fin-card-chip" />
      <div className="fin-card-number">•••• •••• •••• {last4}</div>
      <div className="fin-card-foot">
        <span>{name}</span>
        <span>
          <span style={{ opacity: 0.6, marginRight: 6 }}>Exp</span>
          {expiry}
        </span>
      </div>
    </div>
  );
}

export default function CardView() {
  const { state, set } = useStore();
  const toast = useToast();
  const { openPayments } = useUi();
  const card = state.card;
  const [details, setDetails] = useState(false);
  const [activating, setActivating] = useState(false);

  if (!card) {
    return (
      <div className="card center">
        <button className="btn btn-primary" onClick={() => set({ card: newCard(state.now) })}>
          Issue a virtual card
        </button>
      </div>
    );
  }

  const frozen = card.status === "frozen";
  const p = card.physical;
  const spendable = state.envelopes.filter((e) => e.cardSpendable);
  const spentMonth = sum(state.transactions.filter((t) => t.source === "card" && t.status === "settled" && t.createdAt.slice(0, 7) === state.now.slice(0, 7)).map((t) => t.amount));
  const declinedMonth = state.transactions.filter((t) => t.status === "declined" && t.createdAt.slice(0, 7) === state.now.slice(0, 7)).length;

  return (
    <div className="page-grid">
      <div>
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, background: "linear-gradient(180deg, var(--surface-2), var(--surface))" }}>
          <FinCard last4={card.last4} expiry={card.expiry} name={state.kyc.legalName ?? state.user?.name} frozen={frozen} />
          <div className="row gap wrap" style={{ justifyContent: "center" }}>
            <button
              className={`btn ${frozen ? "btn-primary" : "btn-outline"}`}
              onClick={() => {
                set({ card: { ...card, status: frozen ? "active" : "frozen" } });
                toast({ status: frozen ? "good" : "info", title: frozen ? "Card unfrozen" : "Card frozen", body: frozen ? undefined : "Every purchase will decline until you unfreeze it" });
              }}
            >
              <Snowflake size={16} /> {frozen ? "Unfreeze" : "Freeze"}
            </button>
            <button className="btn btn-outline" onClick={() => setDetails(true)}>
              <Eye size={16} /> Show details
            </button>
            <button className="btn btn-primary" onClick={() => openPayments("card")}>
              <Zap size={16} /> Test a payment
            </button>
          </div>
        </div>

        <div className="stat-row">
          <div className="stat">
            <div className="label">Card can spend</div>
            <div className="value">{fmt(sum(spendable.map(available)))}</div>
            <div className="sub">Across {spendable.length} envelopes</div>
          </div>
          <div className="stat">
            <div className="label">Spent this month</div>
            <div className="value">{fmt(spentMonth)}</div>
            <div className="sub">Settled card purchases</div>
          </div>
          <div className="stat">
            <div className="label">Declined this month</div>
            <div className="value">{declinedMonth}</div>
            <div className="sub">Stopped by an envelope</div>
          </div>
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-head">
            <h2>
              <Sparkles size={17} /> Next purchase
            </h2>
          </div>
          <Field label="Comes out of" hint="Automatic picks by merchant code and what you've taught Fin. At a store that sells everything, pick an envelope before you pay.">
            <Dropdown
              value={state.nextPurchaseEnvelopeId ?? "auto"}
              onChange={(v) => set({ nextPurchaseEnvelopeId: v === "auto" ? null : v })}
              options={[{ value: "auto", label: "Automatic", description: "Fin decides per purchase", icon: <Sparkles size={16} className="faint" /> }, ...envelopeOptions(spendable)]}
            />
          </Field>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>
              <ShieldCheck size={17} /> Controls
            </h2>
          </div>
          <div className="list">
            <div className="control-row">
              <span className="control-icon">
                <Snowflake size={17} />
              </span>
              <div>
                <strong className="small">Freeze card</strong>
                <div className="xs muted">Declines everything. Undo any time.</div>
              </div>
              <Toggle checked={frozen} onChange={(v) => set({ card: { ...card, status: v ? "frozen" : "active" } })} label="Freeze card" srOnly />
            </div>
            <div className="control-row">
              <span className="control-icon">
                <Dices size={17} />
              </span>
              <div>
                <strong className="small">Block gambling</strong>
                <div className="xs muted">Merchant code 7995, checked before any envelope</div>
              </div>
              <Toggle checked={card.blockGambling} onChange={(v) => set({ card: { ...card, blockGambling: v } })} label="Block gambling" srOnly />
            </div>
            <div className="control-row">
              <span className="control-icon">
                <Lock size={17} />
              </span>
              <div>
                <strong className="small">Envelope enforcement</strong>
                <div className="xs muted">Always on. It's the whole point.</div>
              </div>
              <StatusPill status="good">On</StatusPill>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>
              <Package size={17} /> Physical card
            </h2>
            {p && <StatusPill status={p.status === "active" ? "good" : p.status === "delivered" ? "warning" : "info"}>{p.status === "shipping" ? "In the mail" : p.status === "delivered" ? "Needs activation" : "Active"}</StatusPill>}
          </div>
          {!p && (
            <>
              <p className="small muted">Same number rules, same envelopes. Arrives in about a week{state.kyc.city ? ` at your ${state.kyc.city} address` : ""}.</p>
              <button
                className="btn btn-outline btn-block"
                onClick={() => {
                  set({ card: { ...card, physical: { status: "shipping", orderedAt: state.now, arrivesAt: addDays(state.now, 7) } } });
                  toast({ status: "good", title: "Physical card ordered", body: `Arrives around ${fmtDate(addDays(state.now, 7))}` });
                }}
              >
                <Mailbox size={16} /> Order a physical card
              </button>
            </>
          )}
          {p?.status === "shipping" && <Callout status="info">Expected {fmtDate(p.arrivesAt)}. Move the demo clock forward to get it sooner.</Callout>}
          {p?.status === "delivered" && (
            <button className="btn btn-primary btn-block" onClick={() => setActivating(true)}>
              <PackageCheck size={16} /> Activate
            </button>
          )}
          {p?.status === "active" && <p className="small muted">Active and ready to use.</p>}
        </div>
      </div>

      {details && (
        <Modal title="Card details" onClose={() => setDetails(false)} icon={<span className="quick-icon"><Eye size={17} /></span>}>
          <div className="kv">
            <span>Number</span>
            <span>•••• •••• •••• {card.last4}</span>
            <span>Expires</span>
            <span>{card.expiry}</span>
            <span>CVC</span>
            <span>•••</span>
          </div>
          <div className="top-gap">
            <Callout status="neutral" title="Why nothing more shows here">
              In production the full number and CVC render inside the card issuer's hosted component (Stripe Issuing Elements), in an iframe Fin's own code can't read. Fin never stores or
              sees a raw card number, which keeps it out of most PCI scope. This demo has no real number to show.
            </Callout>
          </div>
        </Modal>
      )}
      {activating && <Activate onClose={() => setActivating(false)} />}
    </div>
  );
}

function Activate({ onClose }: { onClose: () => void }) {
  const { state, set } = useStore();
  const toast = useToast();
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
          toast({ status: "good", title: "Physical card active" });
          onClose();
        }}
      >
        Activate
      </button>
    </Modal>
  );
}
