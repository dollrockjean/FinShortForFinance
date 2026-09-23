import { CalendarClock, Hourglass, ShieldAlert } from "lucide-react";
import { useStore } from "../store";
import { Envelope, Transaction } from "../types";
import { available, usage } from "../engine/ledger";
import { fmt, fmtDate } from "../engine/util";
import { KindBadge, MerchantAvatar, kindStyle } from "./meta";
import { Progress, StatusPill, toneFor } from "./ui";

export function envStatus(e: Envelope) {
  if (!e.cardSpendable) return { status: "neutral" as const, label: e.target && e.fundedThisPeriod >= e.target ? "Funded" : "Saving" };
  const u = usage(e);
  if (u >= 1) return { status: "critical" as const, label: "Empty" };
  if (u >= 0.8) return { status: "warning" as const, label: `${Math.round(u * 100)}% used` };
  return { status: "good" as const, label: "On track" };
}

export function EnvelopeCard({ e, onClick }: { e: Envelope; onClick?: () => void }) {
  const u = usage(e);
  const st = envStatus(e);
  return (
    <button className="env-card" style={kindStyle(e.kind)} onClick={onClick}>
      <div className="env-card-top">
        <KindBadge kind={e.kind} size={34} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="env-card-name">{e.name}</div>
          <div className="xs muted">{e.cadence === "weekly" ? "Resets Monday" : "Monthly"}</div>
        </div>
        <StatusPill status={st.status}>{st.label}</StatusPill>
      </div>
      <div>
        <div className="env-card-amount">{fmt(available(e))}</div>
        <div className="xs muted">{e.cardSpendable ? "left to spend" : "saved"}</div>
      </div>
      {e.cardSpendable ? <Progress value={u} tone={toneFor(u)} /> : <Progress value={e.target ? e.fundedThisPeriod / e.target : 1} tone="ok" />}
      <div className="env-card-foot">
        <span>
          {e.cardSpendable ? `${fmt(e.spentThisPeriod)} of ${fmt(e.spentThisPeriod + e.balance)}` : `${fmt(e.fundedThisPeriod)} of ${fmt(e.target)} this month`}
        </span>
        {e.held > 0 && (
          <span className="t-warn" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <Hourglass size={12} /> {fmt(e.held)}
          </span>
        )}
      </div>
    </button>
  );
}

export function envelopeNames(tx: Transaction, envelopes: Envelope[]): string {
  if (tx.allocations.length === 0) return "No envelope";
  return tx.allocations.map((a) => envelopes.find((e) => e.id === a.envelopeId)?.name ?? "Deleted envelope").join(" + ");
}

export function txStatus(tx: Transaction) {
  if (tx.status === "declined") return <StatusPill status="critical">Declined</StatusPill>;
  if (tx.status === "pending") return <StatusPill status="warning">Pending</StatusPill>;
  if (!tx.confirmed) return <StatusPill status="info">Check category</StatusPill>;
  return null;
}

export function TxRow({ tx, onClick, showDate = true }: { tx: Transaction; onClick?: () => void; showDate?: boolean }) {
  const { state } = useStore();
  const first = state.envelopes.find((e) => e.id === tx.allocations[0]?.envelopeId);
  return (
    <button className="tx-row" onClick={onClick}>
      <MerchantAvatar name={tx.merchant} mcc={tx.mcc} cash={tx.source === "manual"} />
      <div className="tx-main">
        <span className="tx-merchant">{tx.merchant}</span>
        <span className="tx-sub">
          {first && (
            <span className="chip chip-c" style={kindStyle(first.kind)}>
              <span className="dot-c" />
              {envelopeNames(tx, state.envelopes)}
            </span>
          )}
          {!first && <span className="chip">No envelope</span>}
          {showDate && <span>{fmtDate(tx.createdAt)}</span>}
          {tx.source === "manual" && <span>Cash</span>}
          {tx.override && (
            <span className="t-warn" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <ShieldAlert size={12} /> {fmt(tx.override.amount)} from emergency
            </span>
          )}
          {tx.status === "pending" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <CalendarClock size={12} /> holding {fmt(tx.holdAmount ?? tx.amount)}
            </span>
          )}
        </span>
      </div>
      <div className="tx-right">
        <span className={`tx-amt ${tx.status}`}>-{fmt(tx.amount)}</span>
        {txStatus(tx)}
      </div>
    </button>
  );
}

export function EnvName({ e }: { e: Envelope }) {
  return (
    <span className="row gap" style={{ gap: 8 }}>
      <KindBadge kind={e.kind} size={24} />
      {e.name}
    </span>
  );
}
