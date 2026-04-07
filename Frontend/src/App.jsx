import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_API_URL, {
  transports: ["websocket", "polling"]
});
const REVEAL_STORAGE_KEY = "revealedFinalGameIds";

const theme = {
  bg: "#f4f7fb",
  surface: "#ffffff",
  surfaceAlt: "#f8fafc",
  border: "#d9e2ec",
  text: "#102a43",
  muted: "#627d98",
  primary: "#1d4ed8",
  primarySoft: "#dbeafe",
  shadow: "0 8px 24px rgba(16, 42, 67, 0.08)",
  radius: 16,
};

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: theme.bg,
    color: theme.text,
    fontFamily: "Inter, Arial, sans-serif",
  },
  shell: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "24px 20px 40px",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    gap: 16,
    flexWrap: "wrap",
  },
  heroTitle: {
    margin: 0,
    fontSize: 34,
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  heroSub: {
    margin: "6px 0 0",
    color: theme.muted,
    fontSize: 15,
  },
  card: {
    backgroundColor: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.radius,
    boxShadow: theme.shadow,
  },
  sectionCard: {
    backgroundColor: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.radius,
    boxShadow: theme.shadow,
    padding: 18,
  },
  button: {
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.surface,
    color: theme.text,
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
  },
  primaryButton: {
    border: `1px solid ${theme.primary}`,
    backgroundColor: theme.primary,
    color: "white",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
  },
  softButton: {
    border: `1px solid ${theme.primarySoft}`,
    backgroundColor: theme.primarySoft,
    color: theme.primary,
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
  },
  label: {
    fontSize: 12,
    color: theme.muted,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
};

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 900);

  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 900);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return mobile;
}

function loadRevealedGameIds() {
  try {
    const saved = localStorage.getItem(REVEAL_STORAGE_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseClockToSeconds(clock) {
  if (!clock || typeof clock !== "string") return null;
  const [mm, ss] = clock.split(":").map(Number);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  return mm * 60 + ss;
}

function formatSecondsToClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function ScoreText({ value, reveal }) {
  return (
    <span
      style={{
        filter: reveal ? "none" : "blur(6px)",
        userSelect: "none",
        transition: "filter 0.2s ease",
      }}
    >
      {value}
    </span>
  );
}

function TeamColumn({ teamName, players }) {
  const safePlayers = Array.isArray(players) ? players : [];

  function pct(made, attempts) {
    if (!attempts) return "-";
    return (made / attempts).toFixed(3);
  }

  const totals = safePlayers.reduce(
    (acc, player) => {
      acc.points += player.points || 0;
      acc.threePm += player.threePm || 0;
      acc.rebounds += player.rebounds || 0;
      acc.assists += player.assists || 0;
      acc.steals += player.steals || 0;
      acc.blocks += player.blocks || 0;
      acc.turnovers += player.turnovers || 0;
      acc.fouls += player.fouls || 0;
      acc.fgm += player.fgm || 0;
      acc.fga += player.fga || 0;
      acc.ftm += player.ftm || 0;
      acc.fta += player.fta || 0;
      return acc;
    },
    {
      points: 0,
      threePm: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
      fgm: 0,
      fga: 0,
      ftm: 0,
      fta: 0,
    }
  );

  const thStyle = {
    padding: "8px 10px",
    borderBottom: "1px solid #ccc",
    textAlign: "center",
    whiteSpace: "nowrap",
    fontWeight: "bold",
    fontSize: 13,
  };

  const tdStyle = {
    padding: "8px 10px",
    borderBottom: "1px solid #eee",
    textAlign: "center",
    whiteSpace: "nowrap",
    fontSize: 13,
  };

  const tdNameStyle = {
    padding: "8px 10px",
    borderBottom: "1px solid #eee",
    textAlign: "left",
    whiteSpace: "nowrap",
    fontWeight: 600,
    fontSize: 13,
  };

  return (
    <div
      style={{
        flex: 1,
        border: "1px solid #ccc",
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "#fff",
        boxShadow: theme.shadow,
      }}
    >
      <div
        style={{
          backgroundColor: "#103b52",
          color: "white",
          padding: "10px 12px",
          fontWeight: "bold",
        }}
      >
        {teamName}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#e9eef2" }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>PTS</th>
              <th style={thStyle}>3PM</th>
              <th style={thStyle}>REB</th>
              <th style={thStyle}>AST</th>
              <th style={thStyle}>STL</th>
              <th style={thStyle}>BLK</th>
              <th style={thStyle}>TO</th>
              <th style={thStyle}>PF</th>
              <th style={thStyle}>FG</th>
              <th style={thStyle}>FG%</th>
              <th style={thStyle}>FT</th>
              <th style={thStyle}>FT%</th>
            </tr>
          </thead>

          <tbody>
            {safePlayers.length === 0 ? (
              <tr>
                <td colSpan={13} style={{ padding: 12, textAlign: "center" }}>
                  No visible stats yet.
                </td>
              </tr>
            ) : (
              safePlayers.map((player) => (
                <tr key={`${teamName}-${player.name}`}>
                  <td style={tdNameStyle}>{player.name}</td>
                  <td style={tdStyle}>{player.points || 0}</td>
                  <td style={tdStyle}>{player.threePm || 0}</td>
                  <td style={tdStyle}>{player.rebounds || 0}</td>
                  <td style={tdStyle}>{player.assists || 0}</td>
                  <td style={tdStyle}>{player.steals || 0}</td>
                  <td style={tdStyle}>{player.blocks || 0}</td>
                  <td style={tdStyle}>{player.turnovers || 0}</td>
                  <td style={tdStyle}>{player.fouls || 0}</td>
                  <td style={tdStyle}>
                    {(player.fgm || 0)}/{(player.fga || 0)}
                  </td>
                  <td style={tdStyle}>
                    {pct(player.fgm || 0, player.fga || 0)}
                  </td>
                  <td style={tdStyle}>
                    {(player.ftm || 0)}/{(player.fta || 0)}
                  </td>
                  <td style={tdStyle}>
                    {pct(player.ftm || 0, player.fta || 0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>

          {safePlayers.length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: "#f3f6f8", fontWeight: "bold" }}>
                <td style={tdNameStyle}>TEAM</td>
                <td style={tdStyle}>{totals.points}</td>
                <td style={tdStyle}>{totals.threePm}</td>
                <td style={tdStyle}>{totals.rebounds}</td>
                <td style={tdStyle}>{totals.assists}</td>
                <td style={tdStyle}>{totals.steals}</td>
                <td style={tdStyle}>{totals.blocks}</td>
                <td style={tdStyle}>{totals.turnovers}</td>
                <td style={tdStyle}>{totals.fouls}</td>
                <td style={tdStyle}>
                  {totals.fgm}/{totals.fga}
                </td>
                <td style={tdStyle}>{pct(totals.fgm, totals.fga)}</td>
                <td style={tdStyle}>
                  {totals.ftm}/{totals.fta}
                </td>
                <td style={tdStyle}>{pct(totals.ftm, totals.fta)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function HomePage({ onChooseSport }) {
  return (
    <div style={homeStyles.page}>
      <div style={homeStyles.nav}>
        <div style={homeStyles.brandWrap}>
          <img src="/logo.png" alt="Stat Sync" style={homeStyles.logo} />
          <div>
            <div style={homeStyles.brand}>Stat Sync</div>
            <div style={homeStyles.brandSub}>Watch Delayed. Stay In Sync.</div>
          </div>
        </div>

        <div style={homeStyles.navPills}>
          <span style={homeStyles.navPillActive}>NBA Live</span>
          <span style={homeStyles.navPill}>MLB Soon</span>
          <span style={homeStyles.navPill}>NFL Soon</span>
        </div>
      </div>

      <section style={homeStyles.hero}>
        <div style={homeStyles.heroLeft}>
          <div style={homeStyles.badge}>Spoiler-safe sports sync</div>

          <h1 style={homeStyles.title}>
            Watch Delayed.
            <br />
            Stay In Sync.
          </h1>

          <p style={homeStyles.subtitle}>
            Stat Sync lets you follow your game without spoilers. Watch your
            delayed stream while the score, play-by-play, and box score build in
            sync with what you are actually watching.
          </p>

          <div style={homeStyles.ctaRow}>
            <button
              onClick={() => onChooseSport("nba")}
              style={homeStyles.primaryButton}
            >
              Start with NBA
            </button>

            <div style={homeStyles.inlineNote}>
              NBA available now · MLB and NFL coming soon
            </div>
          </div>
        </div>

        <div style={homeStyles.heroRight}>
          <div style={homeStyles.previewCard}>
            <div style={homeStyles.previewHeader}>
              <div style={homeStyles.previewHeaderLeft}>
                <span style={homeStyles.previewDotGreen}></span>
                <span style={homeStyles.previewLabel}>Live Replay Preview</span>
              </div>
              <span style={homeStyles.previewClock}>Q2 • 07:43</span>
            </div>

            <div style={homeStyles.scoreboard}>
              <div style={homeStyles.teamBlock}>
                <div style={homeStyles.teamLabel}>Away</div>
                <div style={homeStyles.teamName}>Celtics</div>
              </div>

              <div style={homeStyles.scoreBlock}>
                <div style={homeStyles.scoreText}>58 — 55</div>
                <div style={homeStyles.scoreSub}>Building with your stream</div>
              </div>

              <div style={homeStyles.teamBlock}>
                <div style={homeStyles.teamLabel}>Home</div>
                <div style={homeStyles.teamName}>Raptors</div>
              </div>
            </div>

            <div style={homeStyles.feedBox}>
              <div style={homeStyles.feedRow}>
                <span style={homeStyles.feedMeta}>Q2 07:43</span>
                <span style={homeStyles.feedText}>
                  Jaylen Brown makes 15-foot jumper
                </span>
                <span style={homeStyles.feedScore}>58-55</span>
              </div>

              <div style={homeStyles.feedRow}>
                <span style={homeStyles.feedMeta}>Q2 08:01</span>
                <span style={homeStyles.feedText}>
                  Derrick White defensive rebound
                </span>
                <span style={homeStyles.feedScore}>56-55</span>
              </div>

              <div style={homeStyles.feedRow}>
                <span style={homeStyles.feedMeta}>Q2 08:10</span>
                <span style={homeStyles.feedText}>
                  Scottie Barnes misses 3-point shot
                </span>
                <span style={homeStyles.feedScore}>56-55</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={homeStyles.stepsSection}>
        <div style={homeStyles.sectionEyebrow}>How it works</div>
        <h2 style={homeStyles.sectionTitle}>Built for delayed viewing</h2>

        <div style={homeStyles.stepsGrid}>
          <div style={homeStyles.stepCard}>
            <div style={homeStyles.stepNumber}>1</div>
            <div style={homeStyles.stepTitle}>Pick a game</div>
            <div style={homeStyles.stepText}>
              Choose the matchup you want without revealing the final score.
            </div>
          </div>

          <div style={homeStyles.stepCard}>
            <div style={homeStyles.stepNumber}>2</div>
            <div style={homeStyles.stepTitle}>Start your stream</div>
            <div style={homeStyles.stepText}>
              Begin your delayed broadcast whenever you’re ready.
            </div>
          </div>

          <div style={homeStyles.stepCard}>
            <div style={homeStyles.stepNumber}>3</div>
            <div style={homeStyles.stepTitle}>Stay in sync</div>
            <div style={homeStyles.stepText}>
              Watch the score, game clock, and stats build naturally with your viewing.
            </div>
          </div>
        </div>
      </section>

      <section style={homeStyles.sportsSection}>
        <div style={homeStyles.sectionEyebrow}>Sports</div>
        <h2 style={homeStyles.sectionTitle}>One platform, multiple leagues</h2>

        <div style={homeStyles.sportCards}>
          <button
            onClick={() => onChooseSport("nba")}
            style={homeStyles.sportCardActive}
          >
            <div style={homeStyles.sportName}>NBA</div>
            <div style={homeStyles.sportStatusLive}>Available now</div>
          </button>

          <div style={homeStyles.sportCard}>
            <div style={homeStyles.sportName}>MLB</div>
            <div style={homeStyles.sportStatusSoon}>Coming soon</div>
          </div>

          <div style={homeStyles.sportCard}>
            <div style={homeStyles.sportName}>NFL</div>
            <div style={homeStyles.sportStatusSoon}>Coming soon</div>
          </div>
        </div>
      </section>

      <footer style={homeStyles.footer}>
        <div style={homeStyles.footerBrand}>Stat Sync</div>
        <div style={homeStyles.footerText}>
          Watch Delayed. Stay In Sync.
        </div>
        <div style={homeStyles.footerText}>stat-sync.com</div>
      </footer>
    </div>
  );
}
function MlbPlaceholder({ onBack }) {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.heroTitle}>MLB</h1>
            <p style={styles.heroSub}>Coming soon</p>
          </div>

          <button onClick={onBack} style={styles.button}>
            ← Back
          </button>
        </div>

        <div style={styles.sectionCard}>
          MLB mode is not built yet. NBA replay is available now, and NFL is coming soon.
        </div>
      </div>
    </div>
  );
}

function NflPlaceholder({ onBack }) {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.heroTitle}>NFL</h1>
            <p style={styles.heroSub}>Coming soon</p>
          </div>

          <button onClick={onBack} style={styles.button}>
            ← Back
          </button>
        </div>

        <div style={styles.sectionCard}>
          NFL mode is not built yet. NBA replay is available now, and MLB is coming soon.
        </div>
      </div>
    </div>
  );
}

function NbaPage({ onBack }) {
  const isMobile = useIsMobile();

  const [gamesPayload, setGamesPayload] = useState({
    date: "",
    selectedGameId: null,
    games: [],
  });

  const [playbackPayload, setPlaybackPayload] = useState({
    hasPlayback: false,
    playbackIndex: 0,
    totalActions: 0,
    isPlaying: false,
    visibleActions: [],
    rebuiltGame: null,
    liveGame: null,
    currentPlay: null,
    nextPlay: null,
    playbackOffsetMs: 0,
  });

  const [revealedFinalGameIds, setRevealedFinalGameIds] = useState(
    loadRevealedGameIds
  );
  const [displayClock, setDisplayClock] = useState("12:00");
  const [displayPeriod, setDisplayPeriod] = useState(1);

  useEffect(() => {
  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connect_error:", err.message);
  });

  socket.on("games_list_update", (payload) => {
    console.log("games_list_update received:", payload);
    setGamesPayload(payload);
  });

  socket.on("playback_update", (payload) => {
    console.log("playback_update received:", payload);
    setPlaybackPayload(payload);
  });

  socket.emit("request_playback_state");

  return () => {
    socket.off("connect");
    socket.off("connect_error");
    socket.off("games_list_update");
    socket.off("playback_update");
  };
}, []);

  useEffect(() => {
    localStorage.setItem(
      REVEAL_STORAGE_KEY,
      JSON.stringify(revealedFinalGameIds)
    );
  }, [revealedFinalGameIds]);

  useEffect(() => {
    let intervalId = null;

    function updateClock() {
      const currentPlay = playbackPayload.currentPlay;
      const nextPlay = playbackPayload.nextPlay;
      const playbackOffsetMs = playbackPayload.playbackOffsetMs;

      if (!currentPlay) {
        setDisplayPeriod(1);
        setDisplayClock("12:00");
        return;
      }

      const currentPeriod = Number(currentPlay.period || 1);
      const currentClockSecs = parseClockToSeconds(currentPlay.clock);

      if (currentClockSecs == null) {
        setDisplayPeriod(currentPeriod);
        setDisplayClock(currentPlay.clock || "12:00");
        return;
      }

      if (!nextPlay || Number(nextPlay.period) !== currentPeriod) {
        setDisplayPeriod(currentPeriod);
        setDisplayClock(currentPlay.clock || "12:00");
        return;
      }

      const nextClockSecs = parseClockToSeconds(nextPlay.clock);
      const currentOffset = currentPlay.offsetMs;
      const nextOffset = nextPlay.offsetMs;

      if (
        nextClockSecs == null ||
        currentOffset == null ||
        nextOffset == null ||
        nextOffset <= currentOffset
      ) {
        setDisplayPeriod(currentPeriod);
        setDisplayClock(currentPlay.clock || "12:00");
        return;
      }

      const realGapSec = (nextOffset - currentOffset) / 1000;
      const gameClockGapSec = currentClockSecs - nextClockSecs;

      if (gameClockGapSec <= 0) {
        setDisplayPeriod(currentPeriod);
        setDisplayClock(currentPlay.clock || "12:00");
        return;
      }

      const elapsedSinceCurrentPlaySec = Math.max(
        0,
        (playbackOffsetMs - currentOffset) / 1000
      );

      const holdBeforeCountdownSec = Math.max(0, realGapSec - gameClockGapSec);

      let displaySeconds;

      if (elapsedSinceCurrentPlaySec < holdBeforeCountdownSec) {
        displaySeconds = currentClockSecs;
      } else {
        const countdownElapsedSec =
          elapsedSinceCurrentPlaySec - holdBeforeCountdownSec;
        displaySeconds = Math.max(
          nextClockSecs,
          currentClockSecs - countdownElapsedSec
        );
      }

      setDisplayPeriod(currentPeriod);
      setDisplayClock(formatSecondsToClock(displaySeconds));
    }

    updateClock();
    intervalId = setInterval(updateClock, 250);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [playbackPayload]);

  function isFinalGameRevealed(gameId) {
    return Boolean(revealedFinalGameIds[gameId]);
  }

  function toggleFinalRevealForGame(gameId) {
    setRevealedFinalGameIds((prev) => ({
      ...prev,
      [gameId]: !prev[gameId],
    }));
  }

  function hideAllFinalScores() {
    setRevealedFinalGameIds({});
  }

  function selectGame(gameId) {
    socket.emit("select_game", gameId);
  }

  function startFromBeginning() {
    socket.emit("start_from_beginning");
  }

  function setPlaying(isPlaying) {
    socket.emit("set_playing", isPlaying);
  }

  function advancePlayback(step) {
    socket.emit("advance_playback", step);
  }

  function handlePlaybackSlider(e) {
    socket.emit("set_playback_index", Number(e.target.value));
  }

  function jumpToPeriod(period) {
    socket.emit("jump_to_period", period);
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function changeDate(offsetDays) {
    const baseDate = gamesPayload.date ? new Date(gamesPayload.date) : new Date();
    baseDate.setDate(baseDate.getDate() + offsetDays);
    socket.emit("set_games_date", formatDate(baseDate));
  }

  function jumpToToday() {
    socket.emit("set_games_date", formatDate(new Date()));
  }

  const game = playbackPayload.rebuiltGame;

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.heroTitle}>NBA Sync Replay</h1>
            <p style={styles.heroSub}>
              Spoiler-safe game tracking for delayed viewers
            </p>
          </div>

          <button onClick={onBack} style={styles.button}>
            ← Back
          </button>
        </div>

        <div
          style={{
            ...styles.sectionCard,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
            background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={styles.label}>Spoiler-safe mode</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>
              Final scores stay hidden in the game list.
            </div>
            <div style={{ marginTop: 4, color: theme.muted, fontSize: 14 }}>
              Replay score, clock, play-by-play, and box score build naturally as
              playback advances.
            </div>
          </div>

          <button onClick={hideAllFinalScores} style={styles.button}>
            Hide All Final Scores
          </button>
        </div>

        <div style={{ ...styles.sectionCard, marginBottom: 20 }}>
          <div style={styles.label}>Game Date</div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginTop: 12,
            }}
          >
            <button onClick={() => changeDate(-1)} style={styles.button}>
              Previous Day
            </button>

            <button onClick={jumpToToday} style={styles.softButton}>
              Today
            </button>

            <button onClick={() => changeDate(1)} style={styles.button}>
              Next Day
            </button>

            <div
              style={{
                marginLeft: 10,
                color: theme.muted,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Current date:{" "}
              <span style={{ color: theme.text }}>
                {gamesPayload.date || "Loading..."}
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "320px minmax(0, 1fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <div
            style={{
              ...styles.sectionCard,
              padding: 16,
              position: isMobile ? "static" : "sticky",
              top: 20,
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 14 }}>Games</h2>

            {gamesPayload.games.length === 0 ? (
              <div>No games found for this date.</div>
            ) : (
              gamesPayload.games.map((g) => {
                const selected = g.id === gamesPayload.selectedGameId;
                const revealed = isFinalGameRevealed(g.id);

                return (
                  <div
                    key={g.id}
                    style={{
                      marginBottom: 12,
                      padding: 14,
                      borderRadius: 14,
                      border: selected
                        ? `2px solid ${theme.primary}`
                        : `1px solid ${theme.border}`,
                      backgroundColor: selected ? "#eff6ff" : "white",
                      boxShadow: selected
                        ? "0 6px 16px rgba(29, 78, 216, 0.12)"
                        : "none",
                    }}
                  >
                    <button
                      onClick={() => selectGame(g.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        marginBottom: 12,
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 800, lineHeight: 1.4 }}>
                        {g.awayTeam.name} @ {g.homeTeam.name}
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 20,
                          fontWeight: 800,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        <ScoreText
                          value={`${g.awayTeam.score} - ${g.homeTeam.score}`}
                          reveal={revealed}
                        />
                      </div>

                      <div style={{ color: theme.muted, fontSize: 13, marginTop: 6 }}>
                        {g.statusText}
                      </div>
                    </button>

                    <button
                      onClick={() => toggleFinalRevealForGame(g.id)}
                      style={styles.button}
                    >
                      {revealed ? "Hide Final Score" : "Reveal Final Score"}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ ...styles.sectionCard, marginBottom: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={styles.label}>Playback Controls</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    Visible plays: {playbackPayload.playbackIndex} /{" "}
                    {playbackPayload.totalActions}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button onClick={startFromBeginning} style={styles.button}>
                    Start
                  </button>
                  <button onClick={() => setPlaying(true)} style={styles.primaryButton}>
                    Play
                  </button>
                  <button onClick={() => setPlaying(false)} style={styles.button}>
                    Pause
                  </button>
                  <button onClick={() => advancePlayback(1)} style={styles.button}>
                    +1 Play
                  </button>
                  <button onClick={() => jumpToPeriod(2)} style={styles.button}>
                    Q2
                  </button>
                  <button onClick={() => jumpToPeriod(3)} style={styles.button}>
                    Q3
                  </button>
                  <button onClick={() => jumpToPeriod(4)} style={styles.button}>
                    Q4
                  </button>
                </div>
              </div>

              <input
                type="range"
                min="0"
                max={playbackPayload.totalActions || 0}
                step="1"
                value={Math.min(
                  playbackPayload.playbackIndex,
                  playbackPayload.totalActions || 0
                )}
                onChange={handlePlaybackSlider}
                style={{ width: "100%" }}
              />
            </div>

            {!playbackPayload.hasPlayback || !game ? (
              <div style={styles.sectionCard}>
                {playbackPayload.message || "Waiting for playback data..."}
              </div>
            ) : (
              <>
                <div
                  style={{
                    ...styles.sectionCard,
                    marginBottom: 20,
                    padding: 22,
                  }}
                >
                  <div style={styles.label}>Live Replay</div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1fr auto 1fr",
                      alignItems: "center",
                      gap: 16,
                      marginTop: 10,
                      textAlign: isMobile ? "center" : "initial",
                    }}
                  >
                    <div style={{ textAlign: isMobile ? "center" : "right" }}>
                      <div
                        style={{
                          color: theme.muted,
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        Away
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800 }}>
                        {game.awayTeam.name}
                      </div>
                    </div>

                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontSize: 34,
                          fontWeight: 900,
                          letterSpacing: "-0.03em",
                        }}
                      >
                        <ScoreText value={game.awayTeam.score} reveal={true} />{" "}
                        <span style={{ color: theme.muted }}>—</span>{" "}
                        <ScoreText value={game.homeTeam.score} reveal={true} />
                      </div>

                      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>
                        Q{displayPeriod} • {displayClock}
                      </div>
                    </div>

                    <div style={{ textAlign: isMobile ? "center" : "left" }}>
                      <div
                        style={{
                          color: theme.muted,
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        Home
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800 }}>
                        {game.homeTeam.name}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 30 }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={styles.label}>Box Score</div>
                    <h2 style={{ margin: "6px 0 0" }}>Live Box Score</h2>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      gap: 20,
                      alignItems: "flex-start",
                    }}
                  >
                    <TeamColumn
                      teamName={game.awayTeam.name}
                      players={game.rosters?.[game.awayTeam.name] || []}
                    />
                    <TeamColumn
                      teamName={game.homeTeam.name}
                      players={game.rosters?.[game.homeTeam.name] || []}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={styles.label}>Play-by-Play</div>
                    <h2 style={{ margin: "6px 0 0" }}>Game Feed</h2>
                  </div>

                  {playbackPayload.visibleActions.length === 0 ? (
                    <div style={styles.sectionCard}>
                      No plays visible yet. Press Play or advance the timeline.
                    </div>
                  ) : (
                    <div
                      style={{
                        ...styles.sectionCard,
                        padding: 16,
                        maxHeight: 520,
                        overflowY: "auto",
                      }}
                    >
                      {playbackPayload.visibleActions
                        .slice(-40)
                        .reverse()
                        .map((action) => {
                          const text =
                            action.text ||
                            action.description ||
                            action.actionType ||
                            action.action_type ||
                            action.event_type ||
                            action.type ||
                            "Play";

                          const clock =
                            action.clock ||
                            action.game_clock ||
                            action.time ||
                            "";

                          const period = action.period || action.quarter || "";

                          const awayScore =
                            action.scoreAway ??
                            action.score_away ??
                            action.away_score ??
                            "";

                          const homeScore =
                            action.scoreHome ??
                            action.score_home ??
                            action.home_score ??
                            "";

                          return (
                            <div
                              key={
                                action.orderNumber ||
                                action.actionNumber ||
                                action.order
                              }
                              style={{
                                padding: "12px 0",
                                borderBottom: "1px solid #edf2f7",
                                display: "grid",
                                gridTemplateColumns: isMobile
                                  ? "1fr"
                                  : "76px 1fr 72px",
                                gap: 14,
                                alignItems: "start",
                                fontSize: 14,
                              }}
                            >
                              <div style={{ color: theme.muted, fontWeight: 700 }}>
                                Q{period} {clock}
                              </div>

                              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                                {String(text).replace(/\n/g, " ")}
                              </div>

                              <div
                                style={{
                                  textAlign: isMobile ? "left" : "right",
                                  color: theme.text,
                                  fontWeight: 700,
                                }}
                              >
                                {awayScore !== "" && homeScore !== ""
                                  ? `${awayScore}-${homeScore}`
                                  : ""}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [selectedSport, setSelectedSport] = useState(null);

  if (!selectedSport) {
    return <HomePage onChooseSport={setSelectedSport} />;
  }

  if (selectedSport === "mlb") {
    return <MlbPlaceholder onBack={() => setSelectedSport(null)} />;
  }

  if (selectedSport === "nfl") {
    return <NflPlaceholder onBack={() => setSelectedSport(null)} />;
  }

  return <NbaPage onBack={() => setSelectedSport(null)} />;
}

export default App;
const homeStyles = {
 page: {
  minHeight: "100vh",
  background:
    "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
  },

  nav: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "24px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },

  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },

  logo: {
    width: 48,
    height: 48,
    objectFit: "contain",
    borderRadius: 12,
  },

  brand: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },

  brandSub: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 2,
  },

  navPills: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  navPill: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: 700,
  },

  navPillActive: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(34,197,94,0.45)",
    backgroundColor: "rgba(34,197,94,0.14)",
    color: "#86EFAC",
    fontSize: 13,
    fontWeight: 700,
  },

  hero: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "40px 20px 20px",
    display: "grid",
    gridTemplateColumns:
  typeof window !== "undefined" && window.innerWidth < 900
    ? "1fr"
    : "1.1fr 0.9fr",
    gap: 36,
    alignItems: "center",
  },

  heroLeft: {
    minWidth: 0,
  },

  badge: {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.16)",
    border: "1px solid rgba(59,130,246,0.35)",
    color: "#BFDBFE",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 18,
  },

title: {
  fontSize: "clamp(42px, 7vw, 72px)",
  lineHeight: 0.96,
  margin: 0,
  fontWeight: 900,
  letterSpacing: "-0.05em",
  background: "linear-gradient(90deg, white, #22C55E)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent"
},

  subtitle: {
    marginTop: 18,
    maxWidth: 620,
    color: "#CBD5E1",
    fontSize: 18,
    lineHeight: 1.7,
  },

  ctaRow: {
    marginTop: 28,
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },

  primaryButton: {
    background: "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)",
    color: "white",
    border: "none",
    borderRadius: 16,
    padding: "16px 22px",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(34,197,94,0.28)",
  },

  inlineNote: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: 600,
  },

  heroRight: {
    minWidth: 0,
  },

  previewCard: {
    background: "rgba(15,23,42,0.72)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 24,
    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
    padding: 20,
  },

  previewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
    flexWrap: "wrap",
  },

  previewHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  previewDotGreen: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    backgroundColor: "#22C55E",
    boxShadow: "0 0 14px rgba(34,197,94,0.8)",
  },

  previewLabel: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: 700,
  },

  previewClock: {
    color: "#86EFAC",
    fontWeight: 800,
    fontSize: 14,
  },

  scoreboard: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: 16,
    alignItems: "center",
    padding: "18px 16px",
    borderRadius: 18,
    background: "linear-gradient(180deg, rgba(30,41,59,0.9), rgba(15,23,42,0.9))",
    border: "1px solid rgba(255,255,255,0.08)",
  },

  teamBlock: {
    textAlign: "center",
  },

  teamLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },

  teamName: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: 800,
  },

  scoreBlock: {
    textAlign: "center",
  },

  scoreText: {
    fontSize: 34,
    fontWeight: 900,
    letterSpacing: "-0.04em",
  },

  scoreSub: {
    marginTop: 6,
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: 600,
  },

  feedBox: {
    marginTop: 18,
    borderRadius: 18,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  feedRow: {
    display: "grid",
    gridTemplateColumns: "78px 1fr 70px",
    gap: 12,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontSize: 14,
    alignItems: "start",
  },

  feedMeta: {
    color: "#94A3B8",
    fontWeight: 700,
  },

  feedText: {
    color: "#F8FAFC",
    lineHeight: 1.5,
  },

  feedScore: {
    textAlign: "right",
    color: "#E2E8F0",
    fontWeight: 800,
  },

  stepsSection: {
    maxWidth: 1200,
    margin: "60px auto 0",
    padding: "0 20px",
  },

  sportsSection: {
    maxWidth: 1200,
    margin: "60px auto 0",
    padding: "0 20px 20px",
  },

  sectionEyebrow: {
    color: "#86EFAC",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 10,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },

  stepsGrid: {
    display: "grid",
gridTemplateColumns:
  typeof window !== "undefined" && window.innerWidth < 900
    ? "1fr"
    : "repeat(3, minmax(0, 1fr))",
    gap: 18,
    marginTop: 22,
  },

  stepCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 22,
  },

  stepNumber: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,197,94,0.14)",
    color: "#86EFAC",
    fontWeight: 900,
    marginBottom: 14,
  },

  stepTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 10,
  },

  stepText: {
    color: "#CBD5E1",
    lineHeight: 1.7,
    fontSize: 15,
  },

  sportCards: {
    display: "grid",
  gridTemplateColumns:
  typeof window !== "undefined" && window.innerWidth < 900
    ? "1fr"
    : "repeat(3, minmax(0, 1fr))",
    gap: 18,
    marginTop: 22,
  },

  sportCardActive: {
    background: "linear-gradient(180deg, rgba(34,197,94,0.16), rgba(255,255,255,0.05))",
    border: "1px solid rgba(34,197,94,0.35)",
    borderRadius: 20,
    padding: 24,
    color: "white",
    textAlign: "left",
    cursor: "pointer",
  },

  sportCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 24,
  },

  sportName: {
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 8,
  },

  sportStatusLive: {
    color: "#86EFAC",
    fontWeight: 700,
    fontSize: 14,
  },

  sportStatusSoon: {
    color: "#94A3B8",
    fontWeight: 700,
    fontSize: 14,
  },

  footer: {
    maxWidth: 1200,
    margin: "50px auto 0",
    padding: "30px 20px 50px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },

  footerBrand: {
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 8,
  },

  footerText: {
    color: "#94A3B8",
    fontSize: 14,
    marginBottom: 4,
  },
};