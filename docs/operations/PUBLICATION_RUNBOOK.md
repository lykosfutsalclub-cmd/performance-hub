# Reconstruction, tests et publication du Performance Hub

Version opérationnelle : 20 septembre 2026

## Principe

L’unique site public est `https://lykosfutsalclub-cmd.github.io/performance-hub/`. La branche publique `main` du dépôt `lykosfutsalclub-cmd/performance-hub` est toujours relue avant une modification. Une copie locale ancienne ne doit jamais remplacer cette branche.

La publication nominative est autorisée uniquement lorsque le registre privé des autorisations a été contrôlé et que la variable GitHub `PUBLIC_INDIVIDUAL_DATA_AUTHORIZED` vaut exactement `verified`. Cette variable est une barrière technique ; elle ne remplace pas les preuves conservées par le club.

## Outils verrouillés

- Node.js : `24.19.0`, déclaré dans `.node-version`, `package.json` et l’automatisation ;
- `actions/checkout` v4 : révision `11d5960a326750d5838078e36cf38b85af677262` ;
- `actions/setup-node` v4 : révision `49933ea5288caeca8642d1e84afbd3f7d6820020` ;
- `actions/github-script` v8 : révision `ed597411d8f924073f98dfc5c65a23a2325f34cd`.

Une révision est l’empreinte exacte du code utilisé. Elle évite qu’une étiquette générale comme « v4 » change silencieusement.

## Reconstruction complète

L’automatisation `.github/workflows/esupport-monitor.yml` suit cet ordre :

1. vérifier que la publication individuelle est autorisée ;
2. recopier les graines privées nécessaires dans l’espace temporaire de l’automatisation ;
3. obtenir une identité GitHub temporaire pour le relais Cloudflare SportEasy en lecture seule ;
4. synchroniser l’effectif, les sources statistiques, les détails, agrégats, matchs, présences et comptes rendus ;
5. reconstruire le référentiel statistique, le référentiel des matchs et les statistiques secondaires ;
6. exécuter toute la suite de tests avec `node scripts/verify-publication-tests.mjs` ;
7. refuser la publication si moins de 54 tests ont réellement été exécutés ; la suite validée le 19 septembre en comporte 78 ;
8. auditer les matchs et les statistiques secondaires ;
9. reconstruire ensemble `player-secondary-data.js`, `team-data.js` et `pantheon-data.js` ;
10. vérifier les dates, le nombre de matchs du Panthéon et l’absence d’identifiants techniques externes ;
11. installer uniquement les trois fichiers validés ;
12. créer un commit de synchronisation et le pousser sur `main` ;
13. demander la reconstruction GitHub Pages ;
14. relire les trois fichiers sur l’adresse publique et confirmer leurs dates exactes.

Toute commande en échec arrête la chaîne. Les fichiers générés ne sont alors ni installés ni publiés.

## Service privé Cloudflare

Le relais privé unique de l’automatisation est le Worker Cloudflare `https://lykos-estaff-service.lykosfutsalclub.workers.dev`. Un Worker est un petit service exécuté dans le cloud : il reste disponible lorsque l’ordinateur local est éteint. Il ne constitue pas un second site public ; le Performance Hub GitHub Pages demeure l’unique interface publique.

GitHub Actions présente au Worker une identité OIDC temporaire — un justificatif signé, limité à l’exécution en cours et qui n’est pas un mot de passe permanent. Le Worker accepte alors uniquement les routes machine prévues :

- lecture SportEasy : `/api/estaff/worker/sporteasy-read/` ;
- contrôle eSupport : `/api/estaff/worker/esupport-check` ;
- rapport d’Oscar : `/api/estaff/worker/oscar-brief` ;
- analyse de Giannis : `/api/estaff/worker/giannis-analysis` ;
- porte de complétude de Léonard : `/api/estaff/worker/leonard-analysis` ;
- preuves d’exécution et alertes : les routes Cloudflare `operation-state` et `mobile-alert`.

La chaîne GitHub ne dépend plus d’aucune route de l’ancien hébergement Sites. Les données SportEasy restent lues par requêtes `GET`, le cookie de session demeure dans le service privé et aucune réponse du relais ne peut renvoyer un cookie au dépôt public.

## Tests obligatoires

La commande officielle est :

```sh
node scripts/verify-publication-tests.mjs
```

Elle exécute tous les fichiers `test/*.test.mjs`, exige leur réussite et vérifie qu’au moins 54 tests ont été comptés. Ajouter des tests augmente ce nombre ; il ne faut jamais réduire la suite pour atteindre artificiellement le seuil.

## Panthéon

Le Panthéon est reconstruit par `scripts/sporteasy/build-pantheon-data.mjs` dans la même chaîne que les espaces Joueurs et Équipe. Les entraînements, matchs annulés, rencontres sans score complet, rencontres sans statistiques individuelles et conteneurs de tournoi sont exclus. Les conteneurs « Pro Tour » ne sont pas comptés comme des matchs supplémentaires.

Le contrôle `scripts/sporteasy/audit-public-data.mjs` compare le résultat aux matchs privés validés et bloque toute différence de nombre ou de date.

Oscar peut également déclencher cette synchronisation immédiatement, sans attendre le cycle quotidien de 10 h. Une alerte de sécurité non critique est consignée et traitée sans bloquer ; seules une divulgation critique plausible, une compromission active ou une atteinte matérielle à l'intégrité suspendent la publication pour motif de sécurité. Les audits sportifs et la preuve d'autorisation nominative restent obligatoires.

## Alertes

- Une synchronisation en échec produit une étape rouge intitulée « Signaler clairement une synchronisation en échec » et un résumé lisible dans GitHub Actions.
- Après un premier échec du « Contrôle quotidien eSupport », `.github/workflows/esupport-autorecovery.yml` relance automatiquement et une seule fois les seules tâches en échec. Cette reprise couvre les incidents temporaires sans rejouer inutilement les tâches déjà réussies.
- Si la seconde tentative échoue, aucune troisième tentative n’est lancée : l’échec persistant reste visible et nécessite une analyse. Cette limite empêche une boucle infinie et ne contourne jamais les tests, le GO de Véronique, la confidentialité ou la sécurité.
- Le contrôle de fraîcheur relit chaque heure les trois jeux de données publics. Il échoue si l’un d’eux est inaccessible, non daté ou vieux de plus de 36 heures.
- La synchronisation SportEasy complète s'exécute chaque jour à **10 h, heure de Paris**. Deux créneaux UTC couvrent automatiquement l'heure d'été et l'heure d'hiver. Le moteur reconstitue l'heure nominale portée par le cron : si GitHub démarre le travail en retard, l'échéance reste due et s'exécute ; le second créneau UTC reste ignoré pour éviter un doublon.
- Le contrôle eSupport de 10 h ne publie plus le rapport quotidien d'Oscar. Ce rapport dispose de son propre créneau à **11 h 30, heure de Paris** et applique la même règle de rattrapage sans doublon. Un lancement manuel peut toujours demander immédiatement le contrôle puis le rapport.
- La clé d'échéance contient la nature du travail et la date de Paris, par exemple `sporteasy-sync:2026-09-20`. Elle est inscrite dans les traces GitHub pour distinguer l'heure planifiée de l'heure réelle de démarrage. La reprise unique après échec reste autorisée ; elle ne crée pas une nouvelle échéance.
- Le planificateur privé eStaff est distinct de GitHub Actions : un Cron Trigger Cloudflare le réveille toutes les cinq minutes, puis le registre `3.13.0` détermine quels agents sont réellement dus en heure de Paris. Ces réveils sont des contrôles de code sans intelligence artificielle.
- Après validation du code d’accès, l’interface fusionne les récapitulatifs de ce planificateur avec les retours eSupport existants. Cette passerelle ne publie aucun second site et n’enregistre jamais le code dans le navigateur. Le service de cadences applique un quota Cloudflare et un compteur privé persistant ; il reste consultatif et refuse les missions, qui continuent de passer uniquement par le service principal d’Oscar.
- Les passages sans évolution restent absents des fils visibles mais sont inscrits dans le journal privé. Une analyse de Giannis n’est demandée après synchronisation que lorsque les trois fichiers validés ont réellement changé ; le service vérifie aussi leur empreinte afin d’éviter un doublon.
- Une identité temporaire locale expirée ne vaut jamais preuve d'une déconnexion SportEasy. L'état de référence est celui du dernier contrôle cloud eSupport authentifié par GitHub ; Oscar doit déclencher ou attendre ce contrôle plutôt que demander à Fabien une reconnexion ordinaire.
- L’interface affiche également la date et l’heure et utilise un voyant orange lorsque les données dépassent 36 heures.
- Les notifications mobiles eStaff sont proposées uniquement après ouverture de l’espace privé et accord explicite du téléphone. Une notification de test est envoyée lors de l’activation.
- Elles signalent la fin d’une mission d’Oscar, un échec de synchronisation ou des données publiques vieilles de plus de 36 heures. Les répétitions d’une même alerte technique sont regroupées pendant six heures.
- Sur iPhone, l’espace eStaff doit d’abord être ajouté à l’écran d’accueil depuis Safari. Le bouton eStaff permet ensuite d’activer ou de désactiver les notifications.
- L’abonnement technique du téléphone est conservé dans le stockage privé du service eStaff ; il n’est jamais publié dans le dépôt ni dans les fichiers du Performance Hub.

## Permissions de l’automatisation

- Porte de Léonard : lecture du dépôt et création d’une identité temporaire uniquement.
- Chaîne eSupport : écriture du contenu pour le commit automatique, identité temporaire pour le relais privé et écriture Pages pour demander la reconstruction.
- Surveillance de fraîcheur : lecture du dépôt uniquement.
- Reprise autonome : droit limité à la relance d’une exécution GitHub Actions ; aucun droit d’écriture sur le contenu, Pages ou les identités temporaires.

Le fichier fixe les permissions par tâche. Aucune permission d’écriture globale n’est accordée à tout le workflow.

## Sources eStaff

Les fichiers compilés de `estaff/assets/` ne constituent jamais la source officielle. Les sources lisibles de l’interface sont conservées dans `estaff-src/` et les ajouts lisibles dans `estaff/assets/esupport-report.js` et ses feuilles de style. Le service privé, ses tests, ses scripts de construction et le Rulebook sont conservés dans le projet source `estaff-cloud-runtime`.

Le service privé de référence est désormais le Worker Cloudflare `lykos-estaff-service`. Son code source, ses tests et sa configuration versionnée restent conservés dans `estaff-cloud-runtime` avant chaque déploiement. Aucun hébergement Sites n’est requis par cette procédure.

## Retour arrière

En cas de défaut après publication :

1. ne pas modifier les données directement dans les fichiers générés ;
2. identifier le dernier commit public validé ;
3. corriger la source ou l’automatisation sur une branche issue de la branche publique actuelle ;
4. relancer la totalité des tests et audits ;
5. publier un nouveau commit correctif ;
6. vérifier les trois fichiers sur l’adresse publique.

Un retour arrière ne doit jamais réintroduire des identifiants techniques, des données privées ou une ancienne copie du Rulebook.
