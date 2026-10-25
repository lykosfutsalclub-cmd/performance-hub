(() => {
  "use strict";

  const normalize = value => String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const number = value => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const rounded = value => Math.round(value*10)/10;

  function opponentIdentity(value) {
    const name = normalize(value);
    if (/^ase(?: foot)?(?: cinq| 5| 1)?$/.test(name)) return "ase";
    if (/^saba(?: foot 5| futsal)?$/.test(name)) return "saba";
    return name;
  }

  function fixtures(teamStats = window.LYKOS_TEAM_STATS) {
    return (teamStats?.seasons || []).flatMap(season => (season.series || []).map(match => ({...match,season:season.label})))
      .filter(match => match.date)
      .sort((a,b) => new Date(b.date) - new Date(a.date));
  }

  function scoreParts(score) {
    const parts = String(score || "").match(/(\d+)\D+(\d+)/);
    return parts ? {for:Number(parts[1]),against:Number(parts[2])} : null;
  }

  function resultLabel(match) {
    const score = scoreParts(match?.score);
    if (!score) return "Résultat non renseigné";
    if (score.for > score.against) return "Victoire";
    if (score.for < score.against) return "Défaite";
    return "Match nul";
  }

  function history(upcoming, teamStats = window.LYKOS_TEAM_STATS, now = new Date()) {
    const played = fixtures(teamStats).filter(match => new Date(`${match.date}T23:59:59`) <= now);
    const opponent = opponentIdentity(upcoming?.opponent);
    const againstMatches = opponent ? played.filter(match => opponentIdentity(match.opponent) === opponent).slice(0,5) : [];
    return {
      lastMatch:played[0] || null,
      lastAgainst:againstMatches[0] || null,
      againstMatches,
    };
  }

  function playerDirectory(doc = document) {
    return [...doc.querySelectorAll("[data-player-id][data-player]")].map(node => ({
      id:node.dataset.playerId,
      name:node.dataset.player,
      normalized:normalize(node.dataset.player),
    }));
  }

  function findPlayer(person, directory) {
    if (person?.id) {
      const direct = directory.find(player => String(player.id) === String(person.id));
      if (direct) return direct;
    }
    const query = normalize(person?.name);
    if (!query) return null;
    return directory.find(player => player.normalized === query)
      || directory.find(player => player.normalized.includes(query) || query.includes(player.normalized))
      || null;
  }

  function rosterMetron(roster, secondaryStats = window.LYKOS_SECONDARY_STATS, directory = playerDirectory()) {
    const ratings = secondaryStats?.periods?.current?.players || {};
    const players = (roster?.players || []).map(person => {
      const matched = findPlayer(person,directory);
      const overall = matched ? number(ratings[matched.id]?.performance?.overall) : null;
      return {id:matched?.id || person.id || "",name:matched?.name || person.name || "Joueur non identifié",metron:overall};
    });
    const available = players.filter(player => player.metron !== null);
    return {
      players,
      average:available.length ? Math.round((available.reduce((sum,player) => sum + player.metron,0)/available.length)*10)/10 : null,
      coverage:{available:available.length,total:players.length},
    };
  }

  function h2hScore(upcoming, teamStats = window.LYKOS_TEAM_STATS, now = new Date()) {
    const opponent = opponentIdentity(upcoming?.opponent);
    const matches = fixtures(teamStats)
      .filter(match => opponent && opponentIdentity(match.opponent) === opponent && new Date(`${match.date}T23:59:59`) <= now)
      .slice(0,5);
    if (!matches.length) return {value:null,matches:[]};
    const values = matches.map(match => {
      const direct = number(match.teamForm);
      if (direct !== null) return direct;
      const score = scoreParts(match.score);
      return !score ? 50 : score.for > score.against ? 99 : score.for < score.against ? 1 : 50;
    });
    return {value:rounded(values.reduce((sum,value) => sum + value,0)/values.length),matches};
  }

  function pantheonMatches(pantheonStats = window.LYKOS_PANTHEON_STATS, now = new Date()) {
    return (pantheonStats?.recordScopes?.match || [])
      .filter(match => match.date && new Date(`${match.date}T23:59:59`) <= now)
      .sort((a,b) => new Date(b.date) - new Date(a.date));
  }

  function weightedScore(components) {
    const available = components.filter(component => component.value !== null && Number.isFinite(component.value));
    const weight = available.reduce((sum,component) => sum + component.weight,0);
    return weight ? rounded(available.reduce((sum,component) => sum + component.value*component.weight,0)/weight) : null;
  }

  function summarizePlayerWindow(playerId, matches) {
    const appearances = matches.map(match => ({match,stats:match.players?.[playerId]})).filter(item => item.stats);
    const total = key => appearances.reduce((sum,item) => sum + (number(item.stats[key]) ?? 0),0);
    const ratingRows = appearances.filter(item => number(item.stats.averageRating) !== null && (number(item.stats.ratedMatches) ?? 1) > 0);
    const ratedMatches = ratingRows.reduce((sum,item) => sum + (number(item.stats.ratedMatches) ?? 1),0);
    const averageRating = ratedMatches ? rounded(ratingRows.reduce((sum,item) => sum + number(item.stats.averageRating)*(number(item.stats.ratedMatches) ?? 1),0)/ratedMatches) : null;
    const goals = total("goals");
    const assists = total("assists");
    const contributionsPerMatch = appearances.length ? rounded((goals+assists)/appearances.length) : null;
    const appearanceRate = matches.length ? rounded(appearances.length/matches.length*100) : null;
    const score = weightedScore([
      {value:averageRating === null ? null : Math.min(99,averageRating*9.9),weight:50},
      {value:appearanceRate === null ? null : appearanceRate*.99,weight:20},
      {value:contributionsPerMatch === null ? null : Math.min(99,contributionsPerMatch/3*99),weight:30},
    ]);
    return {matches:appearances.length,windowMatches:matches.length,appearanceRate,goals,assists,contributionsPerMatch,averageRating,ratedMatches,manOfMatch:total("manOfMatch"),score};
  }

  function playerEvidence(roster, opponent, pantheonStats = window.LYKOS_PANTHEON_STATS, now = new Date()) {
    const matches = pantheonMatches(pantheonStats,now);
    const recentMatches = matches.slice(0,5);
    const identity = opponentIdentity(opponent);
    const opponentMatches = matches.filter(match => identity && opponentIdentity(match.opponentName) === identity).slice(0,5);
    const players = (roster?.players || []).map(player => ({
      ...player,
      recent:summarizePlayerWindow(player.id,recentMatches),
      opponent:summarizePlayerWindow(player.id,opponentMatches),
    }));
    const average = key => {
      const values = players.map(player => player[key].score).filter(value => value !== null);
      return values.length ? rounded(values.reduce((sum,value) => sum+value,0)/values.length) : null;
    };
    return {players,recentMatches,opponentMatches,recentAverage:average("recent"),opponentAverage:average("opponent")};
  }

  function forecast(context, teamStats = window.LYKOS_TEAM_STATS, secondaryStats = window.LYKOS_SECONDARY_STATS, directory = playerDirectory(), pantheonStats = window.LYKOS_PANTHEON_STATS, now = new Date()) {
    const squad = rosterMetron(context?.roster,secondaryStats,directory);
    const form = number(teamStats?.periods?.current?.form?.value);
    const headToHead = h2hScore(context?.match,teamStats,now);
    const evidence = playerEvidence(squad,context?.match?.opponent,pantheonStats,now);
    squad.players = evidence.players;
    if (!squad.players.length || squad.average === null || form === null) {
      return {available:false,squad,form,headToHead,evidence,reason:"Le groupe ou ses données Metron ne sont pas encore assez complets."};
    }
    const value = weightedScore([
      {value:squad.average,weight:30},
      {value:form,weight:20},
      {value:headToHead.value,weight:20},
      {value:evidence.recentAverage,weight:20},
      {value:evidence.opponentAverage,weight:10},
    ]);
    const result = Math.max(1,Math.min(99,value));
    const label = result >= 70 ? "Contexte favorable" : result >= 55 ? "Léger avantage Lykos" : result >= 45 ? "Match équilibré" : "Match exigeant";
    const confirmed = ["confirmed","manual"].includes(context?.roster?.confirmation);
    const complete = squad.coverage.available === squad.coverage.total;
    return {
      available:true,value:result,label,squad,form,headToHead,evidence,
      confidence:confirmed && complete ? "élevée" : confirmed || complete ? "moyenne" : "limitée",
      provisional:!confirmed,
    };
  }

  window.LykosPrematchInsights = {normalize,opponentIdentity,fixtures,scoreParts,resultLabel,history,playerDirectory,rosterMetron,h2hScore,pantheonMatches,summarizePlayerWindow,playerEvidence,forecast};
})();
