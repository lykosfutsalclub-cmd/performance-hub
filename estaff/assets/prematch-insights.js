(() => {
  "use strict";

  const normalize = value => String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const number = value => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;

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
    const opponent = normalize(upcoming?.opponent);
    return {
      lastMatch:played[0] || null,
      lastAgainst:opponent ? played.find(match => normalize(match.opponent) === opponent) || null : null,
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
    const opponent = normalize(upcoming?.opponent);
    const matches = fixtures(teamStats)
      .filter(match => opponent && normalize(match.opponent) === opponent && new Date(`${match.date}T23:59:59`) <= now)
      .slice(0,3);
    if (!matches.length) return {value:null,matches:[]};
    const values = matches.map(match => {
      const direct = number(match.teamForm);
      if (direct !== null) return direct;
      const score = scoreParts(match.score);
      return !score ? 50 : score.for > score.against ? 99 : score.for < score.against ? 1 : 50;
    });
    return {value:Math.round((values.reduce((sum,value) => sum + value,0)/values.length)*10)/10,matches};
  }

  function forecast(context, teamStats = window.LYKOS_TEAM_STATS, secondaryStats = window.LYKOS_SECONDARY_STATS, directory = playerDirectory(), now = new Date()) {
    const squad = rosterMetron(context?.roster,secondaryStats,directory);
    const form = number(teamStats?.periods?.current?.form?.value);
    const headToHead = h2hScore(context?.match,teamStats,now);
    if (!squad.players.length || squad.average === null || form === null) {
      return {available:false,squad,form,headToHead,reason:"Le groupe ou ses données Metron ne sont pas encore assez complets."};
    }
    const value = headToHead.value === null
      ? squad.average*.625 + form*.375
      : squad.average*.5 + form*.3 + headToHead.value*.2;
    const rounded = Math.max(1,Math.min(99,Math.round(value*10)/10));
    const label = rounded >= 70 ? "Contexte favorable" : rounded >= 55 ? "Léger avantage Lykos" : rounded >= 45 ? "Match équilibré" : "Match exigeant";
    const confirmed = context?.roster?.confirmation === "confirmed";
    const complete = squad.coverage.available === squad.coverage.total;
    return {
      available:true,value:rounded,label,squad,form,headToHead,
      confidence:confirmed && complete ? "élevée" : confirmed || complete ? "moyenne" : "limitée",
      provisional:!confirmed,
    };
  }

  window.LykosPrematchInsights = {normalize,fixtures,scoreParts,resultLabel,history,playerDirectory,rosterMetron,h2hScore,forecast};
})();
