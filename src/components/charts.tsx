import { useMemo, useState } from "react";
import { AppState } from "../types";
import { fmt, fmtShort, startOfMonth, sum } from "../engine/util";
import { KindBadge, kindStyle, EnvBadge, envStyle } from "./meta";

// Daily spending this month. One series, so no legend: the card title names it.
export function DailySpendChart({ state }: { state: AppState }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => {
    const monthStart = startOfMonth(state.now);
    const d = new Date(monthStart);
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const today = new Date(state.now).getUTCDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, amount: 0, count: 0, future: i + 1 > today }));
    for (const t of state.transactions) {
      if (t.status !== "settled" || t.createdAt < monthStart || t.createdAt > state.now) continue;
      const day = new Date(t.createdAt).getUTCDate();
      days[day - 1].amount += t.amount;
      days[day - 1].count += 1;
    }
    return { days, today, monthLabel: d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) };
  }, [state.transactions, state.now]);

  const W = 560;
  const H = 150;
  const pad = { l: 36, r: 4, t: 8, b: 20 };
  const max = Math.max(2000, ...data.days.map((d) => d.amount));
  const niceMax = Math.ceil(max / 5000) * 5000;
  const bw = (W - pad.l - pad.r) / data.days.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / niceMax);
  const total = sum(data.days.map((d) => d.amount));
  const avg = total / Math.max(1, data.today);
  const ticks = [0, niceMax / 2, niceMax];
  const h = hover !== null ? data.days[hover] : null;

  return (
    <div className="chart">
      <div className="chart-summary">
        <div>
          <div className="xs muted">Spent in {data.monthLabel}</div>
          <div className="v">{fmt(total)}</div>
        </div>
        <div>
          <div className="xs muted">Daily average</div>
          <div className="v">{fmt(Math.round(avg))}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily card and cash spending in ${data.monthLabel}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text className="axis-text" x={pad.l - 6} y={y(t) + 4} textAnchor="end">
              {fmtShort(t).replace(".00", "")}
            </text>
          </g>
        ))}
        {data.days.map((d, i) => {
          const x = pad.l + i * bw + 1;
          const w = Math.max(2, bw - 2);
          const top = d.future ? y(0) - 3 : Math.min(y(d.amount), y(0) - (d.amount > 0 ? 3 : 1));
          const hgt = y(0) - top;
          return (
            <g key={d.day} onMouseEnter={() => !d.future && setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <path
                className={`bar ${d.future ? "future" : ""} ${hover === i ? "hover" : ""}`}
                d={`M${x},${y(0)} V${top + 3} Q${x},${top} ${x + 3},${top} H${x + w - 3} Q${x + w},${top} ${x + w},${top + 3} V${y(0)} Z`}
              />
              {(d.day === 1 || d.day % 5 === 0) && (
                <text className="axis-text" x={x + w / 2} y={H - 4} textAnchor="middle">
                  {d.day}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="chart-tip" style={{ left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%`, top: `${(y(h.amount) / H) * 100}%` }}>
          <strong>{fmt(h.amount)}</strong>
          {data.monthLabel.slice(0, 3)} {h.day} · {h.count} purchase{h.count === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

// Where this month's spending went, by envelope. Bars carry the envelope's color, text stays in ink.
export function EnvelopeBreakdown({ state, limit = 6 }: { state: AppState; limit?: number }) {
  const rows = state.envelopes
    .filter((e) => e.cardSpendable && e.spentThisPeriod > 0)
    .map((e) => ({ e, spent: e.spentThisPeriod }))
    .sort((a, b) => b.spent - a.spent);
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const max = Math.max(1, ...rows.map((r) => r.spent));
  if (rows.length === 0) return <p className="small muted">No spending yet this period.</p>;
  return (
    <div>
      {shown.map(({ e, spent }) => (
        <div key={e.id} className="breakdown-row" style={envStyle(e)}>
          <EnvBadge e={e} size={28} />
          <div>
            <div className="row small">
              <span>{e.name}</span>
            </div>
            <div className="hbar">
              <div style={{ width: `${(spent / max) * 100}%` }} />
            </div>
          </div>
          <span className="small num">{fmt(spent)}</span>
        </div>
      ))}
      {rest.length > 0 && (
        <div className="breakdown-row" style={kindStyle("custom")}>
          <KindBadge kind="custom" size={28} />
          <div className="small muted">{rest.length} more categories</div>
          <span className="small num">{fmt(sum(rest.map((r) => r.spent)))}</span>
        </div>
      )}
    </div>
  );
}
