import { useState, useCallback, useEffect } from "react";

// ── localStorage helpers ──────────────────────────────────────────
const LS_PLAYERS = "padel_players";
const LS_ROUNDS  = "padel_rounds";
const LS_VIEW    = "padel_view";

const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const save = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

// ── Palette ──────────────────────────────────────────────────────
const C = {
  bg:      "#0d1f2d",
  surface: "#152840",
  card:    "#1c3450",
  green:   "#4ade80",
  sand:    "#f5c842",
  coral:   "#f87171",
  blue:    "#60a5fa",
  muted:   "#5b7fa6",
  white:   "#f0f4f8",
  dimmed:  "#8fadc8",
};

const TOTAL_ROUNDS = 10; // 8 active + 2 rest slots per player

const makePlayer = (name) => ({ name, matchPoints: 0, gamePoints: 0 });

// Each round: { court1: { teamA, teamB, scoreA, scoreB }, court2: { ... }, resting: [name, name] }
const recalcStandings = (players, rounds) => {
  const totals = {};
  players.forEach((p) => { totals[p.name] = { matchPoints: 0, gamePoints: 0 }; });

  rounds.forEach((round) => {
    if (!round) return;
    [round.court1, round.court2].forEach((court) => {
      if (!court || court.scoreA == null) return;
      const { teamA, teamB, scoreA, scoreB } = court;
      const mpA = scoreA > scoreB ? 2 : scoreA === scoreB ? 1 : 0;
      const mpB = scoreB > scoreA ? 2 : scoreA === scoreB ? 1 : 0;
      teamA.filter(Boolean).forEach((name) => {
        if (totals[name]) { totals[name].matchPoints += mpA; totals[name].gamePoints += scoreA; }
      });
      teamB.filter(Boolean).forEach((name) => {
        if (totals[name]) { totals[name].matchPoints += mpB; totals[name].gamePoints += scoreB; }
      });
    });
  });

  return players.map((p) => ({ ...p, ...totals[p.name] }));
};

// ── Static styles ─────────────────────────────────────────────────
const appStyle    = { minHeight: "100vh", background: C.bg, color: C.white, fontFamily: "'Inter','Helvetica Neue',sans-serif", paddingBottom: 60 };
const headerStyle = { background: C.surface, borderBottom: `2px solid ${C.sand}`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" };
const navStyle    = { display: "flex", gap: 4, padding: "10px 14px", background: C.surface, borderBottom: `1px solid ${C.card}` };
const pageStyle   = { maxWidth: 640, margin: "0 auto", padding: "18px 14px" };
const cardStyle   = { background: C.card, borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid rgba(91,127,166,0.2)" };
const labelStyle  = { fontSize: 11, color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 5, display: "block" };
const inputStyle  = { background: "#0a1824", border: `1px solid ${C.muted}`, color: C.white, borderRadius: 8, padding: "9px 10px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };
const overlayStyle= { position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "0 10px" };
const modalStyle  = { background: C.surface, borderRadius: 16, padding: "20px 16px", width: "100%", maxWidth: 420, border: `1px solid ${C.muted}`, maxHeight: "92vh", overflowY: "auto" };

const btn = (variant = "primary", extra = {}) => ({
  padding: "10px 16px", borderRadius: 8, border: "none",
  background: variant === "primary" ? C.sand : variant === "ghost" ? "transparent" : C.card,
  color: variant === "ghost" ? C.dimmed : "#0d1f2d",
  fontWeight: 700, fontSize: 13, cursor: "pointer", ...extra,
});
const navBtn = (active) => ({
  padding: "6px 14px", borderRadius: 6, border: "none",
  background: active ? C.sand : "transparent",
  color: active ? "#0d1f2d" : C.muted,
  fontWeight: active ? 700 : 500, fontSize: 13, cursor: "pointer",
});
const medalStyle = (rank) => ({
  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
  background: rank === 0 ? "#fbbf24" : rank === 1 ? "#94a3b8" : rank === 2 ? "#b45309" : C.muted,
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 12, fontWeight: 800, color: "#0d1f2d",
});

// ── Shared player select ──────────────────────────────────────────
function PlayerSelect({ value, onChange, playerNames, usedNames }) {
  const options = playerNames.filter((n) => n === value || !usedNames.includes(n));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, appearance: "none" }}>
      <option value="">— player —</option>
      {options.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

// ── Court block inside modal ──────────────────────────────────────
function CourtBlock({ label, color, court, onChange, playerNames, usedOther }) {
  const usedHere = [...court.teamA, ...court.teamB].filter(Boolean);
  const usedAll  = [...usedHere, ...usedOther];

  const setA = (i, v) => { const t = [...court.teamA]; t[i] = v; onChange({ ...court, teamA: t }); };
  const setB = (i, v) => { const t = [...court.teamB]; t[i] = v; onChange({ ...court, teamB: t }); };

  return (
    <div style={{ background: `${color}0d`, border: `1px solid ${color}44`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: "0.08em", marginBottom: 10 }}>{label}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center", marginBottom: 10 }}>
        {/* Team A */}
        <div>
          <div style={{ fontSize: 10, color: C.green, marginBottom: 4, fontWeight: 600 }}>TEAM A</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <PlayerSelect value={court.teamA[0]} onChange={(v) => setA(0, v)} playerNames={playerNames} usedNames={[...usedAll].filter((n) => n !== court.teamA[0])} />
            <PlayerSelect value={court.teamA[1]} onChange={(v) => setA(1, v)} playerNames={playerNames} usedNames={[...usedAll].filter((n) => n !== court.teamA[1])} />
          </div>
        </div>

        <div style={{ color: C.muted, fontWeight: 800, fontSize: 14, textAlign: "center" }}>vs</div>

        {/* Team B */}
        <div>
          <div style={{ fontSize: 10, color: C.coral, marginBottom: 4, fontWeight: 600 }}>TEAM B</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <PlayerSelect value={court.teamB[0]} onChange={(v) => setB(0, v)} playerNames={playerNames} usedNames={[...usedAll].filter((n) => n !== court.teamB[0])} />
            <PlayerSelect value={court.teamB[1]} onChange={(v) => setB(1, v)} playerNames={playerNames} usedNames={[...usedAll].filter((n) => n !== court.teamB[1])} />
          </div>
        </div>
      </div>

      {/* Score */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input style={{ ...inputStyle, fontSize: 24, fontWeight: 800, textAlign: "center", flex: 1 }}
          type="number" min="0" inputMode="numeric"
          value={court.scoreA ?? ""}
          onChange={(e) => onChange({ ...court, scoreA: e.target.value === "" ? null : parseInt(e.target.value, 10) })}
          placeholder="0"
        />
        <span style={{ color: C.muted, fontSize: 18, fontWeight: 700 }}>–</span>
        <input style={{ ...inputStyle, fontSize: 24, fontWeight: 800, textAlign: "center", flex: 1 }}
          type="number" min="0" inputMode="numeric"
          value={court.scoreB ?? ""}
          onChange={(e) => onChange({ ...court, scoreB: e.target.value === "" ? null : parseInt(e.target.value, 10) })}
          placeholder="0"
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, paddingLeft: 2 }}>
        <span style={{ fontSize: 10, color: C.green }}>{court.teamA.filter(Boolean).join(" & ") || "Team A"}</span>
        <span style={{ fontSize: 10, color: C.coral }}>{court.teamB.filter(Boolean).join(" & ") || "Team B"}</span>
      </div>
    </div>
  );
}

// ── Round edit modal ──────────────────────────────────────────────
const emptyRound = () => ({
  court1: { teamA: ["", ""], teamB: ["", ""], scoreA: null, scoreB: null },
  court2: { teamA: ["", ""], teamB: ["", ""], scoreA: null, scoreB: null },
  resting: [],
});

function RoundModal({ roundIdx, round, players, onSave, onClose }) {
  const playerNames = players.map((p) => p.name);
  const [form, setForm] = useState(round ? JSON.parse(JSON.stringify(round)) : emptyRound());

  const usedC1 = [...form.court1.teamA, ...form.court1.teamB].filter(Boolean);
  const usedC2 = [...form.court2.teamA, ...form.court2.teamB].filter(Boolean);
  const usedAll = [...new Set([...usedC1, ...usedC2])];
  const resting = playerNames.filter((n) => !usedAll.includes(n));

  const handleSave = () => {
    onSave({ ...form, resting });
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Round {roundIdx + 1}</h3>
          <button style={{ ...btn("ghost"), padding: "4px 10px", fontSize: 12 }} onClick={onClose}>✕</button>
        </div>

        <CourtBlock
          label="COURT 1"
          color={C.sand}
          court={form.court1}
          onChange={(c) => setForm((f) => ({ ...f, court1: c }))}
          playerNames={playerNames}
          usedOther={usedC2}
        />

        <CourtBlock
          label="COURT 2"
          color={C.blue}
          court={form.court2}
          onChange={(c) => setForm((f) => ({ ...f, court2: c }))}
          playerNames={playerNames}
          usedOther={usedC1}
        />

        {/* Resting */}
        <div style={{ padding: "8px 12px", background: `${C.coral}0f`, borderRadius: 8, border: `1px solid ${C.coral}33`, marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: C.coral, fontWeight: 600 }}>Resting: </span>
          <span style={{ fontSize: 12, color: C.dimmed }}>{resting.length > 0 ? resting.join(", ") : "Everyone is assigned"}</span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btn("ghost"), flex: 1 }} onClick={onClose}>Cancel</button>
          <button style={{ ...btn("primary"), flex: 2 }} onClick={handleSave}>Save Round</button>
        </div>
      </div>
    </div>
  );
}

// ── Round row in list ─────────────────────────────────────────────
function RoundRow({ roundIdx, round, onClick }) {
  const c1done = round?.court1?.scoreA != null;
  const c2done = round?.court2?.scoreA != null;
  const anySet = round?.court1?.teamA?.[0] || round?.court2?.teamA?.[0];
  const allDone = c1done && c2done;

  const dot = allDone ? C.green : anySet ? C.sand : C.muted;

  const CourtSummary = ({ court, color }) => {
    if (!court?.teamA?.[0]) return <span style={{ color: C.muted, fontSize: 11 }}>Not set</span>;
    const scoreStr = court.scoreA != null ? ` ${court.scoreA}–${court.scoreB}` : "";
    return (
      <span style={{ fontSize: 11, color }}>
        {court.teamA.filter(Boolean).join(" & ")} vs {court.teamB.filter(Boolean).join(" & ")}
        {scoreStr && <span style={{ fontWeight: 700, color: C.white }}>{scoreStr}</span>}
      </span>
    );
  };

  return (
    <div onClick={onClick} style={{
      ...cardStyle, cursor: "pointer", marginBottom: 8,
      background: allDone ? `${C.green}0a` : C.card,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `${dot}22`, color: dot,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 14,
        }}>{roundIdx + 1}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>ROUND {roundIdx + 1}</div>
          {!anySet ? (
            <span style={{ fontSize: 12, color: C.muted }}>Tap to enter pairings</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 9, color: C.sand, fontWeight: 700, minWidth: 40 }}>COURT 1</span>
                <CourtSummary court={round.court1} color={C.dimmed} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 9, color: C.blue, fontWeight: 700, minWidth: 40 }}>COURT 2</span>
                <CourtSummary court={round.court2} color={C.dimmed} />
              </div>
            </div>
          )}
        </div>

        <span style={{ color: C.muted, fontSize: 18 }}>›</span>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
export default function App() {
  const [players, setPlayers]      = useState(() => load(LS_PLAYERS, []));
  const [nameInput, setNameInput]  = useState("");
  const [rounds, setRounds]        = useState(() => load(LS_ROUNDS, Array(TOTAL_ROUNDS).fill(null)));
  const [view, setView]            = useState(() => load(LS_VIEW, "setup"));
  const [editingRound, setEditing] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Auto-save whenever state changes
  useEffect(() => { save(LS_PLAYERS, players); }, [players]);
  useEffect(() => { save(LS_ROUNDS, rounds);   }, [rounds]);
  useEffect(() => { save(LS_VIEW, view);        }, [view]);

  const resetAll = () => {
    setPlayers([]);
    setRounds(Array(TOTAL_ROUNDS).fill(null));
    setView("setup");
    setConfirmReset(false);
    save(LS_PLAYERS, []);
    save(LS_ROUNDS, Array(TOTAL_ROUNDS).fill(null));
    save(LS_VIEW, "setup");
  };

  const addPlayer = useCallback(() => {
    const n = nameInput.trim();
    if (!n || players.length >= 10) return;
    setPlayers((p) => [...p, makePlayer(n)]);
    setNameInput("");
  }, [nameInput, players.length]);

  const removePlayer = useCallback((i) => {
    setPlayers((p) => p.filter((_, idx) => idx !== i));
  }, []);

  const saveRound = useCallback((idx, data) => {
    setRounds((prev) => { const next = [...prev]; next[idx] = data; return next; });
    setEditing(null);
  }, []);

  const updatedPlayers = recalcStandings(players, rounds);
  const standings = [...updatedPlayers].sort(
    (a, b) => b.matchPoints - a.matchPoints || b.gamePoints - a.gamePoints
  );
  const scoredRounds = rounds.filter((r) => r?.court1?.scoreA != null && r?.court2?.scoreA != null).length;

  // ── Setup ────────────────────────────────────────────────────
  const SetupView = (
    <div style={pageStyle}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>Players</h2>
      <p style={{ margin: "0 0 18px", color: C.muted, fontSize: 14 }}>Add all 10 players before starting.</p>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Player name</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={inputStyle} value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            placeholder="e.g. Maria" maxLength={24} />
          <button style={{ ...btn("primary"), whiteSpace: "nowrap" }} onClick={addPlayer}>+ Add</button>
        </div>
      </div>

      {players.length > 0 && (
        <div style={cardStyle}>
          <label style={labelStyle}>{players.length} / 10 players</label>
          {players.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(91,127,166,0.12)" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                <span style={{ color: C.muted, marginRight: 8, fontSize: 12 }}>{i + 1}</span>{p.name}
              </span>
              <button style={{ ...btn("ghost"), padding: "4px 10px", fontSize: 12 }} onClick={() => removePlayer(i)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {players.length >= 4 && (
        <button style={{ ...btn("primary"), width: "100%", padding: 14, fontSize: 15, marginTop: 8 }}
          onClick={() => setView("rounds")}>🎾 Start Tournament</button>
      )}

      <div style={{ ...cardStyle, marginTop: 24 }}>
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: C.sand }}>Format</p>
        <ul style={{ margin: 0, padding: "0 0 0 16px", color: C.dimmed, fontSize: 12, lineHeight: 2 }}>
          <li>Win = 2 pts · Draw = 1 pt · Loss = 0 pts</li>
        </ul>
      </div>
    </div>
  );

  // ── Rounds ───────────────────────────────────────────────────
  const RoundsView = (
    <div style={pageStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800 }}>Rounds</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>{scoredRounds} / {TOTAL_ROUNDS} fully scored</p>
        </div>
        <span style={{ background: C.green, color: "#0d1f2d", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>LIVE</span>
      </div>

      {rounds.map((round, i) => (
        <RoundRow key={i} roundIdx={i} round={round} onClick={() => setEditing(i)} />
      ))}
    </div>
  );

  // ── Standings ────────────────────────────────────────────────
  const StandingsView = (
    <div style={pageStyle}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>Standings</h2>
      <p style={{ margin: "0 0 18px", color: C.muted, fontSize: 13 }}>Match pts · Game pts as tiebreaker</p>

      {standings.length === 0 && (
        <p style={{ color: C.muted }}>No players yet.</p>
      )}

      {standings.map((p, rank) => {
        // Build W/D/L/R strip
        const strip = rounds.map((r) => {
          if (!r) return "empty";
          if (r.resting?.includes(p.name)) return "rest";
          const court = [r.court1, r.court2].find(
            (c) => c && (c.teamA.includes(p.name) || c.teamB.includes(p.name))
          );
          if (!court) return "empty";
          if (court.scoreA == null) return "pending";
          const mine = court.teamA.includes(p.name) ? court.scoreA : court.scoreB;
          const theirs = court.teamA.includes(p.name) ? court.scoreB : court.scoreA;
          return mine > theirs ? "win" : mine === theirs ? "draw" : "loss";
        });

        const dotCol = { win: C.green, draw: C.sand, loss: C.coral, rest: C.coral, pending: C.muted, empty: "#ffffff18" };
        const dotLabel = { win: "W", draw: "D", loss: "L", rest: "R", pending: "·", empty: "" };

        return (
          <div key={p.name} style={{
            ...cardStyle,
            border: rank < 3 ? `1px solid ${C.sand}55` : cardStyle.border,
            background: rank < 3 ? `${C.sand}0c` : C.card,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={medalStyle(rank)}>{rank + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{p.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: rank < 3 ? C.sand : C.white }}>{p.matchPoints}</div>
                <div style={{ fontSize: 10, color: C.muted }}>match pts</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 36 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.dimmed }}>{p.gamePoints}</div>
                <div style={{ fontSize: 10, color: C.muted }}>game pts</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 3, marginTop: 10 }}>
              {strip.map((s, i) => (
                <div key={i} style={{
                  width: 24, height: 18, borderRadius: 4,
                  background: `${dotCol[s]}28`, border: `1px solid ${dotCol[s]}66`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 700, color: dotCol[s],
                }}>{dotLabel[s]}</div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={appStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.04em" }}>
          PADEL <span style={{ color: C.sand }}>//</span> AMERICANO
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: C.sand, color: "#0d1f2d", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>FUN</span>
          <button
            onClick={() => setConfirmReset(true)}
            style={{ background: "transparent", border: "none", color: C.muted, fontSize: 18, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
            title="Reset tournament"
          >↺</button>
        </div>
      </div>

      {/* Reset confirm dialog */}
      {confirmReset && (
        <div style={overlayStyle} onClick={() => setConfirmReset(false)}>
          <div style={{ ...modalStyle, maxWidth: 300, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>Reset tournament?</h3>
            <p style={{ margin: "0 0 20px", color: C.muted, fontSize: 13 }}>This clears all players, rounds and scores from this device.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn("ghost"), flex: 1 }} onClick={() => setConfirmReset(false)}>Cancel</button>
              <button style={{ ...btn(), flex: 1, background: C.coral, color: "#fff" }} onClick={resetAll}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {view !== "setup" && (
        <div style={navStyle}>
          <button style={navBtn(view === "rounds")} onClick={() => setView("rounds")}>Rounds</button>
          <button style={navBtn(view === "standings")} onClick={() => setView("standings")}>Standings</button>
          <button style={{ ...navBtn(false), marginLeft: "auto" }} onClick={() => setView("setup")}>⚙ Players</button>
        </div>
      )}

      {view === "setup"     && SetupView}
      {view === "rounds"    && RoundsView}
      {view === "standings" && StandingsView}

      {editingRound !== null && (
        <RoundModal
          roundIdx={editingRound}
          round={rounds[editingRound]}
          players={updatedPlayers}
          onSave={(data) => saveRound(editingRound, data)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
