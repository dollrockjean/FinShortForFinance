import { useState } from "react";
import { Layers, BadgeCheck, Building2, Database, KeyRound, Mail, Monitor, Moon, Palette, RotateCcw, ShieldCheck, Smartphone, Sun, Trash2, UserRound } from "lucide-react";
import { useStore } from "../store";
import { freshState, demoState } from "../engine/seed";
import { Callout, Segmented, StatusPill } from "../components/ui";
import { initials } from "../components/options";
import { ResetModal } from "./Setup";
import { fmt, sum } from "../engine/util";

function Row({ icon, title, sub, right }: { icon: React.ReactNode; title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="control-row">
      <span className="control-icon">{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong className="small">{title}</strong>
        {sub && <div className="xs muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export default function Settings() {
  const { state, set } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const sec = state.security;

  return (
    <div className="page-grid">
      <div>
        <div className="card">
          <div className="row gap" style={{ gap: 14 }}>
            <span className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>
              {initials(state)}
            </span>
            <div>
              <h2 style={{ fontSize: 18 }}>{state.user?.name}</h2>
              <div className="small muted">{state.user?.email}</div>
            </div>
            {state.testMode && (
              <span className="pill" style={{ marginLeft: "auto" }}>
                Demo account
              </span>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>
              <ShieldCheck size={17} /> Security and identity
            </h2>
          </div>
          <div className="list">
            <Row icon={<Mail size={17} />} title="Email" sub={state.user?.email} right={sec.emailVerified ? <StatusPill status="good">Verified</StatusPill> : <StatusPill status="warning">Unverified</StatusPill>} />
            <Row
              icon={<UserRound size={17} />}
              title="Sign-in method"
              sub={state.user?.provider === "password" ? "Email and password" : state.user?.provider === "google" ? "Google" : "Apple"}
            />
            <Row
              icon={sec.twoFactor === "sms" ? <Smartphone size={17} /> : <KeyRound size={17} />}
              title="Two-factor"
              sub={sec.twoFactor === "totp" ? "Authenticator app" : sec.twoFactor === "sms" ? `Text message to ${sec.smsPhone}` : "Off"}
              right={sec.twoFactor === "totp" ? <StatusPill status="good">Strong</StatusPill> : sec.twoFactor === "sms" ? <StatusPill status="warning">Weaker</StatusPill> : <StatusPill status="critical">Off</StatusPill>}
            />
            <Row
              icon={<BadgeCheck size={17} />}
              title="Identity"
              sub={state.kyc.status === "verified" ? `${state.kyc.legalName}, SSN ending ${state.kyc.ssnLast4}` : "Not verified"}
              right={state.kyc.status === "verified" ? <StatusPill status="good">Verified</StatusPill> : <StatusPill status="warning">{state.kyc.status}</StatusPill>}
            />
            <Row icon={<Building2 size={17} />} title="Funding bank" sub={state.bank ? `${state.bank.institution} ${state.bank.accountName} •••• ${state.bank.mask}` : "None linked"} />
          </div>
          {sec.twoFactor === "sms" && <Callout status="warning">Text codes can be stolen with a SIM swap. Switching to an authenticator app takes two minutes.</Callout>}
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-head">
            <h2>
              <Palette size={17} /> Appearance
            </h2>
          </div>
          <Segmented
            full
            label="Theme"
            value={state.theme}
            onChange={(theme) => set({ theme, themeSet: true })}
            options={[
              { value: "light", label: "Light", icon: <Sun size={14} /> },
              { value: "system", label: "Match device", icon: <Monitor size={14} /> },
              { value: "dark", label: "Dark", icon: <Moon size={14} /> },
            ]}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>
              <Layers size={17} /> Categories
            </h2>
          </div>
          <p className="small muted">
            {state.envelopes.length} categories holding {fmt(sum(state.envelopes.map((e) => e.balance)))}. Resetting empties them all and sends the money to Unassigned, then you pick a profile or
            build your own.
          </p>
          <button className="btn btn-danger-outline btn-block" disabled={state.envelopes.length === 0} onClick={() => setResetting(true)}>
            <RotateCcw size={15} /> Reset all categories
          </button>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>
              <Database size={17} /> Your data
            </h2>
          </div>
          <p className="small muted">Everything lives in this browser's local storage. Nothing is sent to a server, because there isn't one.</p>
          {!confirm ? (
            <div className="grid-2">
              <button className="btn btn-outline" onClick={() => set({ ...demoState(), theme: state.theme, themeSet: state.themeSet })}>
                <RotateCcw size={15} /> Reload demo
              </button>
              <button className="btn btn-danger-outline" onClick={() => setConfirm(true)}>
                <Trash2 size={15} /> Erase everything
              </button>
            </div>
          ) : (
            <>
              <Callout status="critical" title="Erase all Fin data in this browser?">You'll go back to the start page.</Callout>
              <div className="grid-2">
                <button className="btn btn-outline" onClick={() => setConfirm(false)}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={() => set(freshState())}>
                  Yes, erase it
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {resetting && <ResetModal onClose={() => setResetting(false)} />}
    </div>
  );
}
