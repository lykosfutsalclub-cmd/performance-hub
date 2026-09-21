(() => {
  const API = "https://lykos-estaff-service.lykosfutsalclub.workers.dev/api/estaff";
  const originalFetch = window.fetch.bind(window);
  let sessionToken = "";
  let sessionGeneration = 0;
  let latestReport = null;
  let latestReturns = [];
  let latestStateUpdatedAt = "";
  let latestCapabilities = {};
  let latestAgentStates = [];
  let latestOperations = {};
  let latestBusinessSources = {};
  let scheduled = false;
  let selectedService = "";
  let selectedAgent = "";
  let agentFeedOpen = false;
  let syncBusy = false;
  let syncTime = null;
  const SPORTEASY_SYNC_PROMPT = "ACTION_SYSTÈME PUB2 : déclenche immédiatement le workflow officiel de synchronisation SportEasy complète vers le Performance Hub, puis confirme uniquement son lancement.";
  const manuallyCollapsedAgentFeeds = new Set();
  const COLLAPSE_THRESHOLD = 420;
  const femaleAgents = new Set(["Sophie", "Véronique", "Patricia", "Alice", "Sandrine", "Sonia", "Amara", "Elena", "Joyce", "Élise", "Camélia", "Tamara", "Inès", "Angela", "Alba", "Lola", "Nora", "Salomé", "Ella", "Salma", "Priya"]);
  const serviceLabels = {coordination:"eGeneral Director", operations:"eOpérations", sport:"eSportif", data:"eDatas", academy:"eAcademie", support:"eSupport", brand:"eBrand", security:"eSécurité", finance:"eFinance", equipment:"eÉquipements", partnerships:"ePartenariats", memory:"eMémoire", hr:"eRH"};
  const serviceDescriptions = {
    hr:"eRH agit sous l’autorité d’Oscar, eGeneral Director. Le service cadre le travail des agents IA, mesure leur temps d’exécution, organise leur timing, évalue les besoins et propose les adaptations qui maintiennent le eStaff efficace.",
  };
  const serviceFrameworks = {
    hr:[
      ["Cadre de travail", "Mission, sources, permissions, charge, contrôle qualité et preuve attendue pour chaque agent."],
      ["Temps de travail", "Durée cible, attente légitime, délai maximal, relances et coût mesurés sans assimiler une attente de source à de l’inactivité."],
      ["Timing", "Ordre des dépendances, créneau utile, cadence et priorité ajustés pour éviter doublons et exécutions trop tôt."],
      ["Besoins", "Surcharge, sous-utilisation, compétence manquante et mission non couverte sont distinguées avant toute proposition."],
      ["Optimisation", "Mission complémentaire, redistribution ou adaptation d’outil sont proposées à Oscar ; aucune modification durable n’est appliquée sans sa validation."],
    ],
  };
  const agentDisplayNames = {oscar:"Oscar",sophie:"Sophie",nadir:"Nadir",alice:"Alice",victor:"Victor",giannis:"Giannis",sonia:"Sonia",patricia:"Patricia",gaston:"Gaston",veronique:"Véronique",sandrine:"Sandrine",leonard:"Léonard",konstantinos:"Konstantinos",kostantinos:"Konstantinos",amara:"Amara",elena:"Elena",akira:"Akira",joyce:"Joyce",thiago:"Thiago",jefferson:"Jefferson",vincenzo:"Vincenzo",angela:"Angela",juan:"Juan",marco:"Marco",rafael:"Rafael",alba:"Alba",lola:"Lola",nora:"Nora",yanis:"Yanis",salome:"Salomé",malik:"Malik",ella:"Ella",bastien:"Bastien",salma:"Salma",mateo:"Mateo",priya:"Priya","sophie-rapprochement-sources":"Élise","nadir-indexation-video":"Samir","alice-controle-confidentialite":"Roman","victor-assiduite":"Camélia","giannis-qualite-donnees":"Francisco","veronique-tests-regression":"Tamara","sandrine-explicabilite-ux":"Inès","kostantinos-observation-publique":"Giorgios"};
  const agentIdsByName = Object.fromEntries(Object.entries(agentDisplayNames).map(([id,name]) => [name,id]));

  const esupportRoles = {
    Sophie: {
      title:"Gestion administrative",
      summary:"Suivre les opérations et les dossiers du club.",
      purpose:"Sophie prépare les dossiers administratifs du club à partir des seules sources autorisées et signale les informations manquantes ou contradictoires.",
      when:"À chaque échéance administrative, dossier incomplet ou demande confiée à Oscar.",
      output:"Un état administratif daté, les écarts constatés et les prochaines actions à faire valider.",
    },
    Nadir: {
      title:"Analyse tactique vidéo",
      summary:"Relier les images au style de jeu demandé par les coachs.",
      purpose:"Nadir observe les situations visibles, les confronte aux principes demandés par les coachs et en tire des points forts, des axes d’amélioration et des priorités concrètes pour l’entraînement et le prochain match. Il ne produit plus de statistiques vidéo.",
      when:"Après chaque vidéo de match suffisamment exploitable pour une lecture tactique.",
      output:"Une analyse critique horodatée : 3 ou 4 points forts, 3 ou 4 axes d’amélioration et les prochains focus terrain.",
    },
    Oscar: {
      title:"eGeneral Director",
      summary:"Diriger les services, arbitrer leurs priorités et valider les adaptations proposées par eRH.",
      purpose:"Oscar dirige les quarante-deux autres agents. Il répartit les missions entre les services, arbitre les priorités et valide le cadre de travail proposé par eRH avant de remettre une synthèse fiable aux dirigeants.",
      when:"Pour missionner le eStaff, arbitrer une charge, valider une adaptation eRH ou conclure un contrôle transversal.",
      output:"Une décision ou une synthèse consolidée avec priorités, responsables, échéances, blocages et limites.",
    },
    Sonia: {
      title:"Gestion des identifiants",
      summary:"Relier les identifiants SportEasy à la session sans intervenir sur l’API.",
      purpose:"Sonia gère exclusivement le lien sécurisé entre les identifiants chiffrés et la session SportEasy. Elle confirme si la session est utilisable, mais ne contrôle jamais l’API, ses routes, ses données ou la synchronisation.",
      when:"Avant chaque synchronisation SportEasy et lorsqu’une session déconnectée ou un identifiant refusé est détecté.",
      output:"Un état des identifiants et de la session transmis à Patricia, puis une preuve à Véronique, sans aucun secret affiché.",
    },
    Patricia: {
      title:"Surveillance des données",
      summary:"Contrôler les routes SportEasy et détecter les données manquantes.",
      purpose:"Après confirmation de la session par Sonia, Patricia contrôle l’API, les routes SportEasy, la fraîcheur des données publiques et la présence du dernier match réellement finalisé.",
      when:"Chaque nuit, après une mise en ligne et lors des rapports du lundi et du jeudi.",
      output:"Un relevé précis des contrôles réussis et des anomalies transmis à Gaston.",
    },
    Gaston: {
      title:"Diagnostic et correction technique",
      summary:"Diagnostiquer les anomalies et préparer leur correction technique.",
      purpose:"Gaston reçoit les anomalies détectées par Patricia, en recherche la cause et prépare une correction sans modifier Metron ni écrire dans SportEasy.",
      when:"Dès qu’un contrôle de Patricia échoue ou qu’une route SportEasy change.",
      output:"Un diagnostic reproductible, une correction vérifiée ou la confirmation qu’aucun correctif n’est nécessaire.",
    },
    Véronique: {
      title:"Responsable eSupport",
      summary:"Valider les connexions, contrôler la qualité et répartir les missions.",
      purpose:"Véronique dirige eSupport. Elle valide l’état des connexions et les preuves produites, contrôle les corrections de Gaston et répartit la charge entre les agents avant de prononcer un GO ou un NO-GO.",
      when:"Après chaque diagnostic ou mise en ligne et pendant chaque cycle eSupport.",
      output:"Un verdict qualité explicite et la confirmation de la version publique lorsqu’elle est conforme.",
    },
    Giannis: {
      title:"Analyse des données et de Metron",
      summary:"Interpréter les données du Hub et transmettre ses rapports à Sandrine.",
      purpose:"Giannis transforme les données disponibles en rapports sportifs contextualisés. Il ne cherche pas prioritairement à établir des Top 3 ou 5 : il explique ce que montrent les données, leurs limites et la version de Metron utilisée.",
      when:"Après une synchronisation, dès qu’une période comporte au moins deux matchs.",
      output:"Un rapport séparant faits, calculs, interprétation et limites, puis transmis automatiquement à Sandrine.",
    },
    Alice: {
      title:"Suivi Académie",
      summary:"Préparer le suivi opérationnel de l’Académie.",
      purpose:"Alice organise les informations nécessaires au suivi de l’Académie sans exposer inutilement les données des joueurs ou des familles.",
      when:"À chaque échéance, événement ou dossier Académie confié à Oscar.",
      output:"Un suivi opérationnel daté, limité aux informations nécessaires et aux décisions attendues.",
    },
    Victor: {
      title:"Gestion de l’effectif",
      summary:"Établir une photographie factuelle de l’effectif et des postes.",
      purpose:"Victor analyse l’effectif, les postes et les informations de disponibilité autorisées. Il prépare des constats mais ne choisit jamais la composition.",
      when:"Quand Oscar demande un état de l’effectif ou avant un dossier sportif nécessitant ces informations.",
      output:"Un état de l’effectif, des postes couverts, des inconnues et des limites de la période.",
    },
    Sandrine: {
      title:"Amélioration du Performance Hub",
      summary:"Remettre en question le Hub à partir des rapports de Giannis.",
      purpose:"Sandrine reçoit les rapports de Giannis, cherche ce que le Performance Hub explique mal ou ne mesure pas encore, puis prépare des idées d’amélioration utiles et réalisables.",
      when:"Après chaque nouveau rapport de Giannis et lors de ses audits ciblés du Hub.",
      output:"Des propositions priorisées qui apportent une compréhension sportive nouvelle, sans modifier elle-même Metron ni le site.",
    },
    Konstantinos: {
      title:"Marque, contenus et partenariats",
      summary:"Développer eBrand en restant fidèle à l’identité du Lykos FC.",
      purpose:"Konstantinos analyse l’image du club, la cohérence des contenus, les opportunités de partenariat et les idées de produits. Il transforme ses observations en recommandations concrètes pour Oscar et les dirigeants.",
      when:"Pour préparer une campagne, évaluer un contenu, cadrer un partenariat ou étudier un produit aux couleurs du club.",
      output:"Un Brand Opportunity Brief : constat, public visé, proposition, bénéfices, risques, effort estimé et prochaine décision attendue.",
    },
    Léonard: {
      title:"Conseiller sportif",
      summary:"Synthétiser uniquement les dossiers sportifs complets.",
      purpose:"Léonard transforme les retours concordants d’Oscar, Nadir, Victor et Giannis en conseils consultatifs. Fabien et Alex conservent toutes les décisions sportives.",
      when:"Uniquement lorsque les quatre sources obligatoires sont complètes, fraîches, validées et rattachées au même événement.",
      output:"Un Match Coaching Brief ou un Training Focus séparant faits, interprétations, contradictions et limites.",
    },
    Élise: {title:"Rapprochement des sources",summary:"Comparer les sources administratives utiles pour Sophie.",purpose:"Élise rapproche les informations autorisées de SportEasy, Gmail et Drive pour repérer contradictions, doublons et dossiers incomplets.",when:"Quand Sophie doit vérifier plusieurs sources sur un même dossier.",output:"Un tableau factuel des concordances, écarts et informations manquantes."},
    Samir: {title:"Indexation vidéo",summary:"Préparer les repères techniques et temporels pour Nadir.",purpose:"Samir prépare un index des vidéos autorisées sans interpréter la tactique ni produire de statistiques de jeu.",when:"Après le dépôt d’une vidéo autorisée.",output:"Un index des séquences examinables et des limites de l’image."},
    Roman: {title:"Confidentialité Académie",summary:"Contrôler la protection des informations pour Alice.",purpose:"Roman vérifie que les informations Académie sont nécessaires, protégées et destinées aux bonnes personnes.",when:"Avant tout partage contenant des données de l’Académie.",output:"Un constat de confidentialité avec les protections à appliquer."},
    Camélia: {title:"Assiduité factuelle",summary:"Préparer les séries de présence pour Victor.",purpose:"Camélia calcule à partir des statuts réellement saisis sans interpréter la motivation ou la disponibilité future.",when:"Quand Victor doit comparer les présences sur une période.",output:"Des calculs documentés avec dénominateurs, inconnues et limites."},
    Salma: {title:"Nouvelles arrivées",summary:"Suivre les arrivées jusqu’à leur intégration dans l’effectif.",purpose:"Salma contrôle les étapes, les pièces et les responsabilités de chaque nouvelle arrivée sans contacter personne.",when:"Chaque jour après Patricia et dès qu’une arrivée change.",output:"Un dossier d’arrivée traçable avec état, manque et prochaine action."},
    Mateo: {title:"Départs récents",summary:"Documenter et clôturer les départs récents.",purpose:"Mateo vérifie que les actions liées à un départ sont terminées tout en conservant l’historique utile.",when:"Chaque lundi et jeudi et dès qu’un départ change.",output:"Une fiche de départ clôturée ou la liste des éléments attendus."},
    Priya: {title:"Prospects & recrutement",summary:"Organiser les prospects selon les besoins validés.",purpose:"Priya suit les phases de recrutement et relie chaque prospect à un besoin d’effectif transmis par Victor.",when:"Chaque lundi, mercredi et vendredi et dès qu’un prospect change d’étape.",output:"Un pipeline lisible avec étape, besoin, prochaine action et décision attendue."},
    Francisco: {title:"Contrôle des données",summary:"Vérifier la qualité des données pour Giannis.",purpose:"Francisco contrôle les sources, périodes, doublons, unités, valeurs manquantes et la version Metron.",when:"Avant chaque interprétation de Giannis.",output:"Un contrôle de qualité et de reproductibilité des calculs."},
    Tamara: {title:"Tests de régression",summary:"Exécuter les contrôles techniques pour Véronique.",purpose:"Tamara vérifie qu’une correction ne réintroduit pas une ancienne panne et consigne les tests non exécutés.",when:"Après chaque correction et avant une validation technique.",output:"Des résultats reproductibles avec versions, scénarios et preuves."},
    Inès: {title:"Compréhension Data/UX",summary:"Vérifier la clarté des données pour Sandrine.",purpose:"Inès contrôle que les statistiques et interfaces sont compréhensibles, fidèles et utilisables sur ordinateur comme sur mobile.",when:"Lorsqu’une donnée ou une interface doit être rendue plus claire.",output:"Un audit de compréhension avec difficultés et corrections proposées."},
    Giorgios: {title:"Observation des canaux publics",summary:"Observer les canaux officiels pour Kostantinos.",purpose:"Giorgios relève les changements et mesures publiques agrégées sans connexion, publication ni collecte d’identités.",when:"Pendant la veille des contenus, partenaires et produits publics.",output:"Un relevé sourcé avec URL, date, valeur observée et niveau de preuve."},
    Vincenzo: {title:"Veille et récupération vidéo",summary:"Détecter les vidéos correspondant aux matchs SportEasy validés.",purpose:"Vincenzo recherche dans la vidéothèque du Complexe par date et terrain, compare le score, puis attend la validation de Samir et le rattachement d’Oscar avant tout téléchargement.",when:"Le jeudi à 7 h 30, le vendredi à 7 h 30 et le dimanche à 7 h 30, jusqu’à la découverte d’un candidat.",output:"Un candidat traçable ou la confirmation qu’aucun match n’est candidat à une analyse de nos agents."},
    Amara: {
      title:"Responsable eSécurité",
      summary:"Diriger les contrôles et consolider les décisions de sécurité.",
      purpose:"Amara attribue les contrôles aux cinq spécialistes, classe les risques, garantit l’indépendance des validations et transmet un verdict consolidé à Oscar.",
      when:"À chaque alerte concernant un accès, un secret, une donnée, une intégration ou un incident.",
      output:"Un bulletin de sécurité avec faits, gravité, mesure conservatoire, décision attendue et condition de reprise.",
    },
    Elena: {
      title:"Contrôle des accès",
      summary:"Vérifier les identités, les droits et les protections de connexion.",
      purpose:"Elena contrôle que chaque accès aux supports Lykos correspond à un besoin approuvé, sans modifier elle-même les comptes.",
      when:"Chaque semaine et après tout changement d’accès.",
      output:"Une matrice des comptes et droits, limitée aux écarts et décisions utiles.",
    },
    Akira: {
      title:"Protection des secrets",
      summary:"Détecter les secrets exposés sans jamais les afficher.",
      purpose:"Akira contrôle les mots de passe, clés API, jetons et cookies de session dans le code et les journaux, sans jamais recopier leur valeur.",
      when:"Chaque jour et après une modification du code ou un déploiement.",
      output:"Un constat expurgé précisant le risque, sa portée et l’action attendue.",
    },
    Joyce: {
      title:"Protection des données",
      summary:"Contrôler la nécessité, l’exposition et la conservation des données.",
      purpose:"Joyce protège les données personnelles des joueurs, dirigeants, parents et mineurs dans tout l’écosystème Lykos.",
      when:"Chaque semaine et à chaque nouveau flux, partage ou publication de données.",
      output:"Une fiche de confidentialité factuelle qui ne reproduit pas inutilement les données sensibles.",
    },
    Thiago: {
      title:"Sécurité des intégrations",
      summary:"Vérifier les liens, destinations et protections des intégrations.",
      purpose:"Thiago contrôle la sécurité des liens techniques entre le Performance Hub et les supports du club, sans intervenir sur le fonctionnement métier des API.",
      when:"Toutes les heures et après chaque changement d’intégration.",
      output:"Une carte des liens et protections, accompagnée des anomalies reproductibles.",
    },
    Jefferson: {
      title:"Réponse aux incidents",
      summary:"Surveiller les signaux, conserver les preuves et structurer la réponse.",
      purpose:"Jefferson surveille les signaux de sécurité et ouvre une chronologie factuelle dès qu’un incident est suspecté.",
      when:"En continu et à chaque signal significatif.",
      output:"Un dossier d’incident avec heures, preuves, mesures conservatoires et condition de clôture.",
    },
    Angela: {title:"Analyste trésorerie & fournisseurs",summary:"Rapprocher les pièces et signaler les écarts financiers.",purpose:"Angela rapproche factures, paiements, avoirs, budgets et échéances, puis repère les erreurs de quantité ou de prix sans exécuter aucune opération financière.",when:"À chaque nouvelle pièce, échéance, renouvellement ou écart anormal.",output:"Un rapprochement sourcé avec impact, alerte et décision humaine attendue."},
    Juan: {title:"Coordinateur logistique & équipements",summary:"Suivre les stocks, tailles, commandes et livraisons.",purpose:"Juan tient la vision opérationnelle des maillots et shorts, relie les tailles et quantités aux dossiers autorisés et suit chaque commande jusqu’à sa livraison.",when:"Lors d’un changement de stock, de taille, de licence, de commande ou de livraison.",output:"Un état de stock et de besoins, avec écarts et prochaines validations."},
    Marco: {title:"Chargé d’équipementier",summary:"Maîtriser l’offre et le contrat Macron du club.",purpose:"Marco documente la boutique Macron du Lykos, le contrat équipementier et le Catalogue Macron 2026 autorisé sur Drive afin d’éclairer les besoins validés par Juan.",when:"Quand un produit, un besoin, un prix, le contrat ou le catalogue évolue.",output:"Une fiche produit ou contractuelle sourcée, sans commande ni négociation."},
    Rafael: {title:"Responsable partenariats",summary:"Suivre les obligations et renouvellements sponsors.",purpose:"Rafael tient le registre des engagements, contreparties, échéances et renouvellements à partir des seules informations transmises et validées.",when:"Lorsqu’une information sponsor ou une échéance est ajoutée ou modifiée.",output:"Un tableau des engagements tenus, à faire, en retard ou à renégocier."},
    Alba: {title:"Archiviste & historienne du club",summary:"Consolider l’histoire vérifiée du Lykos depuis 2019.",purpose:"Alba relie les palmarès, équipes de l’année, anciens effectifs, compositions, records, photographies, documents et identités à leurs sources vérifiables.",when:"À chaque nouveau document ou fait historique contrôlé.",output:"Une notice datée avec source, niveau de preuve et contradictions éventuelles."},
    Lola: {title:"Productrice éditoriale",summary:"Transformer les données validées en récits prêts à relire.",purpose:"Lola transforme les analyses et archives déjà validées en résumés, cartes et bilans cohérents avec la voix du club.",when:"Après validation d’un bilan, record, anniversaire ou brief éditorial.",output:"Un brouillon sourcé qui ne peut pas être publié sans validation humaine."},
    Bastien: {title:"Coordinateur compétitions & adversaires",summary:"Fiabiliser calendriers, résultats, classements et analyse adverse.",purpose:"Bastien compare les calendriers et feuilles de résultats aux événements SportEasy, prépare les créations ou saisies à valider, contrôle ensuite le classement et documente le prochain adversaire sans inventer de donnée.",when:"Chaque jour après le contrôle SportEasy, et dès qu’un calendrier, une feuille de résultats, un événement, un score, un classement ou un adversaire change.",output:"Un dossier sourcé : écarts de calendrier, opérations préparées, résultats rapprochés, contrôle de classement, brief adverse, inconnues et validation attendue."},
    Nora: {title:"Responsable eRH",summary:"Cadrer le travail des agents IA et soumettre les adaptations à Oscar.",purpose:"Nora dirige eRH sous l’autorité d’Oscar. Elle vérifie que chaque agent dispose d’un mandat, de sources, de permissions, d’une charge, d’une durée cible, d’un contrôle qualité et d’une preuve attendue adaptés.",when:"Chaque jour avant le rapport d’Oscar et dès qu’un agent est en retard, surchargé, bloqué ou sans preuve utile.",output:"Un tableau de pilotage par agent avec cadre, charge, temps prévu, preuve, blocage et adaptation proposée à Oscar."},
    Yanis: {title:"Temps de travail & coûts",summary:"Mesurer durées, attentes, relances, consommations et budgets.",purpose:"Yanis mesure le temps de travail propre aux agents IA : durée d’exécution, attente d’une source, délai maximal, relances et coût. Il repère les missions trop longues, trop fréquentes ou inutilement répétées.",when:"Chaque semaine, après un dépassement de durée ou de coût et lors de toute nouvelle mission récurrente ou capacité payante.",output:"Un budget de temps et de coût par agent et par mission, avec seuils, écarts et proposition de réduction."},
    Salomé: {title:"Planification & processus",summary:"Organiser le bon timing, les dépendances et les cadences.",purpose:"Salomé organise l’ordre et le moment de travail des agents. Elle tient compte des sources attendues, des dépendances et des validations pour éviter chevauchements, doublons et exécutions trop tôt.",when:"Chaque semaine et lorsqu’une attente, un doublon, un blocage ou une reprise manuelle se répète.",output:"Un planning agentique indiquant ordre, créneau utile, durée cible, dépendances, validation et correction testable."},
    Malik: {title:"Besoins & missions complémentaires",summary:"Détecter les besoins et proposer une répartition utile aux agents existants.",purpose:"Malik détecte surcharge, sous-utilisation, manque de compétence ou mission orpheline. Il propose d’abord une redistribution ou une mission complémentaire cohérente avant d’envisager un nouvel agent.",when:"Le premier jour de chaque mois à 11 h 15 et lorsqu’un besoin non couvert, une surcharge ou une inactivité persiste malgré les corrections.",output:"Un plan de couverture : mission complémentaire, redistribution, meilleure consigne, nouvel outil ou profil à envisager en dernier recours."},
    Ella: {title:"Environnement & optimisation",summary:"Adapter outils, sources et cadre technique pour gagner en efficacité.",purpose:"Ella adapte l’environnement de travail aux besoins validés : outil, source, format, automatisation ou niveau de modèle. Elle recherche le meilleur rapport entre efficacité, qualité, coût, permissions et risque.",when:"Chaque semaine, après un besoin confirmé par eRH ou lorsqu’un cadre de travail empêche un agent d’être efficace.",output:"Une fiche d’optimisation avec adaptation proposée, gain attendu, coût, permissions, risques et essai mesurable."},
  };

  const operationalProfiles = {
    Oscar:{inputs:"Objectif, urgence, décision attendue, cadre eRH applicable et retours datés des agents mobilisés.",quality:"Vérifier les sources, les contradictions, les absences de réponse, les limites et les adaptations proposées par eRH avant toute décision.",evidence:"Synthèse signée par Oscar, eGeneral Director, avec responsables, échéances, blocages, arbitrages eRH et décision attendue."},
    Sophie:{inputs:"Demande administrative et sources autorisées utiles au dossier.",quality:"Élise rapproche les sources ; toute donnée absente reste signalée comme telle.",evidence:"État administratif daté et tableau des pièces concordantes, contradictoires ou manquantes."},
    Nadir:{inputs:"Vidéo autorisée et indexée, contexte du match et principes demandés par les coachs.",quality:"Samir contrôle l’index vidéo ; Nadir cite les séquences et les limites de l’image.",evidence:"Analyse tactique horodatée avec repères vidéo et limites explicites."},
    Alice:{inputs:"Calendrier, groupes et documents Académie strictement nécessaires et autorisés.",quality:"Roman contrôle la confidentialité, les destinataires et la minimisation des données.",evidence:"Suivi Académie daté avec contrôle de confidentialité associé."},
    Victor:{inputs:"Référentiel actuel, postes connus et informations de disponibilité autorisées pour la période.",quality:"Camélia documente les calculs factuels ; les inconnues et dénominateurs restent visibles.",evidence:"Photographie datée de l’effectif, de la couverture des postes et des données manquantes."},
    Giannis:{inputs:"Jeux de données publics lisibles, période, taille d’échantillon et version Metron.",quality:"Francisco contrôle sources, doublons, unités, valeurs absentes et reproductibilité.",evidence:"Rapport séparant faits, calculs, interprétations et limites, transmis à Sandrine."},
    Patricia:{inputs:"État de session fourni par Sonia, liste fermée des routes et données publiques à contrôler.",quality:"Véronique relit le relevé ; aucune route imprévue ni écriture SportEasy n’est permise.",evidence:"Relevé route par route, fraîcheur des fichiers et continuité du dernier match finalisé."},
    Gaston:{inputs:"Anomalie reproductible de Patricia, journaux expurgés et version concernée.",quality:"Tamara exécute les tests de régression ; Véronique prononce le verdict final.",evidence:"Diagnostic, correction proposée et résultats des tests associés."},
    Véronique:{inputs:"Preuves de connexion, contrôles de données, diagnostic et tests exécutés.",quality:"Contrôle indépendant, liste des tests non exécutés et justification explicite du GO ou NO-GO.",evidence:"Verdict qualité horodaté et version publique contrôlée."},
    Sandrine:{inputs:"Rapport de Giannis, limites documentées et audit de compréhension d’Inès.",quality:"Chaque proposition doit remonter à un problème observé sans modifier silencieusement Metron.",evidence:"Liste priorisée d’améliorations avec bénéfice, effort, risque et décision attendue."},
    Léonard:{inputs:"Contexte Oscar, analyse Nadir, état Victor et interprétation Giannis pour le même événement.",quality:"Porte automatique de complétude : les quatre blocs doivent être frais, validés et concordants.",evidence:"Brief consultatif transmis à Oscar, ou silence si une seule information obligatoire manque."},
    Konstantinos:{inputs:"Brief, identité du club et observations publiques sourcées de Giorgios.",quality:"Vérifier URL, date, public visé, risques et besoin de validation humaine.",evidence:"Brand Opportunity Brief sourcé, sans publication ni prise de contact automatique."},
    Sonia:{inputs:"Identifiants chiffrés et état technique de la session, jamais affichés dans l’interface.",quality:"Aucun secret dans les sorties ; Patricia confirme ensuite que la connexion est utilisable.",evidence:"État expurgé de la session transmis à Patricia et Véronique."},
    Amara:{inputs:"Alertes et constats d’Elena, Akira, Joyce, Thiago et Jefferson.",quality:"Indépendance des contrôles, gravité justifiée et mesure conservatoire proportionnée.",evidence:"Bulletin de sécurité consolidé avec condition de reprise et décision attendue."},
    Elena:{inputs:"Liste autorisée des comptes, rôles, besoins et changements d’accès.",quality:"Contrôle du moindre privilège et signalement des droits non justifiés.",evidence:"Matrice expurgée des accès et liste des écarts à arbitrer."},
    Akira:{inputs:"Code, configuration et journaux autorisés à analyser.",quality:"Ne jamais recopier un secret ; confirmer uniquement le type, l’emplacement et la portée du risque.",evidence:"Rapport de détection expurgé avec action attendue."},
    Joyce:{inputs:"Inventaire du flux, finalité, destinataires et données personnelles concernées.",quality:"Nécessité, minimisation, exposition et durée de conservation doivent être explicites.",evidence:"Fiche de confidentialité sans reproduction inutile des données sensibles."},
    Thiago:{inputs:"Liste des intégrations, destinations, méthodes et protections attendues.",quality:"Contrôler l’origine, l’authentification, la destination et les méthodes autorisées.",evidence:"Carte des liens et anomalie reproductible sans secret."},
    Jefferson:{inputs:"Signal de sécurité, journaux expurgés et événements horodatés.",quality:"Séparer faits, hypothèses et décisions ; conserver une chronologie reproductible.",evidence:"Dossier d’incident avec gravité, mesures conservatoires et condition de clôture."},
    Élise:{inputs:"Sources administratives autorisées et période du dossier.",quality:"Comparer identité, date, valeur et source sans combler les absences.",evidence:"Tableau des concordances, contradictions, doublons et informations manquantes."},
    Samir:{inputs:"Vidéo autorisée, métadonnées du fichier et contexte du match validé.",quality:"Contrôler lisibilité, continuité, repères temporels et limites techniques.",evidence:"Index des séquences examinables transmis à Nadir."},
    Roman:{inputs:"Contenu à partager, destinataires et justification du besoin Académie.",quality:"Vérifier nécessité, protection, accès et retrait des informations superflues.",evidence:"Contrôle de confidentialité associé au partage ou au dossier."},
    Camélia:{inputs:"Statuts réellement saisis, période et population de référence.",quality:"Afficher dénominateur, inconnues, doublons et limites ; ne jamais interpréter la motivation.",evidence:"Calcul reproductible transmis à Victor."},
    Francisco:{inputs:"Sources, périodes, unités, valeurs et version Metron utilisées par Giannis.",quality:"Contrôler doublons, valeurs absentes, comparabilité et formules.",evidence:"Fiche de qualité et de reproductibilité jointe au rapport de Giannis."},
    Tamara:{inputs:"Version à vérifier, correction proposée et scénarios préparés par Véronique.",quality:"Consigner les versions, résultats, erreurs et tests non exécutés.",evidence:"Rapport de régression reproductible transmis à Véronique."},
    Inès:{inputs:"Définition de la donnée, interface et supports ordinateur/mobile à examiner.",quality:"Contrôler compréhension, cohérence, accessibilité et fidélité à la donnée source.",evidence:"Audit Data/UX avec difficultés observées et corrections proposées."},
    Giorgios:{inputs:"Liste fermée des canaux publics officiels et objectif de veille.",quality:"Conserver URL, date et niveau de preuve ; aucune connexion ni identité d’abonné.",evidence:"Relevé public sourcé transmis à Konstantinos."},
    Vincenzo:{inputs:"Match SportEasy validé, date, terrain, score et vidéothèque publique autorisée.",quality:"Comparer date, terrain et score ; attendre Samir et Oscar avant tout acheminement.",evidence:"Candidat vidéo traçable ou constat daté qu’aucun candidat fiable n’a été trouvé."},
    Angela:{inputs:"Factures, paiements, avoirs, budgets, contrats et échéances autorisés.",quality:"Rapprocher référence, fournisseur, date, quantité, prix et règlement ; toute absence reste visible.",evidence:"Tableau de rapprochement daté, pièces sources, écarts et décision humaine attendue."},
    Juan:{inputs:"Stock, tailles, quantités, licences, commandes et livraisons strictement nécessaires.",quality:"Contrôler les totaux, doublons, données manquantes et limiter l’exposition des tailles nominatives.",evidence:"État de stock et suivi commande-livraison avec écarts documentés."},
    Marco:{inputs:"Boutique Macron Lykos, contrat approuvé, Catalogue Macron 2026 et besoin validé par Juan.",quality:"Vérifier référence, produit, prix connu, clause, date et source ; aucune supposition commerciale.",evidence:"Fiche Macron sourcée transmise à Juan, sans commande ni contact."},
    Rafael:{inputs:"Contrats, briefs et engagements sponsors explicitement transmis.",quality:"Relier chaque obligation, contrepartie et échéance à un document ou une validation humaine.",evidence:"Registre des engagements et renouvellements avec preuves et points à arbitrer."},
    Alba:{inputs:"Documents, photographies et données datables dont la source est identifiable.",quality:"Distinguer fait, source, contradiction et hypothèse ; aucune mémoire orale non confirmée ne devient un fait.",evidence:"Notice historique versionnée et journal des identités ou doublons corrigés."},
    Lola:{inputs:"Données et analyses validées, brief, public cible et format attendu.",quality:"Alba ou le spécialiste source confirme les faits ; Konstantinos contrôle la cohérence éditoriale.",evidence:"Brouillon sourcé portant explicitement la mention à valider avant publication."},
    Bastien:{inputs:"Calendrier autorisé, feuille de résultats, événements et classements SportEasy frais, historique des confrontations et éventuelle vidéo validée.",quality:"Sophie valide le match et le résultat, Patricia la fraîcheur, Francisco les scores et Véronique la passerelle ; doublons, contradictions et conteneurs Tournoi bloquent l’action concernée.",evidence:"Dossier daté avec ligne source, événement visé, état avant/après, opération préparée ou exécutée, contrôle du classement et validation humaine."},
    Nora:{inputs:"Mandats, sources, permissions, cadences, durées cibles, états, preuves, blocages et livrables des quarante-trois agents.",quality:"Contrôler utilité, charge, temps prévu et preuve sans confondre attente légitime, passage automatique et travail accompli ; soumettre les changements durables à Oscar.",evidence:"Tableau quotidien agent par agent avec cadre, charge, temps, preuve, utilité, adaptation proposée et décision d’Oscar."},
    Yanis:{inputs:"Heures de début et de fin, temps d’attente, délais maximaux, relances, usages de modèles, licences et coûts rattachés à une mission.",quality:"Séparer exécution, attente de source, estimation et donnée absente ; comparer des missions de volume équivalent et ne jamais inventer une consommation.",evidence:"Relevé des durées et coûts avec seuil autorisé, dépassement, cause et économie proposée."},
    Salomé:{inputs:"Rulebook, calendriers, déclencheurs, files d’attente, dépendances, contrôles qualité et incidents de processus.",quality:"Vérifier que chaque agent intervient après ses sources et avant son validateur, sans chevauchement, doublon ni raccourci de contrôle.",evidence:"Planning avant-après avec créneau, durée cible, dépendances, délai et scénario de test."},
    Malik:{inputs:"Rapports de Nora, Yanis et Salomé, charge, compétences, missions et capacités existantes.",quality:"Prouver le besoin, vérifier la compatibilité avec le mandat de l’agent proposé et chiffrer l’impact avant de soumettre une mission complémentaire à Oscar.",evidence:"Plan de couverture documenté avec besoin, agent proposé, mission complémentaire, charge, alternatives et validation attendue."},
    Ella:{inputs:"Besoin validé, cadre actuel, catalogue de capacités, outils, modèles, plugins et connecteurs autorisés à l’étude.",quality:"Comparer gain mesurable, simplicité, permissions, données accessibles, coût, maintenance et risque avec eSécurité ; préférer l’adaptation la plus légère.",evidence:"Fiche avant-après sans installation automatique, avec essai mesurable et décision d’Oscar attendue."},
    Salma:{inputs:"Arrivées validées, état du dossier et informations d’effectif autorisées.",quality:"Contrôler étapes, pièces, doublons et responsabilités sans compléter une donnée absente.",evidence:"Dossier d’arrivée daté avec état, manque et prochaine action."},
    Mateo:{inputs:"Départs validés, historique autorisé et actions de clôture attendues.",quality:"Conserver la trace utile et vérifier chaque clôture sans supprimer une donnée source.",evidence:"Fiche de départ datée avec actions terminées ou encore attendues."},
    Priya:{inputs:"Prospects autorisés, phase courante et besoins d’effectif validés par Victor.",quality:"Relier chaque étape à une source et à une décision attendue sans contacter le prospect.",evidence:"Pipeline daté avec phase, besoin, prochaine action et validation attendue."},
  };

  const operationalStateLabels = {
    waiting:"En attente",
    incomplete:"Incomplet",
    executed:"Exécuté",
    controlled:"Contrôlé",
    blocked:"Bloqué",
  };

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "heure indisponible" : date.toLocaleString("fr-FR", {dateStyle:"medium", timeStyle:"short"});
  }

  async function publishedSyncTime() {
    const response = await originalFetch(`https://lykosfutsalclub-cmd.github.io/performance-hub/team-data.js?sync_status=${Date.now()}`, {cache:"no-store"});
    if (!response.ok) throw new Error("sync_status_unavailable");
    const source = await response.text();
    const generatedAt = source.match(/"generatedAt"\s*:\s*"([^"]+)"/)?.[1];
    const timestamp = Date.parse(generatedAt || "");
    if (!Number.isFinite(timestamp)) throw new Error("sync_status_invalid");
    return timestamp;
  }

  function syncAgeLabel(timestamp) {
    if (!timestamp) return "Dernière synchronisation inconnue";
    const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
    return `Dernière synchronisation il y a ${hours} h`;
  }

  function normalizeAgentKey(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  }

  function fallbackAgentState(entries) {
    if (!entries.length) return {state:"waiting", evidenceCount:0, latestEvidenceAt:""};
    const latest = entries[0];
    const status = normalizeAgentKey(`${latest.status || ""} ${latest.statusLabel || ""} ${latest.classification || ""} ${latest.title || ""} ${latest.summary || ""}`);
    const state = /bloque|echec|failed|no-go|alerte|refuse|non operationnel/.test(status) ? "blocked"
      : /incomplet|attention|a etudier|brouillon|limite|pending|attend|indisponible|manqu/.test(status) ? "incomplete"
      : /controle|valide|confirme|operational|\bgo\b/.test(status) ? "controlled"
      : "executed";
    return {state, evidenceCount:entries.length, latestEvidenceAt:latest.occurredAt || "", latestEvidenceId:latest.returnId || latest.missionId || ""};
  }

  function agentOperationalState(agent, entries) {
    const key = normalizeAgentKey(agent);
    const remote = latestAgentStates.find(entry => normalizeAgentKey(entry.agent) === key);
    if (!remote) return fallbackAgentState(entries);
    return {
      state:operationalStateLabels[remote.state] ? remote.state : "incomplete",
      evidenceCount:Number.isFinite(remote.evidenceCount) ? remote.evidenceCount : entries.length,
      latestEvidenceAt:remote.latestEvidenceAt || entries[0]?.occurredAt || "",
      latestEvidenceId:remote.latestEvidenceId || entries[0]?.returnId || entries[0]?.missionId || "",
    };
  }

  const operationStages = [
    {key:"automation", title:"Tâche automatique", description:"Le circuit planifié ou manuel a réellement démarré."},
    {key:"sporteasySync", title:"Synchronisation SportEasy", description:"Une lecture SportEasy a réellement été tentée."},
    {key:"newData", title:"Nouvelles données", description:"Le contrôle a comparé les données avec le dernier état publié."},
    {key:"publication", title:"Publication", description:"Les fichiers validés ont été publiés, ou aucun changement n’était nécessaire."},
    {key:"freshness", title:"Fraîcheur", description:"L’âge du dernier état fiable a été contrôlé séparément."},
  ];

  function operationStageValue(key) {
    const source = key === "freshness" ? latestOperations?.freshness : latestOperations?.sync;
    const stage = source?.stages?.[key];
    if (stage) return {...stage, runUrl:source.runUrl || ""};
    if (key === "freshness" && syncTime) {
      const fresh = Date.now() - syncTime <= 36 * 60 * 60 * 1000;
      return {state:fresh ? "fresh" : "stale", occurredAt:new Date(syncTime).toISOString(), detail:syncAgeLabel(syncTime), derived:true};
    }
    return {state:"waiting", occurredAt:"", detail:"Aucune preuve enregistrée."};
  }

  function operationStagePresentation(key, value) {
    const presentations = {
      automation:{executed:["Exécutée","executed"],failed:["Échec","blocked"],waiting:["En attente","waiting"]},
      sporteasySync:{attempted:["Tentée","executed"],skipped:["Non demandée","waiting"],failed:["Échec","blocked"],waiting:["En attente","waiting"]},
      newData:{present:["Changements détectés","controlled"],none:["Aucun changement","controlled"],unknown:["Résultat incomplet","incomplete"],not_checked:["Non contrôlé","waiting"],waiting:["En attente","waiting"]},
      publication:{published:["Publiée","controlled"],not_required:["Aucune publication nécessaire","controlled"],not_started:["Non démarrée","waiting"],failed:["Échec","blocked"],waiting:["En attente","waiting"]},
      freshness:{fresh:["À jour","controlled"],stale:["À actualiser","blocked"],unknown:["Inconnue","incomplete"],waiting:["En attente","waiting"]},
    };
    const [label, state] = presentations[key]?.[value.state] || ["Incomplet","incomplete"];
    return {label, state};
  }

  function renderOperationPanel() {
    const syncBar = document.querySelector(".lykos-sporteasy-sync");
    if (!syncBar) return;
    let panel = document.querySelector(".lykos-operation-trace");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "lykos-operation-trace";
      panel.setAttribute("aria-labelledby", "lykos-operation-trace-title");
      syncBar.after(panel);
    }
    const header = document.createElement("header");
    const heading = document.createElement("h2");
    heading.id = "lykos-operation-trace-title";
    heading.textContent = "État réel de la chaîne";
    const intro = document.createElement("p");
    intro.textContent = "Chaque jalon possède sa propre preuve : un lancement ne vaut jamais publication.";
    header.append(heading, intro);
    const list = document.createElement("div");
    list.className = "lykos-operation-stage-list";
    for (const definition of operationStages) {
      const value = operationStageValue(definition.key);
      const presentation = operationStagePresentation(definition.key, value);
      const card = document.createElement("article");
      card.className = `lykos-operation-stage is-${presentation.state}`;
      const title = document.createElement("h3");
      title.textContent = definition.title;
      const badge = document.createElement("strong");
      badge.textContent = presentation.label;
      const description = document.createElement("p");
      description.textContent = value.detail || definition.description;
      const footer = document.createElement("footer");
      const time = document.createElement("time");
      time.textContent = value.occurredAt ? formatDate(value.occurredAt) : "Aucune exécution enregistrée";
      footer.append(time);
      if (value.runUrl) {
        const proof = document.createElement("a");
        proof.href = value.runUrl;
        proof.target = "_blank";
        proof.rel = "noopener noreferrer";
        proof.textContent = "Voir la preuve ↗";
        footer.append(proof);
      }
      card.append(title, badge, description, footer);
      list.append(card);
    }
    panel.replaceChildren(header, list);
  }

  function updateSyncBar(message = "") {
    const bar = document.querySelector(".lykos-sporteasy-sync");
    if (!bar) return;
    const label = bar.querySelector("small");
    const button = bar.querySelector("button");
    const status = bar.querySelector("span");
    if (label) label.textContent = syncAgeLabel(syncTime);
    if (button) {
      button.disabled = syncBusy || !sessionToken || latestCapabilities.oscarMissions !== true;
      button.textContent = syncBusy ? "…" : "🔄";
    }
    if (status) {
      status.textContent = message;
      status.hidden = !message;
    }
    renderOperationPanel();
  }

  async function requestSportEasySync() {
    if (syncBusy || !sessionToken || latestCapabilities.oscarMissions !== true) return;
    const previousSync = syncTime;
    syncBusy = true;
    updateSyncBar("Lancement du workflow…");
    try {
      const response = await originalFetch(`${API}/jobs`, {
        method:"POST", cache:"no-store", credentials:"omit",
        headers:{Authorization:`Bearer ${sessionToken}`, "Content-Type":"application/json"},
        body:JSON.stringify({agent:"oscar", conversationId:`sporteasy-sync-${Date.now()}`, message:SPORTEASY_SYNC_PROMPT}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Le workflow n’a pas pu être lancé.");
      const jobDeadline = Date.now() + 120_000;
      while (Date.now() < jobDeadline) {
        await new Promise(resolve => setTimeout(resolve, 1_200));
        const pending = await originalFetch(`${API}/jobs/${data.id}`, {cache:"no-store", credentials:"omit", headers:{Authorization:`Bearer ${sessionToken}`}});
        const result = await pending.json();
        if (pending.status === 202) continue;
        if (!pending.ok || result.error) throw new Error(result.message || result.error || "Le workflow n’a pas pu être lancé.");
        break;
      }
      updateSyncBar("Workflow lancé · publication en cours");
      const publicationDeadline = Date.now() + 12 * 60_000;
      while (Date.now() < publicationDeadline) {
        await new Promise(resolve => setTimeout(resolve, 10_000));
        const latest = await publishedSyncTime();
        syncTime = latest;
        if (!previousSync || latest > previousSync) {
          updateSyncBar("Synchronisation publiée");
          return;
        }
      }
      updateSyncBar("Workflow lancé · vérification encore en cours");
    } catch (error) {
      updateSyncBar(error instanceof Error ? error.message : "Synchronisation impossible pour le moment.");
    } finally {
      syncBusy = false;
      updateSyncBar(document.querySelector(".lykos-sporteasy-sync span")?.textContent || "");
    }
  }

  function installSyncBar() {
    const header = document.querySelector("#estaff-root main > header");
    if (!header || document.querySelector(".lykos-sporteasy-sync")) return;
    const bar = document.createElement("section");
    bar.className = "lykos-sporteasy-sync";
    bar.setAttribute("aria-label", "Synchronisation SportEasy");
    const label = document.createElement("small");
    label.textContent = syncAgeLabel(syncTime);
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Relancer maintenant la synchronisation SportEasy";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", requestSportEasySync);
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    status.hidden = true;
    bar.append(label, button, status);
    header.after(bar);
    updateSyncBar();
    publishedSyncTime().then(value => {syncTime = value; updateSyncBar();}).catch(() => updateSyncBar());
  }

  function makeCollapsibleParagraph(text, className = "") {
    const paragraph = document.createElement("p");
    if (className) paragraph.className = className;
    const normalized = String(text || "").trim();
    if (normalized.length <= COLLAPSE_THRESHOLD) {
      paragraph.textContent = normalized;
      return paragraph;
    }
    paragraph.classList.add("lykos-collapsible-notification");
    paragraph.dataset.lykosCollapsible = "true";
    const preview = document.createElement("span");
    preview.className = "lykos-notification-preview";
    preview.textContent = `${normalized.slice(0, COLLAPSE_THRESHOLD).trimEnd()}…`;
    const full = document.createElement("span");
    full.className = "lykos-notification-full";
    full.textContent = normalized;
    full.hidden = true;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "lykos-notification-toggle";
    toggle.textContent = "… Lire la suite";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      preview.hidden = !expanded;
      full.hidden = expanded;
      toggle.textContent = expanded ? "… Lire la suite" : "Réduire";
    });
    paragraph.append(preview, full, toggle);
    return paragraph;
  }

  function collapseLongExistingNotifications(container) {
    for (const paragraph of container?.querySelectorAll(":scope > div > p") || []) {
      if (paragraph.dataset.lykosCollapsible === "true" || paragraph.textContent.trim().length <= COLLAPSE_THRESHOLD) continue;
      paragraph.replaceWith(makeCollapsibleParagraph(paragraph.textContent, paragraph.className));
    }
  }

  function selectedConversation() {
    return [...document.querySelectorAll("section[aria-label]")].find(node => node.getAttribute("aria-label")?.startsWith("Espace de ")) || null;
  }

  function reportEntries() {
    let esupportEntries = [];
    if (Array.isArray(latestReport?.history)) esupportEntries = latestReport.history;
    else if (Array.isArray(latestReport?.feed)) esupportEntries = [...latestReport.feed].reverse();
    else if (latestReport?.summary) esupportEntries = [{
      missionId:"esupport-legacy", sequence:4, agent:"Oscar", type:"supervision",
      status:latestReport.status === "operational" ? "confirme" : "attention",
      title:latestReport.status === "operational" ? "Service confirmé opérationnel" : "Service non confirmé",
      summary:latestReport.summary, occurredAt:latestReport.checkedAt, service:"eSupport",
    }];
    return [...latestReturns, ...esupportEntries]
      .map(entry => entry.agent === "Milo" ? {
        ...entry,
        agent:"Sonia",
        type:entry.type === "connexion" ? "identifiants" : entry.type,
        summary:String(entry.summary || "").startsWith("Milo a détecté l’expiration")
          ? "Sonia a détecté la déconnexion et relié les identifiants chiffrés au mécanisme d’authentification. La session est de nouveau utilisable ; aucun secret n’a été affiché."
          : entry.summary,
      } : entry)
      .sort((a,b) => Date.parse(b.occurredAt || 0) - Date.parse(a.occurredAt || 0));
  }

  function reportCard(entry) {
    const card = document.createElement("article");
    card.className = `lykos-agent-report is-${String(entry.status || "attention").replace(/[^a-z-]/g, "")}`;
    const label = document.createElement("small");
    label.textContent = `${entry.agent.toLocaleUpperCase("fr")} · ${String(entry.type || "récapitulatif").toLocaleUpperCase("fr")}`;
    const title = document.createElement("strong");
    title.textContent = entry.title || "Récapitulatif eSupport";
    const summary = makeCollapsibleParagraph(entry.summary || "Aucun détail supplémentaire.");
    const status = document.createElement("span");
    status.className = "lykos-agent-report-status";
    status.textContent = `Statut · ${entry.statusLabel || entry.status || "information"}`;
    const time = document.createElement("time");
    time.textContent = formatDate(entry.occurredAt);
    card.append(label, title, summary, status, time);
    if (entry.content) {
      const disclosure = document.createElement("div");
      disclosure.className = "lykos-agent-report-content";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "lykos-agent-report-content-toggle";
      toggle.textContent = "Lire l’analyse complète";
      toggle.setAttribute("aria-expanded", "false");
      const full = document.createElement("div");
      full.className = "lykos-agent-report-full";
      full.textContent = entry.content;
      full.hidden = true;
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        toggle.textContent = expanded ? "Lire l’analyse complète" : "Replier l’analyse complète";
        full.hidden = expanded;
      });
      disclosure.append(toggle, full);
      card.append(disclosure);
    }
    return card;
  }

  function renderCards(container, entries, signature) {
    if (container.dataset.signature === signature) return;
    container.replaceChildren(...entries.map(reportCard));
    container.dataset.signature = signature;
  }

  function installServiceButtons() {
    for (const heading of document.querySelectorAll("h3[data-service]")) {
      const service = heading.dataset.service;
      if (!serviceLabels[service] || heading.querySelector(".lykos-service-button")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lykos-service-button";
      button.textContent = serviceLabels[service];
      button.setAttribute("aria-label", `Voir le fil global ${serviceLabels[service]}`);
      button.addEventListener("click", () => {selectedService = service; scheduleReadOnlyMode();});
      heading.replaceChildren(button);
    }
    for (const button of document.querySelectorAll('button[aria-pressed]')) {
      const name = button.querySelector("strong")?.textContent?.trim();
      const role = esupportRoles[name];
      const title = button.querySelector("strong")?.nextElementSibling;
      if (role && title?.tagName === "SMALL") title.textContent = role.title;
    }
  }

  function renderAgentContract(conversation, agent, entries, anchor) {
    const profile = operationalProfiles[agent];
    const role = esupportRoles[agent];
    if (!profile || !role || !anchor) return null;
    const state = agentOperationalState(agent, entries);
    let contract = conversation.querySelector(".lykos-agent-contract");
    if (!contract) {
      contract = document.createElement("section");
      contract.className = "lykos-agent-contract";
      anchor.after(contract);
    }
    const header = document.createElement("header");
    const title = document.createElement("div");
    const eyebrow = document.createElement("small");
    eyebrow.textContent = "CONTRAT OPÉRATIONNEL";
    const heading = document.createElement("h2");
    heading.textContent = agent;
    title.append(eyebrow, heading);
    const badge = document.createElement("strong");
    badge.className = `lykos-agent-state is-${state.state}`;
    badge.textContent = operationalStateLabels[state.state] || operationalStateLabels.incomplete;
    header.append(title, badge);

    const details = document.createElement("dl");
    const sourceState = latestBusinessSources?.agents?.[agentIdsByName[agent]];
    const sourceStatus = sourceState
      ? sourceState.status === "connected"
        ? `${sourceState.sourceCount} source${sourceState.sourceCount > 1 ? "s" : ""} métier lue${sourceState.sourceCount > 1 ? "s" : ""}${sourceState.freshAt ? ` · état le ${formatDate(sourceState.freshAt)}` : ""}.`
        : sourceState.status === "partial"
          ? `${sourceState.sourceCount} source${sourceState.sourceCount > 1 ? "s" : ""} lue${sourceState.sourceCount > 1 ? "s" : ""}, ${sourceState.failureCount} lecture${sourceState.failureCount > 1 ? "s" : ""} en échec.`
          : "Connexion métier bloquée : aucune donnée n’est remplacée par une estimation."
      : latestBusinessSources?.status === "credentials_required"
        ? "Autorisation Google Workspace requise avant la première lecture métier."
        : "Aucun contrôle de connexion métier enregistré pour cet agent.";
    const fields = [
      ["Déclencheur", role.when],
      ["Informations nécessaires", profile.inputs],
      ["Connexion métier", sourceStatus],
      ["Résultat attendu", role.output],
      ["Contrôle qualité", profile.quality],
      ["Preuve visible", profile.evidence],
      ["État actuel", state.evidenceCount
        ? `${state.evidenceCount} preuve${state.evidenceCount > 1 ? "s" : ""} enregistrée${state.evidenceCount > 1 ? "s" : ""}${state.latestEvidenceAt ? ` · dernière le ${formatDate(state.latestEvidenceAt)}` : ""}.`
        : "Aucune preuve enregistrée : l’agent reste en attente, sans être présenté comme disponible ou exécuté."],
    ];
    for (const [label, value] of fields) {
      const item = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      item.append(term, description);
      details.append(item);
    }
    contract.replaceChildren(header, details);
    return contract;
  }

  function enforceReadOnlyMode() {
    scheduled = false;
    installSyncBar();
    const conversation = selectedConversation();
    if (!conversation) return;
    installServiceButtons();
    const agent = conversation.getAttribute("aria-label").replace("Espace de ", "");
    if (agent !== selectedAgent) {
      selectedAgent = agent;
      agentFeedOpen = false;
    }
    const agentEntries = reportEntries().filter(entry => entry.agent === agent);
    if (agentEntries.length && !manuallyCollapsedAgentFeeds.has(agent)) agentFeedOpen = true;
    const textarea = conversation.querySelector('textarea[aria-label^="Message à "]');
    const composer = textarea?.closest("form") || textarea?.parentElement;
    const oscarMissionEnabled = agent === "Oscar" && latestCapabilities.oscarMissions === true;
    if (composer) composer.hidden = !oscarMissionEnabled;
    if (composer?.nextElementSibling) composer.nextElementSibling.hidden = !oscarMissionEnabled;
    if (textarea && oscarMissionEnabled) {
      textarea.setAttribute("aria-label", "Mission à transmettre à Oscar");
      textarea.placeholder = "Décris la mission à Oscar. Il la répartira entre les agents utiles.";
    }

    const chatHeader = conversation.querySelector("header");
    const tabs = conversation.querySelector('nav[aria-label="Contenu de l’agent"]');
    const tabButtons = tabs?.querySelectorAll("button") || [];
    if (tabButtons[0]) {
      const feedToggle = tabButtons[0];
      feedToggle.classList.add("lykos-agent-feed-toggle");
      feedToggle.textContent = agentEntries.length ? `💬 Fil de l’agent · ${agentEntries.length}` : "💬 Fil de l’agent";
      feedToggle.setAttribute("aria-expanded", String(agentFeedOpen));
      feedToggle.setAttribute("aria-label", `${agentFeedOpen ? "Replier" : "Dérouler"} le fil de ${agent}`);
      if (!feedToggle.dataset.lykosFeedToggle) {
        feedToggle.dataset.lykosFeedToggle = "true";
        feedToggle.addEventListener("click", () => {
          agentFeedOpen = !agentFeedOpen;
          if (agentFeedOpen) manuallyCollapsedAgentFeeds.delete(selectedAgent);
          else manuallyCollapsedAgentFeeds.add(selectedAgent);
          scheduleReadOnlyMode();
        });
      }
    }
    if (tabButtons[1]) tabButtons[1].hidden = true;

    const messages = conversation.querySelector('[aria-live="polite"]');
    if (messages) messages.classList.add("lykos-agent-feed-content");
    collapseLongExistingNotifications(messages);
    conversation.querySelector(".lykos-oneway-notice")?.remove();

    const roleSource = messages?.querySelector("details");
    let roleDisclosure = conversation.querySelector("details.lykos-agent-purpose");
    if (roleSource && tabs) {
      roleSource.hidden = true;
      if (!roleDisclosure || roleDisclosure.dataset.agent !== agent) {
        roleDisclosure?.remove();
        roleDisclosure = roleSource.cloneNode(true);
        roleDisclosure.hidden = false;
        roleDisclosure.classList.add("lykos-agent-purpose");
        roleDisclosure.dataset.agent = agent;
        tabs.before(roleDisclosure);
      }
    }
    if (roleDisclosure) {
      const role = esupportRoles[agent];
      if (role) {
        const summary = roleDisclosure.querySelector("summary");
        const summaryText = summary?.querySelector(".roleSummary") || summary?.querySelector("strong")?.nextElementSibling;
        const purpose = roleDisclosure.querySelector(":scope > p");
        const details = roleDisclosure.querySelectorAll("dd");
        if (summaryText) summaryText.textContent = role.summary;
        if (purpose) purpose.textContent = role.purpose;
        if (details[0]) details[0].textContent = role.when;
        if (details[1]) details[1].textContent = role.output;
      }
      const roleLabels = roleDisclosure.querySelectorAll("dt");
      const isFemale = femaleAgents.has(agent);
      if (roleLabels[0]) roleLabels[0].textContent = isFemale ? "Quand la solliciter" : "Quand le solliciter";
      if (roleLabels[1]) roleLabels[1].textContent = isFemale ? "Ce qu’elle prépare" : "Ce qu’il prépare";
      const roleFooter = roleDisclosure.querySelector("footer");
      if (roleFooter) roleFooter.textContent = `${isFemale ? "Agente installée" : "Agent installé"} dans le moteur privé OpenClaw du club. Ses outils restent cloisonnés selon sa mission.`;
    }

    const agentContract = renderAgentContract(conversation, agent, agentEntries, roleDisclosure || chatHeader);

    let policy = conversation.querySelector(".lykos-estaff-policy");
    if (!policy) {
      policy = document.createElement("div");
      policy.className = "lykos-estaff-policy";
      chatHeader?.after(policy);
    }
    const updatedAt = new Date(latestStateUpdatedAt);
    const freshness = Number.isNaN(updatedAt.getTime())
      ? "Dernière actualisation indisponible"
      : `Dernière actualisation : ${updatedAt.toLocaleString("fr-FR", {dateStyle:"long", timeStyle:"short", timeZone:"Europe/Paris"})}`;
    policy.replaceChildren();
    const freshnessText = document.createElement("small");
    freshnessText.textContent = freshness;
    policy.append(freshnessText);

    let serviceFeed = conversation.querySelector(".lykos-service-feed");
    const serviceMode = Boolean(selectedService);
    if (serviceMode && tabs) {
      if (!serviceFeed) {
        serviceFeed = document.createElement("section");
        serviceFeed.className = "lykos-service-feed";
        tabs.before(serviceFeed);
      }
      const serviceName = serviceLabels[selectedService];
      const entries = reportEntries().filter(entry => entry.service === serviceName);
      const signature = `${serviceName}:${entries.map(entry => `${entry.missionId}-${entry.sequence}-${entry.status}`).join("|")}`;
      if (serviceFeed.dataset.signature !== signature) {
        const header = document.createElement("header");
        const heading = document.createElement("h2");
        heading.textContent = `Fil global ${serviceName}`;
        const description = document.createElement("p");
        description.textContent = serviceDescriptions[selectedService] || (entries.length
          ? "Tous les contrôles, diagnostics, validations et conclusions du service, du plus récent au plus ancien."
          : "Aucun récapitulatif publié par ce service pour le moment.");
        header.append(heading, description);
        const frameworkItems = serviceFrameworks[selectedService] || [];
        const framework = document.createElement("dl");
        framework.className = "lykos-service-framework";
        for (const [label, value] of frameworkItems) {
          const item = document.createElement("div");
          const term = document.createElement("dt");
          term.textContent = label;
          const detail = document.createElement("dd");
          detail.textContent = value;
          item.append(term, detail);
          framework.append(item);
        }
        const list = document.createElement("div");
        list.className = "lykos-service-feed-list";
        renderCards(list, entries, signature);
        serviceFeed.replaceChildren(header, framework, list);
        serviceFeed.dataset.signature = signature;
      }
    }
    if (serviceFeed) serviceFeed.hidden = !serviceMode;
    if (chatHeader) chatHeader.hidden = serviceMode;
    if (roleDisclosure) roleDisclosure.hidden = serviceMode;
    if (agentContract) agentContract.hidden = serviceMode;
    if (tabs) tabs.hidden = serviceMode;
    if (messages) messages.hidden = serviceMode || !agentFeedOpen;

    const agentStatus = conversation.querySelector("header > span:last-child");
    if (agentStatus) {
      const current = agentOperationalState(agent, agentEntries);
      agentStatus.classList.remove("is-waiting", "is-incomplete", "is-executed", "is-controlled", "is-blocked");
      agentStatus.classList.add(`is-${current.state}`);
      agentStatus.textContent = operationalStateLabels[current.state] || operationalStateLabels.incomplete;
    }

    const emptyTitle = [...(messages?.querySelectorAll("h3") || [])].find(node => node.textContent.includes("est prêt"));
    if (emptyTitle) {
      emptyTitle.textContent = "Aucun autre récapitulatif pour le moment";
      if (emptyTitle.nextElementSibling) emptyTitle.nextElementSibling.textContent = femaleAgents.has(agent)
        ? `${agent} publiera ici ses prochains travaux et ce qu’elle prévoit de faire.`
        : `${agent} publiera ici ses prochains travaux et ce qu’il prévoit de faire.`;
    }

    const activity = document.querySelector('section[aria-label="Activité"] p');
    if (activity && activity.textContent !== "Rapports automatiques") activity.textContent = "Rapports automatiques";
    const footerStatus = [...document.querySelectorAll("footer span")].find(node => node.textContent.includes("moteur local"));
    if (footerStatus) footerStatus.textContent = "Récapitulatifs automatiques";
    for (const version of document.querySelectorAll("small")) {
      if (/^Rulebook \d+\.\d+\.\d+$/.test(version.textContent.trim())) version.textContent = "Rulebook 3.24.0";
    }
    const activityCounters = document.querySelectorAll('section[aria-label="Activité"] strong');
    if (activityCounters[0]) activityCounters[0].textContent = "43";
    if (activityCounters[1] && activityCounters[1].textContent !== "0") activityCounters[1].textContent = "43";
    const rosterCount = [...document.querySelectorAll("aside h2 small")].find(node => node.textContent.includes("installé"));
    if (rosterCount) rosterCount.textContent = "43 agents installés";

    document.getElementById("lykos-esupport-report")?.remove();
    if (!messages) return;
    let agentReports = messages.querySelector(".lykos-agent-reports");
    if (agentEntries.length) {
      if (!agentReports) {
        agentReports = document.createElement("div");
        agentReports.className = "lykos-agent-reports";
        messages.prepend(agentReports);
      }
      renderCards(agentReports, agentEntries, agentEntries.map(entry => `${entry.missionId}-${entry.sequence}-${entry.status}`).join("|"));
    } else {
      agentReports?.remove();
    }
    const emptyState = [...messages.querySelectorAll("h3")].find(node => node.textContent.includes("Aucun autre récapitulatif"))?.parentElement;
    if (emptyState) emptyState.hidden = agentEntries.length > 0;
  }

  function scheduleReadOnlyMode() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enforceReadOnlyMode);
  }

  function mergeEntries(...groups) {
    const entries = groups.flatMap(group => Array.isArray(group) ? group : []);
    const unique = new Map();
    for (const entry of entries) {
      const key = entry.returnId || `${entry.missionId || "mission"}-${entry.sequence || 0}-${entry.agent || "agent"}-${entry.occurredAt || "date"}`;
      if (!unique.has(key) || Date.parse(entry.occurredAt || "") > Date.parse(unique.get(key)?.occurredAt || "")) unique.set(key,entry);
    }
    return [...unique.values()].sort((left,right) => Date.parse(right.occurredAt || "") - Date.parse(left.occurredAt || ""));
  }

  async function loadReport(token, generation) {
    if (generation !== sessionGeneration) return;
    sessionToken = token;
    try {
      const options = {cache:"no-store", credentials:"omit", headers:{Authorization:`Bearer ${token}`}};
      const [response, stateResponse] = await Promise.all([
        originalFetch(`${API}/esupport`, options),
        originalFetch(`${API}/state`, options),
      ]);
      if (generation !== sessionGeneration || sessionToken !== token) return;
      if (response.status === 401 || stateResponse.status === 401) {
        sessionGeneration += 1;
        sessionToken = "";
        window.dispatchEvent(new CustomEvent("lykos:estaff-cloud-session", {detail:{token:""}}));
        latestReport = null;
        latestReturns = [];
        latestAgentStates = [];
        latestOperations = {};
        latestBusinessSources = {};
        scheduleReadOnlyMode();
        return;
      }
      latestReport = response.ok ? await response.json() : null;
      const state = stateResponse.ok ? await stateResponse.json() : {};
      latestCapabilities = state.capabilities ?? {};
      latestReturns = mergeEntries(state.returns).map(entry => ({
        ...entry,
        agent:agentDisplayNames[String(entry.agent || "").toLocaleLowerCase("fr")] || entry.agent,
      }));
      latestAgentStates = (Array.isArray(state.agentStates) ? state.agentStates : []).map(entry => ({
        ...entry,
        agent:agentDisplayNames[String(entry.agent || "").toLocaleLowerCase("fr")] || entry.agent,
      }));
      latestOperations = state.operations && typeof state.operations === "object" ? state.operations : {};
      latestBusinessSources = state.businessSources && typeof state.businessSources === "object" ? state.businessSources : latestBusinessSources;
      latestStateUpdatedAt = [
        latestReport?.checkedAt,
        state.esupport?.checkedAt,
      latestOperations?.updatedAt,
        latestBusinessSources?.updatedAt,
        ...latestReturns.map(entry => entry.occurredAt),
      ].filter(Boolean).sort((left, right) => Date.parse(right) - Date.parse(left))[0] || "";
    } catch {
      if (generation !== sessionGeneration || sessionToken !== token) return;
      latestReport = {status:"pending", summary:"Le rapport automatique eSupport est momentanément indisponible."};
      latestReturns = [];
      latestAgentStates = [];
      latestOperations = {};
      latestBusinessSources = {};
      latestStateUpdatedAt = "";
      latestCapabilities = {};
    }
    scheduleReadOnlyMode();
  }

  window.fetch = async (...args) => {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    let loginGeneration = sessionGeneration;
    if (url === `${API}/session`) loginGeneration = ++sessionGeneration;
    const response = await originalFetch(...args);
    if (url === `${API}/session` && response.ok) {
      response.clone().json().then(async payload => {
        if (loginGeneration !== sessionGeneration || typeof payload.token !== "string") return;
        window.dispatchEvent(new CustomEvent("lykos:estaff-cloud-session", {detail:{token:payload.token}}));
        await loadReport(payload.token,loginGeneration);
      }).catch(() => {});
    }
    return response;
  };

  document.addEventListener("click", event => {
    const button = event.target.closest?.("button[aria-pressed]");
    const conversation = selectedConversation();
    if (selectedService && button && !conversation?.contains(button)) {
      selectedService = "";
      scheduleReadOnlyMode();
    }
  });

  new MutationObserver(() => {
    if (sessionToken && document.body.textContent.includes("Code d’accès")) {
      sessionGeneration += 1;
      sessionToken = "";
      window.dispatchEvent(new CustomEvent("lykos:estaff-cloud-session", {detail:{token:""}}));
      latestReport = null;
      latestReturns = [];
      latestStateUpdatedAt = "";
      latestCapabilities = {};
      latestAgentStates = [];
      latestOperations = {};
    }
    scheduleReadOnlyMode();
  }).observe(document.documentElement, {childList:true, subtree:true});
})();
