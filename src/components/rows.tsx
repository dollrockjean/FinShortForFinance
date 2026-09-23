import { useStore } from "../store";
import { Envelope, Transaction } from "../types";
import { available, usage } from "../engine/ledger";
import { fmt, fmtDate } from "../engine/util";
import { Progress, toneFor } from "./ui";

export function EnvelopeRow({ e, onClick }: { e: Envelope; onClick?: () => void }) {
  const u = usage(e);
  const tone = e.cardSpendable ? toneFor(u) : "ok";
  const avail = available(e);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`env-row ${onClick ? "clickable" : ""}`} onClick={onClick}>
      <div className="row">
        <span className="env-name">
          {e.name}
          {e.cadence === "weekly" && <span className="tag">weekly</span>}
          {!e.cardSpendable && <span className="tag">no card</span>}
        </span>
        <span className={`env-left ${tone === "over" && e.cardSpendable ? "t-over" : ""}`}>{fmt(avail)}</span>
      </div>
      {e.cardSpendable ? (
        <Progress value={u} tone={tone} />
      ) : (
        <Progress value={e.target ? Math.min(1, e.fundedThisPeriod / e.target) : 0} tone="ok" />
      )}
      <div className="row small muted">
        <span>
          {e.cardSpendable
            ? `${fmt(e.spentThisPeriod)} spent this ${e.cadence === "weekly" ? "week" : "month"}`
            : `${fmt(e.fundedThisPeriod)} of ${fmt(e.target)} added this month`}
          {e.held > 0 && <span className="hold"> · {fmt(e.held)} pending hold</span>}
        </span>
        <span>{e.cardSpendable ? "available" : "saved"}</span>
      </div>
    </Tag>
  );
}

export function envelopeNames(tx: Transaction, envelopes: Envelope[]): string {
  if (tx.allocations.length === 0) return "No envelope";
  return tx.allocations.map((a) => envelopes.find((e) => e.id === a.envelopeId)?.name ?? "Deleted envelope").join(" + ");
}

export function TxRow({ tx, onClick }: { tx: Transaction; onClick?: () => void }) {
  const { state } = useStore();
  const tags: string[] = [];
  if (tx.status === "pending") tags.push(`pending hold ${fmt(tx.holdAmount ?? tx.amount)}`);
  if (tx.source === "manual") tags.push("cash");
  if (tx.override) tags.push(`${fmt(tx.override.amount)} from emergency fund`);
  if (tx.decline?.coveredBy) tags.push("covered, retried");
  const needsReview = tx.status !== "declined" && !tx.confirmed;
  return (
    <button className={`tx-row ${tx.status}`} onClick={onClick}>
      <div className="tx-main">
        <span className="tx-merchant">
          {tx.merchant}
          {needsReview && <span className="tag tag-attn">check category</span>}
        </span>
        <span className="small muted">
          {tx.status === "declined" ? `Declined · ${tx.decline?.code === "insufficient" ? envelopeNames(tx, state.envelopes) : tx.decline?.message}` : envelopeNames(tx, state.envelopes)}
          {" · "}
          {fmtDate(tx.createdAt)}
          {tags.length > 0 && ` · ${tags.join(" · ")}`}
        </span>
      </div>
      <span className={`tx-amt ${tx.status === "declined" ? "t-declined" : ""}`}>{fmt(tx.amount)}</span>
    </button>
  );
}
