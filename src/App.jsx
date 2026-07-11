import { useState, useCallback, useEffect } from "react";

// ── localStorage ──────────────────────────────────────────────────
const LS = { players: "padel_players", rounds: "padel_rounds", view: "padel_view", courts: "padel_courts" };
const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

// ── Palette ───────────────────────────────────────────────────────
const C = {
  bg: "#0d1f2d", surface: "#152840", card: "#1c3450", green: "#4ade80",
  sand: "#f5c842", coral: "#f87171", blue: "#60a5fa", purple: "#a78bfa",
  muted: "#5b7fa6", white: "#f0f4f8", dimmed: "#8fadc8",
};
const COURT_COLORS = [C.sand, C.blue, C.green, C.purple];

// ── Helpers ───────────────────────────────────────────────────────
const makePlayer = (name) => ({ name, matchPoints: 0, gamePoints: 0 });

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Who rested in the last round
const getLastRested = (rounds) => {
  if (!rounds.length) return [];
  return rounds[rounds.length - 1]?.resting || [];
};

// Who has rested 2+ rounds in a row (must play next)
const getMustPlay = (rounds) => {
  if (rounds.length < 2) return [];
  const last       = rounds[rounds.length - 1]?.resting || [];
  const secondLast = rounds[rounds.length - 2]?.resting || [];
  return last.filter((n) => secondLast.includes(n));
};

// Players who have never appeared in any round (joined mid-tournament)
const getNewPlayers = (playerNames, rounds) => {
  if (!rounds.length) return [];
  const everSeen = new Set(
    rounds.flatMap((r) => [
      ...(r.resting || []),
      ...r.courts.flatMap((c) => [...c.teamA, ...c.teamB]),
    ])
  );
  return playerNames.filter((n) => !everSeen.has(n));
};

// Count how many games each player has played across all rounds
const getPlayCounts = (playerNames, rounds) => {
  const counts = {};
  playerNames.forEach((n) => { counts[n] = 0; });
  rounds.forEach((r) => {
    r.courts.forEach((c) => {
      [...c.teamA, ...c.teamB].filter(Boolean).forEach((n) => {
        if (counts[n] != null) counts[n]++;
      });
    });
  });
  return counts;
};

// Sort by play count ascending (least played first), break ties randomly
const sortByPlayCount = (names, playCounts) =>
  shuffle(names).sort((a, b) => playCounts[a] - playCounts[b]);

// Suggest pairings: fair play distribution — least played gets priority
const suggestPairings = (playerNames, numCourts, rounds) => {
  const seats      = numCourts * 4;
  const mustPlay   = getMustPlay(rounds);
  const playCounts = getPlayCounts(playerNames, rounds);

  // mustPlay players are guaranteed a spot
  const guaranteed = [...new Set([...mustPlay])];

  // Everyone else sorted by play count ascending (fewest games → plays next)
  const others = sortByPlayCount(
    playerNames.filter((n) => !guaranteed.includes(n)),
    playCounts
  );

  // Fill playing: guaranteed first, then sorted others up to seats
  let playing = [...guaranteed];
  if (playing.length > seats) playing = shuffle(playing).slice(0, seats);
  playing = [...playing, ...others.slice(0, seats - playing.length)];

  // Fallback
  if (playing.length < seats) playing = shuffle(playerNames).slice(0, seats);

  playing = shuffle(playing);
  const resting = playerNames.filter((n) => !playing.includes(n));

  const courts = [];
  for (let i = 0; i < numCourts; i++) {
    const four = playing.slice(i * 4, i * 4 + 4);
    if (four.length < 4) break;
    courts.push({ teamA: [four[0], four[1]], teamB: [four[2], four[3]], scoreA: null, scoreB: null });
  }
  return { courts, resting };
};

const recalcStandings = (players, rounds) => {
  const totals = {};
  players.forEach((p) => { totals[p.name] = { matchPoints: 0, gamePoints: 0 }; });
  rounds.forEach((round) => {
    if (!round) return;
    round.courts.forEach((court) => {
      if (!court || court.scoreA == null) return;
      const { teamA, teamB, scoreA, scoreB } = court;
      const mpA = scoreA > scoreB ? 2 : scoreA === scoreB ? 1 : 0;
      const mpB = scoreB > scoreA ? 2 : scoreA === scoreB ? 1 : 0;
      teamA.filter(Boolean).forEach((n) => { if (totals[n]) { totals[n].matchPoints += mpA; totals[n].gamePoints += scoreA; } });
      teamB.filter(Boolean).forEach((n) => { if (totals[n]) { totals[n].matchPoints += mpB; totals[n].gamePoints += scoreB; } });
    });
  });
  return players.map((p) => ({ ...p, ...totals[p.name] }));
};

// ── Static styles ─────────────────────────────────────────────────
const appStyle     = { minHeight: "100vh", background: C.bg, color: C.white, fontFamily: "'Inter','Helvetica Neue',sans-serif", paddingBottom: 80 };
const headerStyle  = { background: C.surface, borderBottom: `2px solid ${C.sand}`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" };
const navStyle     = { display: "flex", gap: 4, padding: "10px 14px", background: C.surface, borderBottom: `1px solid ${C.card}` };
const pageStyle    = { maxWidth: 640, margin: "0 auto", padding: "18px 14px" };
const cardStyle    = { background: C.card, borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid rgba(91,127,166,0.2)" };
const labelStyle   = { fontSize: 11, color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 5, display: "block" };
const inputStyle   = { background: "#0a1824", border: `1px solid ${C.muted}`, color: C.white, borderRadius: 8, padding: "9px 10px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "0 10px" };
const modalStyle   = { background: C.surface, borderRadius: 16, padding: "20px 16px", width: "100%", maxWidth: 460, border: `1px solid ${C.muted}`, maxHeight: "92vh", overflowY: "auto" };

const btn = (variant = "primary", extra = {}) => ({
  padding: "10px 16px", borderRadius: 8, border: "none",
  background: variant === "primary" ? C.sand : variant === "ghost" ? "transparent" : variant === "danger" ? C.coral : C.card,
  color: variant === "ghost" ? C.dimmed : variant === "danger" ? "#fff" : "#0d1f2d",
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

// ── PlayerSelect ──────────────────────────────────────────────────
function PlayerSelect({ value, onChange, playerNames, usedNames, highlight = [] }) {
  const options = playerNames.filter((n) => n === value || !usedNames.includes(n));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, appearance: "none", color: highlight.includes(value) ? C.sand : C.white }}>
      <option value="">— player —</option>
      {options.map((n) => (
        <option key={n} value={n} style={{ color: highlight.includes(n) ? C.sand : C.white }}>
          {highlight.includes(n) ? `★ ${n}` : n}
        </option>
      ))}
    </select>
  );
}

// ── CourtBlock ────────────────────────────────────────────────────
function CourtBlock({ courtIdx, color, court, onChange, playerNames, usedOther, priorityPlayers }) {
  const usedHere = [...court.teamA, ...court.teamB].filter(Boolean);
  const usedAll  = [...usedHere, ...usedOther];
  const setA = (i, v) => { const t = [...court.teamA]; t[i] = v; onChange({ ...court, teamA: t }); };
  const setB = (i, v) => { const t = [...court.teamB]; t[i] = v; onChange({ ...court, teamB: t }); };

  return (
    <div style={{ background: `${color}0d`, border: `1px solid ${color}44`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: "0.08em", marginBottom: 10 }}>
        COURT {courtIdx + 1}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: C.green, marginBottom: 4, fontWeight: 600 }}>TEAM A</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <PlayerSelect value={court.teamA[0]} onChange={(v) => setA(0, v)} playerNames={playerNames} usedNames={usedAll.filter((n) => n !== court.teamA[0])} highlight={priorityPlayers} />
            <PlayerSelect value={court.teamA[1]} onChange={(v) => setA(1, v)} playerNames={playerNames} usedNames={usedAll.filter((n) => n !== court.teamA[1])} highlight={priorityPlayers} />
          </div>
        </div>
        <div style={{ color: C.muted, fontWeight: 800, fontSize: 14, textAlign: "center" }}>vs</div>
        <div>
          <div style={{ fontSize: 10, color: C.coral, marginBottom: 4, fontWeight: 600 }}>TEAM B</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <PlayerSelect value={court.teamB[0]} onChange={(v) => setB(0, v)} playerNames={playerNames} usedNames={usedAll.filter((n) => n !== court.teamB[0])} highlight={priorityPlayers} />
            <PlayerSelect value={court.teamB[1]} onChange={(v) => setB(1, v)} playerNames={playerNames} usedNames={usedAll.filter((n) => n !== court.teamB[1])} highlight={priorityPlayers} />
          </div>
        </div>
      </div>
      {/* Score */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input style={{ ...inputStyle, fontSize: 24, fontWeight: 800, textAlign: "center", flex: 1 }}
          type="number" min="0" inputMode="numeric"
          value={court.scoreA ?? ""} placeholder="0"
          onChange={(e) => onChange({ ...court, scoreA: e.target.value === "" ? null : parseInt(e.target.value, 10) })} />
        <span style={{ color: C.muted, fontSize: 18, fontWeight: 700 }}>–</span>
        <input style={{ ...inputStyle, fontSize: 24, fontWeight: 800, textAlign: "center", flex: 1 }}
          type="number" min="0" inputMode="numeric"
          value={court.scoreB ?? ""} placeholder="0"
          onChange={(e) => onChange({ ...court, scoreB: e.target.value === "" ? null : parseInt(e.target.value, 10) })} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 10, color: C.green }}>{court.teamA.filter(Boolean).join(" & ") || "Team A"}</span>
        <span style={{ fontSize: 10, color: C.coral }}>{court.teamB.filter(Boolean).join(" & ") || "Team B"}</span>
      </div>
    </div>
  );
}

// ── RoundModal ────────────────────────────────────────────────────
function RoundModal({ roundIdx, round, players, numCourts, rounds, onSave, onClose }) {
  const playerNames     = players.map((p) => p.name);
  const prevRounds      = rounds.slice(0, roundIdx);
  const lastRested      = getLastRested(prevRounds);
  const mustPlay        = getMustPlay(prevRounds);
  const newPlayers      = getNewPlayers(playerNames, prevRounds);
  const playCounts      = getPlayCounts(playerNames, prevRounds);
  const priorityPlayers = [...new Set([...newPlayers, ...lastRested])];

  const initCourts = round
    ? round.courts
    : Array(numCourts).fill(null).map(() => ({ teamA: ["", ""], teamB: ["", ""], scoreA: null, scoreB: null }));

  const [courts, setCourts] = useState(initCourts);

  const usedAll = courts.flatMap((c) => [...c.teamA, ...c.teamB]).filter(Boolean);
  const resting = playerNames.filter((n) => !usedAll.includes(n));

  const handleSuggest = () => {
    const suggestion = suggestPairings(playerNames, numCourts, rounds.slice(0, roundIdx));
    setCourts(suggestion.courts);
  };

  const updateCourt = (i, court) => {
    setCourts((prev) => { const next = [...prev]; next[i] = court; return next; });
  };

  const handleSave = () => onSave({ courts, resting });

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Round {roundIdx + 1}</h3>
          <button style={{ ...btn("ghost"), padding: "4px 10px", fontSize: 12 }} onClick={onClose}>✕</button>
        </div>

        {/* Games played overview */}
        {prevRounds.length > 0 && (
          <div style={{ background: `${C.sand}10`, border: `1px solid ${C.sand}33`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.sand, fontWeight: 700, marginBottom: 6 }}>GAMES PLAYED</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {sortByPlayCount(playerNames, playCounts).map((n) => {
                const count  = playCounts[n];
                const isNew  = newPlayers.includes(n);
                const isMust = mustPlay.includes(n);
                const minCount = Math.min(...Object.values(playCounts));
                const col    = isMust ? C.coral : isNew ? C.green : count === minCount ? C.sand : C.dimmed;
                return (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 4, background: `${col}18`, border: `1px solid ${col}44`, borderRadius: 6, padding: "3px 8px" }}>
                    <span style={{ fontSize: 11, color: C.white }}>{n}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: col }}>
                      {isNew ? "NEW" : isMust ? `${count} must` : `${count}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Suggest button */}
        <button style={{ ...btn("ghost"), width: "100%", marginBottom: 14, border: `1px dashed ${C.muted}`, color: C.dimmed }}
          onClick={handleSuggest}>
          🎲 Suggest random pairings
        </button>

        {courts.map((court, i) => (
          <CourtBlock
            key={i}
            courtIdx={i}
            color={COURT_COLORS[i % COURT_COLORS.length]}
            court={court}
            onChange={(c) => updateCourt(i, c)}
            playerNames={playerNames}
            usedOther={courts.filter((_, ci) => ci !== i).flatMap((c) => [...c.teamA, ...c.teamB]).filter(Boolean)}
            priorityPlayers={priorityPlayers}
          />
        ))}

        {/* Resting */}
        <div style={{ padding: "8px 12px", background: `${C.coral}0f`, borderRadius: 8, border: `1px solid ${C.coral}33`, marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: C.coral, fontWeight: 600 }}>Resting this round: </span>
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

// ── RoundRow ──────────────────────────────────────────────────────
function RoundRow({ roundIdx, round, onClick }) {
  if (!round) return null;
  const allScored = round.courts.every((c) => c.scoreA != null);
  const anySet    = round.courts.some((c) => c.teamA[0]);
  const dot       = allScored ? C.green : anySet ? C.sand : C.muted;

  return (
    <div onClick={onClick} style={{ ...cardStyle, cursor: "pointer", marginBottom: 8, background: allScored ? `${C.green}0a` : C.card }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `${dot}22`, color: dot, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>
          {roundIdx + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>ROUND {roundIdx + 1}</div>
          {round.courts.map((c, i) => {
            const color = COURT_COLORS[i % COURT_COLORS.length];
            const score = c.scoreA != null ? ` · ${c.scoreA}–${c.scoreB}` : "";
            return (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                <span style={{ fontSize: 9, color, fontWeight: 700, minWidth: 44 }}>COURT {i + 1}</span>
                <span style={{ fontSize: 11, color: C.dimmed, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.teamA.filter(Boolean).join(" & ")} vs {c.teamB.filter(Boolean).join(" & ")}
                  {score && <span style={{ color: C.white, fontWeight: 700 }}>{score}</span>}
                </span>
              </div>
            );
          })}
          {round.resting?.length > 0 && (
            <div style={{ fontSize: 10, color: C.coral, marginTop: 2 }}>Resting: {round.resting.join(", ")}</div>
          )}
        </div>
        <span style={{ color: C.muted, fontSize: 18 }}>›</span>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
export default function App() {
  const [players,      setPlayers]      = useState(() => load(LS.players, []));
  const [rounds,       setRounds]       = useState(() => load(LS.rounds,  []));
  const [numCourts,    setNumCourts]    = useState(() => load(LS.courts,  2));
  const [view,         setView]         = useState(() => load(LS.view,    "setup"));
  const [nameInput,    setNameInput]    = useState("");
  const [editingRound, setEditing]      = useState(null); // index or "new"
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => { save(LS.players, players); }, [players]);
  useEffect(() => { save(LS.rounds,  rounds);  }, [rounds]);
  useEffect(() => { save(LS.courts,  numCourts); }, [numCourts]);
  useEffect(() => { save(LS.view,    view);    }, [view]);

  const addPlayer = useCallback(() => {
    const n = nameInput.trim();
    if (!n || players.find((p) => p.name === n)) return;
    setPlayers((p) => [...p, makePlayer(n)]);
    setNameInput("");
  }, [nameInput, players]);

  const removePlayer = useCallback((i) => setPlayers((p) => p.filter((_, idx) => idx !== i)), []);

  const saveRound = useCallback((idx, data) => {
    setRounds((prev) => {
      const next = [...prev];
      if (idx === "new") { next.push(data); }
      else { next[idx] = data; }
      return next;
    });
    setEditing(null);
  }, []);

  const deleteLastRound = useCallback(() => {
    setRounds((prev) => prev.slice(0, -1));
  }, []);

  const resetAll = () => {
    setPlayers([]); setRounds([]); setNumCourts(2); setView("setup"); setConfirmReset(false);
    [LS.players, LS.rounds, LS.courts, LS.view].forEach((k) => save(k, null));
  };

  const updatedPlayers = recalcStandings(players, rounds);
  const standings = [...updatedPlayers].sort((a, b) => b.matchPoints - a.matchPoints || b.gamePoints - a.gamePoints);

  // Which round index is being edited
  const editIdx = editingRound === "new" ? rounds.length : editingRound;

  // ── Setup view ────────────────────────────────────────────────
  const SetupView = (
    <div style={pageStyle}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>Setup</h2>
      <p style={{ margin: "0 0 20px", color: C.muted, fontSize: 14 }}>Add players and pick number of courts.</p>

      {/* Courts selector */}
      <div style={{ ...cardStyle, marginBottom: 18 }}>
        <label style={labelStyle}>Number of courts</label>
        <div style={{ display: "flex", gap: 8 }}>
          {[1, 2, 3, 4].map((n) => (
            <button key={n} onClick={() => setNumCourts(n)} style={{
              flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
              background: numCourts === n ? C.sand : "#0a1824",
              color: numCourts === n ? "#0d1f2d" : C.muted,
              fontWeight: 700, fontSize: 15, cursor: "pointer",
            }}>{n}</button>
          ))}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: C.muted }}>
          {numCourts} court{numCourts > 1 ? "s" : ""} → {numCourts * 4} players active per round, {" "}
          {Math.max(0, players.length - numCourts * 4)} resting
        </p>
      </div>

      {/* Add player */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Add player</label>
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
          <label style={labelStyle}>{players.length} players</label>
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

      {players.length >= numCourts * 4 && (
        <button style={{ ...btn("primary"), width: "100%", padding: 14, fontSize: 15, marginTop: 8 }}
          onClick={() => setView("rounds")}>
          🎾 Start Tournament
        </button>
      )}
      {players.length > 0 && players.length < numCourts * 4 && (
        <p style={{ textAlign: "center", color: C.coral, fontSize: 13, marginTop: 10 }}>
          Need at least {numCourts * 4} players for {numCourts} court{numCourts > 1 ? "s" : ""}
        </p>
      )}

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: C.sand }}>Format</p>
        <ul style={{ margin: 0, padding: "0 0 0 16px", color: C.dimmed, fontSize: 12, lineHeight: 2 }}>
          <li>2v2 on each court simultaneously</li>
          <li>Win = 2 pts · Draw = 1 pt · Loss = 0 pts</li>
          <li>★ Players who rested last round are prioritized</li>
        </ul>
      </div>
    </div>
  );

  // ── Rounds view ───────────────────────────────────────────────
  const RoundsView = (
    <div style={pageStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800 }}>Rounds</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>{rounds.length} played</p>
        </div>
        <span style={{ background: C.green, color: "#0d1f2d", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>LIVE</span>
      </div>

      {rounds.map((round, i) => (
        <RoundRow key={i} roundIdx={i} round={round} onClick={() => setEditing(i)} />
      ))}

      {/* Start next round button */}
      <button
        onClick={() => setEditing("new")}
        style={{ ...btn("primary"), width: "100%", padding: 14, fontSize: 15, marginTop: 4 }}>
        + Start Round {rounds.length + 1}
      </button>

      {rounds.length > 0 && (
        <button onClick={deleteLastRound}
          style={{ ...btn("ghost"), width: "100%", padding: 10, fontSize: 12, marginTop: 8, color: C.coral }}>
          ✕ Delete last round
        </button>
      )}
    </div>
  );

  // ── Standings view ────────────────────────────────────────────
  const StandingsView = (
    <div style={pageStyle}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>Standings</h2>
      <p style={{ margin: "0 0 18px", color: C.muted, fontSize: 13 }}>Match pts · Game pts as tiebreaker</p>

      {standings.length === 0 && <p style={{ color: C.muted }}>No players yet.</p>}

      {standings.map((p, rank) => {
        const strip = rounds.map((r) => {
          if (!r) return "empty";
          if (r.resting?.includes(p.name)) return "rest";
          const court = r.courts.find((c) => c && (c.teamA.includes(p.name) || c.teamB.includes(p.name)));
          if (!court) return "empty";
          if (court.scoreA == null) return "pending";
          const mine   = court.teamA.includes(p.name) ? court.scoreA : court.scoreB;
          const theirs = court.teamA.includes(p.name) ? court.scoreB : court.scoreA;
          return mine > theirs ? "win" : mine === theirs ? "draw" : "loss";
        });
        const dotCol   = { win: C.green, draw: C.sand, loss: C.coral, rest: "#4a6080", pending: C.muted, empty: "#ffffff18" };
        const dotLabel = { win: "W", draw: "D", loss: "L", rest: "R", pending: "·", empty: "" };

        return (
          <div key={p.name} style={{ ...cardStyle, border: rank < 3 ? `1px solid ${C.sand}55` : cardStyle.border, background: rank < 3 ? `${C.sand}0c` : C.card }}>
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
            <div style={{ display: "flex", gap: 3, marginTop: 10, flexWrap: "wrap" }}>
              {strip.map((s, i) => (
                <div key={i} style={{ width: 24, height: 18, borderRadius: 4, background: `${dotCol[s]}28`, border: `1px solid ${dotCol[s]}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: dotCol[s] }}>
                  {dotLabel[s]}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={appStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.04em" }}>
          PADEL <span style={{ color: C.sand }}>//</span> AMERICANO
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: C.sand, color: "#0d1f2d", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>FUN</span>
          <button onClick={() => setConfirmReset(true)}
            style={{ background: "transparent", border: "none", color: C.muted, fontSize: 18, cursor: "pointer", padding: "0 2px" }}
            title="Reset">↺</button>
        </div>
      </div>

      {/* Nav */}
      {view !== "setup" && (
        <div style={navStyle}>
          <button style={navBtn(view === "rounds")} onClick={() => setView("rounds")}>Rounds</button>
          <button style={navBtn(view === "standings")} onClick={() => setView("standings")}>Standings</button>
          <button style={{ ...navBtn(false), marginLeft: "auto" }} onClick={() => setView("setup")}>⚙ Setup</button>
        </div>
      )}

      {view === "setup"     && SetupView}
      {view === "rounds"    && RoundsView}
      {view === "standings" && StandingsView}

      {/* Round modal */}
      {editingRound !== null && (
        <RoundModal
          roundIdx={editIdx}
          round={editingRound !== "new" ? rounds[editingRound] : null}
          players={updatedPlayers}
          numCourts={numCourts}
          rounds={rounds}
          onSave={(data) => saveRound(editingRound, data)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Reset confirm */}
      {confirmReset && (
        <div style={overlayStyle} onClick={() => setConfirmReset(false)}>
          <div style={{ ...modalStyle, maxWidth: 300, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>Reset tournament?</h3>
            <p style={{ margin: "0 0 20px", color: C.muted, fontSize: 13 }}>Clears all players, rounds and scores from this device.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn("ghost"), flex: 1 }} onClick={() => setConfirmReset(false)}>Cancel</button>
              <button style={{ ...btn("danger"), flex: 1 }} onClick={resetAll}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
