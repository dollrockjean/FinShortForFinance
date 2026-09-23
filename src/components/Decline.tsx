import { useState } from "react";
import { useStore } from "../store";
import { Transaction } from "../types";
import { available, coverAndRetry, emergencyEnvelope } from "../engine/ledger";
import { fmt } from "../engine/util";
import { ErrorText, Field, Modal } from "./ui";

// The override path. A decline for lack of funds offers exactly one way through:
// move the shortfall from the emergency fund, say why, and retry.
export function DeclineModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { state, act } = useStore();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const env = state.envelopes.find((e) => e.id === tx.decline?.envelopeId);
  const emergency = emergencyEnvelope(state);
  const required = tx.holdAmount ?? tx.amount;
  const shortBy = env ? Math.max(0, required - available(env)) : 0;
  const coverable = tx.decline?.code === "insufficient" && !tx.decline.coveredBy && !!emergency && available(emergency) >= shortBy;

  return (
    <Modal title={`Declined at ${tx.merchant}`} onClose={onClose}>
      <div className="note over-note">{tx.decline?.message}</div>
      {tx.decline?.code === "insufficient" && env && emergency && !tx.decline.coveredBy && (
        <>
          {!confirming ? (
            <>
              <p className="small">
                If this can't wait (gas to get to work, a prescription), you can cover the {fmt(shortBy)} gap from your emergency fund. It has {fmt(available(emergency))}.
              </p>
              <button className="btn btn-primary btn-block" disabled={!coverable} onClick={() => setConfirming(true)}>
                {coverable ? `Cover ${fmt(shortBy)} from emergency fund` : "Emergency fund can't cover it"}
              </button>
            </>
          ) : (
            <>
              <p className="small">
                Moves {fmt(shortBy)} from {emergency.name} into {env.name}, then retries the {fmt(required)} charge. Your emergency fund drops to {fmt(available(emergency) - shortBy)}.
              </p>
              <Field label="Why? (for you, later)" hint="Shows up in Activity under Overrides so you can look back at the month.">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Needed gas to get to work" autoFocus />
              </Field>
              <ErrorText>{error}</ErrorText>
              <button
                className="btn btn-primary btn-block"
                onClick={() => {
                  const r = act((s) => coverAndRetry(s, tx.id, note));
                  if (r.error) setError(r.error);
                  else onClose();
                }}
              >
                Confirm and retry
              </button>
            </>
          )}
        </>
      )}
      {tx.decline?.coveredBy && <p className="small muted">Already covered and retried.</p>}
      <button className="btn btn-ghost btn-block top-gap" onClick={onClose}>
        Leave it declined
      </button>
    </Modal>
  );
}
