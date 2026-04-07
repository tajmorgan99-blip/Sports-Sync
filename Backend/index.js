require("dotenv").config();

const DEBUG = false;
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const EXTRA_ORIGINS = (process.env.EXTRA_FRONTEND_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = ["http://localhost:5173", FRONTEND_ORIGIN, ...EXTRA_ORIGINS];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
  },
});

const API_KEY = process.env.BALLDONTLIE_API_KEY;
const POLL_MS = Number(process.env.POLL_MS || 15000);
const PLAYBACK_TICK_MS = 250;

if (!API_KEY) {
  console.error("Missing BALLDONTLIE_API_KEY in backend/.env or deployment env");
  process.exit(1);
}

const api = axios.create({
  baseURL: "https://api.balldontlie.io/v1",
  headers: {
    Authorization: API_KEY,
  },
  timeout: 15000,
});

let currentDate = new Date().toISOString().slice(0, 10);
let selectedGameId = null;

let lastGamesListJson = "";
let selectedGameMeta = null;
let selectedGameStats = [];
let selectedGamePlays = [];

const userStateMap = new Map();

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getUserState(socketId) {
  if (!userStateMap.has(socketId)) {
    userStateMap.set(socketId, {
      playbackStartedAtMs: null,
      playbackBaseOffsetMs: 0,
      isPlaying: false,
    });
  }
  return userStateMap.get(socketId);
}

function getCurrentPlaybackOffsetMs(state) {
  if (!state.isPlaying || state.playbackStartedAtMs == null) {
    return state.playbackBaseOffsetMs || 0;
  }

  const elapsed = Date.now() - state.playbackStartedAtMs;
  return (state.playbackBaseOffsetMs || 0) + Math.max(0, elapsed);
}

function stopUserPlayback(socketId) {
  const state = getUserState(socketId);
  state.playbackBaseOffsetMs = getCurrentPlaybackOffsetMs(state);
  state.playbackStartedAtMs = null;
  state.isPlaying = false;
}

async function pagedGet(path, params = {}) {
  let cursor = undefined;
  let out = [];

  while (true) {
    const response = await api.get(path, {
      params: {
        ...params,
        per_page: 100,
        ...(cursor !== undefined ? { cursor } : {}),
      },
    });

    const pageData = response.data?.data || [];
    out = out.concat(pageData);

    const nextCursor = response.data?.meta?.next_cursor;
    if (nextCursor === undefined || nextCursor === null) {
      break;
    }

    cursor = nextCursor;
  }

  return out;
}

async function fetchGames(dateStr) {
  const response = await api.get("/games", {
    params: {
      "dates[]": dateStr,
      per_page: 100,
    },
  });

  const games = response.data?.data || [];

  return games.map((game) => ({
    id: game.id,
    date: game.date,
    statusText: game.status || "",
    period: toNumber(game.period),
    clock: game.time || "",
    homeTeam: {
      id: game.home_team?.id ?? null,
      name: game.home_team?.full_name || game.home_team?.name || "Home",
      shortName: game.home_team?.abbreviation || game.home_team?.name || "HOME",
      score: toNumber(game.home_team_score),
    },
    awayTeam: {
      id: game.visitor_team?.id ?? null,
      name: game.visitor_team?.full_name || game.visitor_team?.name || "Away",
      shortName:
        game.visitor_team?.abbreviation || game.visitor_team?.name || "AWAY",
      score: toNumber(game.visitor_team_score),
    },
  }));
}

async function fetchGameStats(gameId) {
  return pagedGet("/stats", {
    "game_ids[]": gameId,
  });
}

async function fetchPlays(gameId) {
  return pagedGet("/plays", {
    game_id: gameId,
  });
}

function normalizeStatRow(stat) {
  const player = stat.player || {};
  const team = stat.team || {};

  return {
    playerId: player.id ?? null,
    name:
      [player.first_name, player.last_name].filter(Boolean).join(" ") ||
      stat.player_name ||
      "Unknown Player",
    teamId: team.id ?? null,
    teamName: team.full_name || team.name || "Unknown Team",
    points: toNumber(stat.pts ?? stat.points),
    rebounds: toNumber(stat.reb ?? stat.rebounds),
    assists: toNumber(stat.ast ?? stat.assists),
    steals: toNumber(stat.stl ?? stat.steals),
    blocks: toNumber(stat.blk ?? stat.blocks),
    turnovers: toNumber(stat.turnover ?? stat.turnovers ?? stat.to),
    fouls: toNumber(stat.pf ?? stat.fouls),
    fgm: 0,
    fga: 0,
    ftm: 0,
    fta: 0,
    threePm: 0,
    minutes: "0:00",
  };
}

function getPlayTeamId(play) {
  return play.team?.id ?? play.team_id ?? play.teamId ?? null;
}

function getPlayTeamName(play) {
  return (
    play.team?.full_name ||
    play.team?.name ||
    play.team_name ||
    play.teamName ||
    ""
  );
}

function getPlayTimestampMs(play) {
  if (!play?.wallclock) return null;
  const ms = new Date(play.wallclock).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function buildTimedPlays(plays) {
  if (!Array.isArray(plays) || plays.length === 0) return [];

  const sortedPlays = [...plays].sort((a, b) => {
    const aOrder = toNumber(a.order ?? a.orderNumber ?? a.actionNumber);
    const bOrder = toNumber(b.order ?? b.orderNumber ?? b.actionNumber);
    return aOrder - bOrder;
  });

  const firstMs = getPlayTimestampMs(sortedPlays[0]);

  return sortedPlays.map((play) => {
    const wallclockMs = getPlayTimestampMs(play);

    return {
      ...play,
      wallclockMs,
      offsetMs:
        firstMs != null && wallclockMs != null
          ? Math.max(0, wallclockMs - firstMs)
          : 0,
    };
  });
}

function buildRosterSeed(gameMeta, statsRows) {
  const rosters = {
    [gameMeta.homeTeam.name]: [],
    [gameMeta.awayTeam.name]: [],
  };

  const playerTeamLookup = {};

  for (const raw of statsRows) {
    const stat = normalizeStatRow(raw);

    if (stat.teamId === gameMeta.homeTeam.id) {
      playerTeamLookup[stat.name] = gameMeta.homeTeam.name;
    } else if (stat.teamId === gameMeta.awayTeam.id) {
      playerTeamLookup[stat.name] = gameMeta.awayTeam.name;
    }
  }

  return { rosters, playerTeamLookup };
}

function cloneRosterSeed(rosterSeed) {
  const out = {};

  for (const [teamName, players] of Object.entries(rosterSeed || {})) {
    out[teamName] = Array.isArray(players)
      ? players.map((p) => ({ ...p }))
      : [];
  }

  return out;
}

function findOrCreatePlayer(rosters, teamName, playerName, teamId = null) {
  if (!playerName || !teamName) return null;

  const invalidNames = [
    "back court",
    "steps out of bounds",
    "shot clock",
    "turnover",
    "violation",
  ];

  if (invalidNames.includes(String(playerName).toLowerCase().trim())) {
    return null;
  }

  if (!Array.isArray(rosters[teamName])) {
    rosters[teamName] = [];
  }

  let player = rosters[teamName].find((p) => p.name === playerName);

  if (!player) {
    player = {
      playerId: null,
      name: playerName,
      teamId,
      teamName,
      points: 0,
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
      threePm: 0,
      minutes: "0:00",
    };
    rosters[teamName].push(player);
  }

  return player;
}

function resolveTeamName(gameMeta, teamId, teamNameFromPlay) {
  if (teamId === gameMeta.homeTeam.id) return gameMeta.homeTeam.name;
  if (teamId === gameMeta.awayTeam.id) return gameMeta.awayTeam.name;

  if (teamNameFromPlay) {
    if (
      teamNameFromPlay === gameMeta.homeTeam.name ||
      teamNameFromPlay === gameMeta.homeTeam.shortName
    ) {
      return gameMeta.homeTeam.name;
    }

    if (
      teamNameFromPlay === gameMeta.awayTeam.name ||
      teamNameFromPlay === gameMeta.awayTeam.shortName
    ) {
      return gameMeta.awayTeam.name;
    }
  }

  return "";
}

function isTeamRebound(text) {
  return /\bteam rebound\b/i.test(text);
}

function extractScorer(text) {
  const match = String(text).match(/^(.+?) makes /i);
  return match ? match[1].trim() : null;
}

function extractRebounder(text) {
  if (isTeamRebound(text)) return null;
  const match = String(text).match(/^(.+?) (defensive|offensive) rebound$/i);
  return match ? match[1].trim() : null;
}

function extractAssist(text) {
  const match = String(text).match(/\((.+?) assists\)/i);
  return match ? match[1].trim() : null;
}

function extractSteal(text) {
  const match = String(text).match(/\((.+?) steals\)/i);
  return match ? match[1].trim() : null;
}

function extractBlock(text) {
  const normalized = String(text).replace(/\s+'/g, "'").trim();

  let match = normalized.match(/^(.+?) blocks (.+?)'s /i);
  if (match) return match[1].trim();

  match = normalized.match(/^(.+?) blocks (.+?) \x27s /i);
  if (match) return match[1].trim();

  match = normalized.match(/\(blocked by (.+?)\)/i);
  if (match) return match[1].trim();

  return null;
}

function extractMissedShooter(text) {
  const normalized = String(text).replace(/\s+'/g, "'").trim();

  let match = normalized.match(/^(.+?) misses /i);
  if (match) return match[1].trim();

  match = normalized.match(/^(.+?) blocks (.+?)'s /i);
  if (match) return match[2].trim();

  match = normalized.match(/^(.+?) blocks (.+?) \x27s /i);
  if (match) return match[2].trim();

  return null;
}

function extractTurnoverPlayer(text) {
  const normalized = String(text).replace(/\n/g, " ").trim();

  if (/^shot clock turnover$/i.test(normalized)) return null;
  if (/^\d+\s*second violation$/i.test(normalized)) return null;

  const patterns = [
    /^(.+?) out of bounds lost ball turnover$/i,
    /^(.+?) out of bounds bad pass turnover$/i,
    /^(.+?) bad pass turnover(?:\s*\(.+? steals\))?$/i,
    /^(.+?) lost ball turnover(?:\s*\(.+? steals\))?$/i,
    /^(.+?) offensive foul turnover$/i,
    /^(.+?) back court(?: turnover)?$/i,
    /^(.+?) steps out of bounds(?: turnover)?$/i,
    /^(.+?) double dribble(?: turnover)?$/i,
    /^(.+?) traveling(?: turnover)?$/i,
    /^(.+?) carries(?: turnover)?$/i,
    /^(.+?) palming(?: turnover)?$/i,
    /^(.+?) offensive goaltending(?: turnover)?$/i,
    /^(.+?) lane violation(?: turnover)?$/i,
    /^(.+?) turnover$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return match[1].trim();
  }

  return null;
}

function extractFoulPlayer(text) {
  const normalized = String(text).trim();

  const suffixes = [
    " personal take foul",
    " personal foul",
    " shooting foul",
    " loose ball foul",
    " offensive foul",
    " foul",
  ];

  const lower = normalized.toLowerCase();

  for (const suffix of suffixes) {
    const idx = lower.indexOf(suffix);
    if (idx > 0) return normalized.slice(0, idx).trim();
  }

  return null;
}

function getScoreForTeam(play, gameMeta, teamName) {
  if (!play) return null;
  if (teamName === gameMeta.homeTeam.name) return toNumber(play.home_score);
  if (teamName === gameMeta.awayTeam.name) return toNumber(play.away_score);
  return null;
}

function inferPointsFromScoreDelta(prevPlay, play, gameMeta, scoringTeamName) {
  const prevScore = getScoreForTeam(prevPlay, gameMeta, scoringTeamName);
  const currentScore = getScoreForTeam(play, gameMeta, scoringTeamName);

  if (prevScore == null || currentScore == null) return 0;

  const delta = currentScore - prevScore;
  return delta >= 1 && delta <= 4 ? delta : 0;
}

function isMadeFreeThrow(text) {
  return /makes free throw/i.test(text);
}

function isMissedFreeThrow(text) {
  return /misses free throw/i.test(text);
}

function isMadeFieldGoal(text) {
  return /^.+? makes /i.test(text) && !/free throw/i.test(text);
}

function isMissedFieldGoal(text) {
  const normalized = String(text).trim();
  return (
    (/^.+? misses /i.test(normalized) ||
      /^.+? blocks .+?'s /i.test(normalized) ||
      /^.+? blocks .+? \x27s /i.test(normalized)) &&
    !/free throw/i.test(normalized)
  );
}

function isThreePointer(text) {
  return /three point|three-pointer|three pointer/i.test(text);
}

function applyPlayToStats(play, prevPlay, gameMeta, rosters, playerTeamLookup) {
  const text = String(play.text || "");
  const lower = text.toLowerCase();

  const teamId = getPlayTeamId(play);
  const teamNameFromPlay = getPlayTeamName(play);
  const teamName = resolveTeamName(gameMeta, teamId, teamNameFromPlay);

  if (!teamName) return;

  if (
    lower.includes("enters the game for") ||
    lower.includes("timeout") ||
    lower.includes("coach's challenge") ||
    lower.includes("end of the") ||
    lower.includes("gains possession") ||
    lower.includes("jumpball")
  ) {
    return;
  }

  const scorerName = extractScorer(text);
  if (scorerName) {
    const scorer = findOrCreatePlayer(rosters, teamName, scorerName, teamId);
    if (scorer) {
      const deltaPoints = inferPointsFromScoreDelta(prevPlay, play, gameMeta, teamName);

      if (deltaPoints > 0) scorer.points += deltaPoints;

      if (isMadeFreeThrow(text)) {
        scorer.ftm += 1;
        scorer.fta += 1;
      } else if (isMadeFieldGoal(text)) {
        scorer.fgm += 1;
        scorer.fga += 1;
        if (isThreePointer(text)) scorer.threePm += 1;
      }

      playerTeamLookup[scorerName] = teamName;
    }

    const assistName = extractAssist(text);
    if (assistName && assistName !== scorerName) {
      const assister = findOrCreatePlayer(rosters, teamName, assistName, teamId);
      if (assister) {
        assister.assists += 1;
        playerTeamLookup[assistName] = teamName;
      }
    }

    return;
  }

  const missedShooterName = extractMissedShooter(text);
  if (missedShooterName) {
    const missedShooter = findOrCreatePlayer(rosters, teamName, missedShooterName, teamId);
    if (missedShooter) {
      if (isMissedFreeThrow(text)) {
        missedShooter.fta += 1;
      } else if (isMissedFieldGoal(text)) {
        missedShooter.fga += 1;
      }

      playerTeamLookup[missedShooterName] = teamName;
    }

    const blockName = extractBlock(text);
    if (blockName) {
      let blockTeamName = playerTeamLookup[blockName];
      if (!blockTeamName) {
        blockTeamName =
          teamName === gameMeta.homeTeam.name
            ? gameMeta.awayTeam.name
            : gameMeta.homeTeam.name;
      }

      const blockPlayer = findOrCreatePlayer(rosters, blockTeamName, blockName, null);
      if (blockPlayer) {
        blockPlayer.blocks += 1;
        playerTeamLookup[blockName] = blockTeamName;
      }
    }

    return;
  }

  const rebounderName = extractRebounder(text);
  if (rebounderName) {
    const rebounder = findOrCreatePlayer(rosters, teamName, rebounderName, teamId);
    if (rebounder) {
      rebounder.rebounds += 1;
      playerTeamLookup[rebounderName] = teamName;
    }
    return;
  }

  if (lower.includes("turnover") || /^\d+\s*second violation$/i.test(text.trim())) {
    const turnoverName = extractTurnoverPlayer(text);
    if (turnoverName) {
      const turnoverPlayer = findOrCreatePlayer(rosters, teamName, turnoverName, teamId);
      if (turnoverPlayer) {
        turnoverPlayer.turnovers += 1;
        playerTeamLookup[turnoverName] = teamName;
      }
    }

    const stealName = extractSteal(text);
    if (stealName) {
      let stealTeamName = playerTeamLookup[stealName];
      if (!stealTeamName) {
        stealTeamName =
          teamName === gameMeta.homeTeam.name
            ? gameMeta.awayTeam.name
            : gameMeta.homeTeam.name;
      }

      const stealPlayer = findOrCreatePlayer(rosters, stealTeamName, stealName, null);
      if (stealPlayer) {
        stealPlayer.steals += 1;
        playerTeamLookup[stealName] = stealTeamName;
      }
    }

    return;
  }

  const foulName = extractFoulPlayer(text);
  if (foulName) {
    const foulPlayer = findOrCreatePlayer(rosters, teamName, foulName, teamId);
    if (foulPlayer) {
      foulPlayer.fouls += 1;
      playerTeamLookup[foulName] = teamName;
    }
  }
}

function getVisiblePlayCountFromOffset(plays, offsetMs) {
  if (!Array.isArray(plays) || plays.length === 0) return 0;

  let count = 0;
  for (const play of plays) {
    if ((play.offsetMs || 0) <= offsetMs) count += 1;
    else break;
  }
  return count;
}

function buildPlaybackState(gameMeta, statsRows, plays, playbackIndex) {
  const seed = buildRosterSeed(gameMeta, statsRows);
  const rosters = cloneRosterSeed(seed.rosters);
  const playerTeamLookup = { ...seed.playerTeamLookup };

  const homeTeamName = gameMeta.homeTeam.name;
  const awayTeamName = gameMeta.awayTeam.name;

  if (!Array.isArray(rosters[homeTeamName])) rosters[homeTeamName] = [];
  if (!Array.isArray(rosters[awayTeamName])) rosters[awayTeamName] = [];

  const safeIndex = Math.max(0, Math.min(playbackIndex, plays.length));
  const visibleActions = plays.slice(0, safeIndex);

  for (let i = 0; i < visibleActions.length; i++) {
    const play = visibleActions[i];
    const prevPlay = i > 0 ? visibleActions[i - 1] : null;
    applyPlayToStats(play, prevPlay, gameMeta, rosters, playerTeamLookup);
  }

  for (const teamName of Object.keys(rosters)) {
    rosters[teamName].sort(
      (a, b) =>
        b.points - a.points ||
        b.rebounds - a.rebounds ||
        b.assists - a.assists ||
        a.name.localeCompare(b.name)
    );
  }

  const lastVisiblePlay = visibleActions[visibleActions.length - 1];

  let homeScore = rosters[homeTeamName].reduce((sum, p) => sum + p.points, 0);
  let awayScore = rosters[awayTeamName].reduce((sum, p) => sum + p.points, 0);

  const liveHomeScore = lastVisiblePlay?.home_score;
  const liveAwayScore = lastVisiblePlay?.away_score;

  if (liveHomeScore != null && liveHomeScore !== "") homeScore = toNumber(liveHomeScore);
  if (liveAwayScore != null && liveAwayScore !== "") awayScore = toNumber(liveAwayScore);

  return {
    hasPlayback: true,
    playbackIndex: safeIndex,
    totalActions: plays.length,
    visibleActions,
    rebuiltGame: {
      hasGame: true,
      gameId: gameMeta.id,
      gameStatusText: "Playback From Start",
      period: toNumber(lastVisiblePlay?.period ?? 0),
      clock: lastVisiblePlay?.clock || "",
      homeTeam: { ...gameMeta.homeTeam, score: homeScore },
      awayTeam: { ...gameMeta.awayTeam, score: awayScore },
      rosters,
    },
    liveGame: gameMeta,
  };
}

function emitPlaybackState(socket) {
  const state = getUserState(socket.id);

  if (!selectedGameMeta || !selectedGameId) {
    socket.emit("playback_update", {
      hasPlayback: false,
      message: "No game selected yet.",
    });
    return;
  }

  const currentOffsetMs = getCurrentPlaybackOffsetMs(state);
  const playbackIndex = getVisiblePlayCountFromOffset(selectedGamePlays, currentOffsetMs);

  const currentPlay =
    playbackIndex > 0 ? selectedGamePlays[playbackIndex - 1] : null;
  const nextPlay =
    playbackIndex < selectedGamePlays.length ? selectedGamePlays[playbackIndex] : null;

  const payload = buildPlaybackState(
    selectedGameMeta,
    selectedGameStats,
    selectedGamePlays,
    playbackIndex
  );

  socket.emit("playback_update", {
    ...payload,
    isPlaying: state.isPlaying,
    playbackOffsetMs: currentOffsetMs,
    currentPlay,
    nextPlay,
  });
}

function emitPlaybackStateToAll() {
  for (const socket of io.sockets.sockets.values()) emitPlaybackState(socket);
}

async function pollGamesList() {
  try {
    const games = await fetchGames(currentDate);

    if (!selectedGameId && games.length > 0) {
      selectedGameId = games[0].id;
      selectedGameMeta = games[0];
    }

    if (selectedGameId) {
      const selected = games.find((g) => g.id === selectedGameId);
      if (selected) selectedGameMeta = selected;
    }

    const payload = {
      date: currentDate,
      selectedGameId,
      games,
    };

    const nextJson = JSON.stringify(payload);

    if (nextJson !== lastGamesListJson) {
      lastGamesListJson = nextJson;
      io.emit("games_list_update", payload);
    }
  } catch (error) {
    console.error("Games list poll failed:", error.response?.data || error.message);
  }
}

async function loadSelectedGameData(gameId) {
  if (!gameId) return;
  selectedGameStats = await fetchGameStats(gameId);
  selectedGamePlays = buildTimedPlays(await fetchPlays(gameId));
  emitPlaybackStateToAll();
}

io.on("connection", (socket) => {
  getUserState(socket.id);

  if (lastGamesListJson) {
    socket.emit("games_list_update", JSON.parse(lastGamesListJson));
  }

  emitPlaybackState(socket);

  socket.on("select_game", async (gameId) => {
    stopUserPlayback(socket.id);

    selectedGameId = Number(gameId);
    const gamesPayload = lastGamesListJson ? JSON.parse(lastGamesListJson) : { games: [] };

    selectedGameMeta =
      gamesPayload.games.find((g) => g.id === selectedGameId) || null;

    const state = getUserState(socket.id);
    state.playbackBaseOffsetMs = 0;
    state.playbackStartedAtMs = null;
    state.isPlaying = false;

    await loadSelectedGameData(selectedGameId);
    await pollGamesList();
  });

  socket.on("set_games_date", async (dateStr) => {
    currentDate = dateStr;
    selectedGameId = null;
    selectedGameMeta = null;
    selectedGameStats = [];
    selectedGamePlays = [];

    for (const [socketId] of userStateMap) {
      stopUserPlayback(socketId);
      const state = getUserState(socketId);
      state.playbackBaseOffsetMs = 0;
      state.playbackStartedAtMs = null;
      state.isPlaying = false;
    }

    await pollGamesList();
    emitPlaybackStateToAll();
  });

  socket.on("start_from_beginning", () => {
    const state = getUserState(socket.id);
    state.playbackBaseOffsetMs = 0;
    state.playbackStartedAtMs = null;
    state.isPlaying = false;
    emitPlaybackState(socket);
  });

  socket.on("set_playing", (isPlaying) => {
    const state = getUserState(socket.id);

    if (isPlaying) {
      if (!state.isPlaying) {
        state.playbackStartedAtMs = Date.now();
        state.isPlaying = true;
      }
    } else if (state.isPlaying) {
      state.playbackBaseOffsetMs = getCurrentPlaybackOffsetMs(state);
      state.playbackStartedAtMs = null;
      state.isPlaying = false;
    }

    emitPlaybackState(socket);
  });

  socket.on("advance_playback", (step) => {
    const state = getUserState(socket.id);
    stopUserPlayback(socket.id);

    const currentOffsetMs = getCurrentPlaybackOffsetMs(state);
    const currentIndex = getVisiblePlayCountFromOffset(selectedGamePlays, currentOffsetMs);

    const nextIndex = Math.max(
      0,
      Math.min(currentIndex + toNumber(step), selectedGamePlays.length)
    );

    const targetPlay = selectedGamePlays[Math.max(0, nextIndex - 1)];

    state.playbackBaseOffsetMs = targetPlay?.offsetMs || 0;
    state.playbackStartedAtMs = null;
    state.isPlaying = false;

    emitPlaybackState(socket);
  });

  socket.on("set_playback_index", (index) => {
    const state = getUserState(socket.id);
    stopUserPlayback(socket.id);

    const safeIndex = Math.max(0, Math.min(toNumber(index), selectedGamePlays.length));
    const targetPlay = selectedGamePlays[Math.max(0, safeIndex - 1)];

    state.playbackBaseOffsetMs = targetPlay?.offsetMs || 0;
    state.playbackStartedAtMs = null;
    state.isPlaying = false;

    emitPlaybackState(socket);
  });

  socket.on("jump_to_period", (period) => {
    const state = getUserState(socket.id);
    stopUserPlayback(socket.id);

    const targetPeriod = Number(period);
    if (!Number.isFinite(targetPeriod) || targetPeriod < 1) {
      emitPlaybackState(socket);
      return;
    }

    const targetIndex = selectedGamePlays.findIndex(
      (play) => Number(play.period) === targetPeriod
    );

    if (targetIndex === -1) {
      emitPlaybackState(socket);
      return;
    }

    const targetPlay = selectedGamePlays[targetIndex];

    state.playbackBaseOffsetMs = targetPlay?.offsetMs || 0;
    state.playbackStartedAtMs = null;
    state.isPlaying = false;

    emitPlaybackState(socket);
  });

  socket.on("request_playback_state", () => {
    emitPlaybackState(socket);
  });

  socket.on("disconnect", () => {
    userStateMap.delete(socket.id);
  });
});

app.get("/", (_req, res) => {
  res.send("BALLDONTLIE backend is running.");
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  await pollGamesList();

  if (selectedGameId) {
    await loadSelectedGameData(selectedGameId);
  }

  setInterval(async () => {
    await pollGamesList();
    if (selectedGameId) {
      await loadSelectedGameData(selectedGameId);
    }
  }, POLL_MS);

  setInterval(() => {
    emitPlaybackStateToAll();
  }, PLAYBACK_TICK_MS);
});