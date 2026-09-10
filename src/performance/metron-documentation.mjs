import { readFile, writeFile } from "node:fs/promises";
import { SCORING_CONFIG } from "./scoring-config.mjs";

const START = "        <!-- METRON_CONTENT_START -->";
const END = "        <!-- METRON_CONTENT_END -->";

function numberFr(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

function percent(value) {
  return `${numberFr(value * 100)} %`;
}

function roleRow(label, key) {
  const weights = SCORING_CONFIG.OVERALL_BY_POSITION[key];
  return `            <tr><td data-label="Profil">${label}</td><td data-label="Création">${percent(weights.creation)}</td><td data-label="Finition">${percent(weights.finishing)}</td><td data-label="Défensif">${percent(weights.defensive)}</td><td data-label="Note moyenne">${percent(SCORING_CONFIG.OVERALL_MATCH_GRADE_WEIGHT)}</td></tr>`;
}

export function renderMetronContent() {
  const configSnapshot = JSON.stringify({
    version: SCORING_CONFIG.VERSION,
    effectiveDate: SCORING_CONFIG.EFFECTIVE_DATE,
    rating: [SCORING_CONFIG.RATING_MIN, SCORING_CONFIG.RATING_MAX],
    matches: SCORING_CONFIG.MATCH_WEIGHTS,
    roles: SCORING_CONFIG.OVERALL_BY_POSITION,
    grade: SCORING_CONFIG.OVERALL_MATCH_GRADE_WEIGHT,
    manOfTheMatch: SCORING_CONFIG.MAN_OF_MATCH_COMPONENTS,
    manOfTheMatchBonusMax: SCORING_CONFIG.MAN_OF_MATCH_BONUS_MAX,
    tenure: [SCORING_CONFIG.TENURE_BONUS_PER_ADDITIONAL_SEASON, SCORING_CONFIG.TENURE_BONUS_MAX],
    awards: SCORING_CONFIG.AWARD_BONUSES,
    samples: [SCORING_CONFIG.MIN_OVERALL_MATCHES, SCORING_CONFIG.CURRENT_CONFIDENCE_MATCHES],
    currentMinimumMatches: SCORING_CONFIG.CURRENT_MIN_OVERALL_MATCHES,
    positionPolicy: "latest-sporteasy-position-no-hybrid",
  });
  return `${START}
        <!-- Configuration Metron synchronisée automatiquement : ${configSnapshot} -->
        <div class="lykos-heading">
          <div><h1>Metron</h1><div class="lykos-subtitle">Le système de notation individuelle du Performance Hub Lykos FC · ${SCORING_CONFIG.VERSION}, en vigueur depuis le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(SCORING_CONFIG.EFFECTIVE_DATE))}.</div></div>
        </div>
        <p class="lykos-metron-intro">Metron transforme les données réelles issues de SportEasy en notes comparatives de ${SCORING_CONFIG.RATING_MIN} à ${SCORING_CONFIG.RATING_MAX}. Son objectif n’est pas de résumer un joueur à un chiffre, mais de replacer ses performances dans le contexte de son poste, de la période, du niveau des matchs et du reste de l’effectif.</p>

        <article class="lykos-metron-section">
          <h2>1. Ce que Metron utilise</h2>
          <p>La source de vérité reste SportEasy : matchs joués, buts, passes décisives, Hommes du match, notes et résultats collectifs. Les statistiques visibles restent toujours les valeurs réelles. La pondération n’est utilisée qu’à l’intérieur du calcul des notes.</p>
          <p>Metron recalcule séparément la saison actuelle, la saison précédente et l’historique All-time. Une statistique d’une période n’est jamais comparée à la population d’une autre période.</p>
          <div class="lykos-metron-callout">Une donnée absente n’est jamais transformée en zéro. Elle est retirée du calcul et les poids encore disponibles sont rééquilibrés. Exception contrôlée : un but ou une passe décisive omis sur une fiche de match vaut zéro uniquement lorsque la participation du joueur est confirmée et que les totaux restent conciliés avec SportEasy. Une note d’axe exige ${percent(SCORING_CONFIG.MIN_BLOCK_WEIGHT_COVERAGE)} de couverture ; la note générale en exige ${percent(SCORING_CONFIG.MIN_OVERALL_WEIGHT_COVERAGE)}. Sinon, la note affichée est « — ».</div>
        </article>

        <article class="lykos-metron-section">
          <h2>2. Importance des matchs</h2>
          <p>Les performances restent toutes valorisées, y compris en match amical. Les rencontres plus exigeantes reçoivent seulement un poids supérieur dans les calculs internes :</p>
          <div class="lykos-metron-table-wrap"><table class="lykos-metron-table"><thead><tr><th>Type de match</th><th>Coefficient</th><th>Principe</th></tr></thead><tbody>
            <tr><td data-label="Type de match">Test-Match / amical</td><td data-label="Coefficient">× ${numberFr(SCORING_CONFIG.MATCH_WEIGHTS.TEST_MATCH)}</td><td data-label="Principe">Valeur complète de référence</td></tr>
            <tr><td data-label="Type de match">Championnat ou tournoi</td><td data-label="Coefficient">× ${numberFr(SCORING_CONFIG.MATCH_WEIGHTS.COMPETITION)}</td><td data-label="Principe">Bonus mesuré de difficulté</td></tr>
            <tr><td data-label="Type de match">ProTour / Championnat de France</td><td data-label="Coefficient">× ${numberFr(SCORING_CONFIG.MATCH_WEIGHTS.PROTOUR)}</td><td data-label="Principe">Niveau de compétition le plus valorisé</td></tr>
          </tbody></table></div>
        </article>

        <article class="lykos-metron-section">
          <h2>3. Les quatre indicateurs</h2>
          <h3>Création</h3><p>Mesure la capacité à faire marquer : passes décisives, rendement par match, fréquence, séries, forme récente et part dans les passes recensées du Lykos.</p>
          <h3>Finition</h3><p>Mesure la capacité à marquer : buts, rendement par match, fréquence, records, séries, forme récente et part dans les buts de l’équipe.</p>
          <h3>Offensif</h3><p>Réunit les buts et les passes décisives pour mesurer les actions décisives. Cet indicateur reste affiché, mais n’est pas ajouté à la note générale afin de ne pas compter deux fois les mêmes buts et passes.</p>
          <h3>Défensif</h3><p>Observe les résultats défensifs collectifs du Lykos lorsque le joueur participe : buts encaissés par match, écart avec/sans lui et fréquence des matchs mieux défendus. Il s’agit d’une corrélation collective, jamais d’un nombre de buts personnellement évités.</p>
        </article>

        <article class="lykos-metron-section">
          <h2>4. Percentiles et notes /${SCORING_CONFIG.RATING_MAX}</h2>
          <p>Chaque sous-statistique est comparée aux autres joueurs disposant de cette donnée sur la même période. Le percentile indique la place relative : « Percentile 80/100 » signifie que le joueur se situe au niveau ou au-dessus d’environ 80 % de la population comparable.</p>
          <p>Pour les données où une valeur faible est préférable, comme les buts encaissés par match, le classement est inversé. Les percentiles alimentent ensuite les notes d’axe entre ${SCORING_CONFIG.RATING_MIN} et ${SCORING_CONFIG.RATING_MAX}. Une note proche de ${SCORING_CONFIG.RATING_MEDIAN} représente le centre de la population ; 90 ou davantage doit rester rare.</p>
        </article>

        <article class="lykos-metron-section">
          <h2>5. Construction de la note générale</h2>
          <p>Les attentes sont adaptées au dernier poste renseigné dans SportEasy tout en restant compatibles avec le football à 5, où chaque joueur doit contribuer dans plusieurs dimensions du jeu.</p>
          <div class="lykos-metron-table-wrap"><table class="lykos-metron-table"><thead><tr><th>Profil</th><th>Création</th><th>Finition</th><th>Défensif</th><th>Note moyenne</th></tr></thead><tbody>
${roleRow("Gardien pur", "G")}
${roleRow("Défenseur", "D")}
${roleRow("Milieu polyvalent", "M")}
${roleRow("Attaquant", "A")}
          </tbody></table></div>
          <p>Metron retient uniquement le dernier poste renseigné dans SportEasy. Il ne construit jamais de profil hybride « gardien-joueur ». Lorsque plusieurs postes figurent dans le champ SportEasy, seul le dernier est utilisé. Un poste absent est automatiquement traité comme « milieu polyvalent ».</p>
          <p>La note moyenne SportEasy est elle-même comparée aux autres joueurs de la période avant d’entrer pour ${percent(SCORING_CONFIG.OVERALL_MATCH_GRADE_WEIGHT)} dans Metron.</p>
        </article>

        <article class="lykos-metron-section">
          <h2>6. Reconnaissance, ancienneté et fiabilité</h2>
          <h3>Hommes du match</h3><p>Metron combine leur fréquence par match (${percent(SCORING_CONFIG.MAN_OF_MATCH_COMPONENTS.perMatch)}) et leur total (${percent(SCORING_CONFIG.MAN_OF_MATCH_COMPONENTS.total)}). Seuls les profils situés au-dessus de la médiane obtiennent un bonus permettant de distinguer les joueurs qui sortent régulièrement du lot. Ce bonus est limité à +${numberFr(SCORING_CONFIG.MAN_OF_MATCH_BONUS_MAX)}.</p>
          <h3>Ancienneté</h3><p>Chaque saison SportEasy connue après la première apporte +${numberFr(SCORING_CONFIG.TENURE_BONUS_PER_ADDITIONAL_SEASON)} point, avec un maximum de +${numberFr(SCORING_CONFIG.TENURE_BONUS_MAX)}. Le bonus reste volontairement léger : il reconnaît la continuité au club sans remplacer la performance.</p>
          <h3>Palmarès individuel</h3><p>Les distinctions officielles déjà recensées restent prises en compte : meilleur buteur +${SCORING_CONFIG.AWARD_BONUSES.top_scorer}, meilleur passeur +${SCORING_CONFIG.AWARD_BONUSES.top_assist_provider} et joueur de l’année +${SCORING_CONFIG.AWARD_BONUSES.player_of_year}.</p>
          <h3>Taille de l’échantillon</h3><p>Sur la saison actuelle, Metron calcule les notes dès ${SCORING_CONFIG.CURRENT_MIN_OVERALL_MATCHES} match joué, sous réserve de données suffisantes. Sans apparition, aucune note n’est attribuée. La saison précédente et l’historique All-time demandent au moins ${SCORING_CONFIG.MIN_OVERALL_MATCHES} matchs pour la note générale. Jusqu’à ${SCORING_CONFIG.CURRENT_CONFIDENCE_MATCHES} matchs, les notes d’axe des joueurs actuels sont rapprochées progressivement de ${SCORING_CONFIG.RATING_MEDIAN} : les premières notes restent provisoires et évoluent avec les matchs. Les anciens joueurs ayant moins de ${SCORING_CONFIG.FORMER_MIN_CAREER_MATCHES} matchs en carrière ne sont pas notés et ne participent pas aux comparaisons.</p>
        </article>

        <article class="lykos-metron-section">
          <h2>7. Ce que Metron ne prétend pas mesurer</h2>
          <p>Metron n’invente aucune donnée absente. Il ne produit pas de xG, tirs, possession, tacles, interceptions, duels, kilomètres parcourus ou heatmaps. Il décrit les performances recensées et les résultats collectifs observés, sans transformer une corrélation en causalité.</p>
          <p>La note doit donc être lue comme un outil de comparaison et de discussion, complémentaire à l’observation des matchs et jamais comme un jugement définitif sur un joueur.</p>
        </article>
        <button class="lykos-metron-back" data-view="players" aria-selected="false">Retour aux statistiques joueurs</button>
${END}`;
}

export async function syncMetronDocumentation(files) {
  const rendered = renderMetronContent();
  for (const file of files) {
    const html = await readFile(file, "utf8");
    const start = html.indexOf(START);
    const end = html.indexOf(END);
    if (start < 0 || end < start) throw new Error(`Bornes de documentation Metron absentes : ${file}`);
    const next = `${html.slice(0, start)}${rendered}${html.slice(end + END.length)}`;
    if (next !== html) await writeFile(file, next, "utf8");
  }
}
