import { useState } from "react";
import { CircleX, ShieldCheck } from "lucide-react";
import { useStore } from "../store";
import { Transaction } from "../types";
import { available, coverAndRetry, emergencyEnvelope } from "../engine/ledger";
import { fmt } from "../engine/util";
import { Callout, ErrorText, Field, Modal, useToast } from "./ui";
import { KindBadge, EnvBadge } from "./meta";

// The override path. A decline for lack of funds offers exactly one way through:
// move the shortfall from the emergency fund, say why, and retry.
export function DeclineModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { state, act } = useStore();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const env = state.envelopes.find((e) => e.id === tx.decline?.envelopeId);
  const emergency = emergencyEnvelope(state);
  const required = tx.holdAmount ?? tx.amount;
  const shortBy = env ? Math.max(0, required - available(env)) : 0;
  const coverable = tx.decline?.code === "insufficient" && !tx.decline.coveredBy && !!emergency && available(emergency) >= shortBy;

  return (
    <Modal
      title={`Declined at ${tx.merchant}`}
      onClose={onClose}
      icon={
        <span className="notice-icon s-critical" style={{ width: 38, height: 38 }}>
          <CircleX size={20} />
        </span>
      }
    >
      <Callout status="critical">{tx.decline?.message}</Callout>
      {tx.decline?.code === "insufficient" && env && emergency && !tx.decline.coveredBy && (
        <>
          <div className="preview-box" style={{ marginBottom: 14 }}>
            <div className="preview-line">
              <span className="row gap" style={{ gap: 8 }}>
                <EnvBadge e={env} size={22} /> {env.name}
              </span>
              <span className="num">{fmt(Math.max(0, available(env)))} left</span>
            </div>
            <div className="preview-line">
              <span className="row gap" style={{ gap: 8 }}>
                <EnvBadge e={emergency} size={22} /> {emergency.name}
              </span>
              <span className="num">{fmt(available(emergency))} left</span>
            </div>
            <div className="preview-line">
              <span>Gap to cover</span>
              <strong className="num t-over">{fmt(shortBy)}</strong>
            </div>
          </div>
          {!confirming ? (
            <>
              <p className="small muted">If this can't wait (gas to get to work, a prescription), cover the gap from your emergency fund and retry.</p>
              <button className="btn btn-dark btn-block" disabled={!coverable} onClick={() => setConfirming(true)}>
                <ShieldCheck size={16} /> {coverable ? `Cover ${fmt(shortBy)} from emergency fund` : "Emergency fund can't cover it"}
              </button>
            </>
          ) : (
            <>
              <Field label="Why? (for you, later)" hint={`Your emergency fund drops to ${fmt(available(emergency) - shortBy)}. The note shows up under Overrides in Activity.`}>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Needed gas to get to work" autoFocus />
              </Field>
              <ErrorText>{error}</ErrorText>
              <button
                className="btn btn-dark btn-block"
                onClick={() => {
                  const r = act((s) => coverAndRetry(s, tx.id, note));
                  if (r.error) return setError(r.error);
                  toast({ status: "good", title: "Covered and approved", body: `${tx.merchant} went through on retry` });
                  onClose();
                }}
              >
                Confirm and retry
              </button>
            </>
          )}
        </>
      )}
      {tx.decline?.coveredBy && <Callout status="good">Already covered and retried.</Callout>}
      <button className="btn btn-ghost btn-block top-gap" onClick={onClose}>
        Leave it declined
      </button>
    </Modal>
  );
}
