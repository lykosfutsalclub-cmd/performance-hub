# Reconstruction, tests et publication du Performance Hub

Version opérationnelle : 18 septembre 2026

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
3. obtenir une identité GitHub temporaire pour le relais SportEasy en lecture seule ;
4. synchroniser l’effectif, les sources statistiques, les détails, agrégats, matchs, présences et comptes rendus ;
5. reconstruire le référentiel statistique, le référentiel des matchs et les statistiques secondaires ;
6. exécuter toute la suite de tests avec `node scripts/verify-publication-tests.mjs` ;
7. refuser la publication si moins de 54 tests ont réellement été exécutés ; la suite actuelle en comporte 65 ;
8. auditer les matchs et les statistiques secondaires ;
9. reconstruire ensemble `player-secondary-data.js`, `team-data.js` et `pantheon-data.js` ;
10. vérifier les dates, le nombre de matchs du Panthéon et l’absence d’identifiants techniques externes ;
11. installer uniquement les trois fichiers validés ;
12. créer un commit de synchronisation et le pousser sur `main` ;
13. demander la reconstruction GitHub Pages ;
14. relire les trois fichiers sur l’adresse publique et confirmer leurs dates exactes.

Toute commande en échec arrête la chaîne. Les fichiers générés ne sont alors ni installés ni publiés.

## Tests obligatoires

La commande officielle est :

```sh
node scripts/verify-publication-tests.mjs
```

Elle exécute tous les fichiers `test/*.test.mjs`, exige leur réussite et vérifie qu’au moins 54 tests ont été comptés. Ajouter des tests augmente ce nombre ; il ne faut jamais réduire la suite pour atteindre artificiellement le seuil.

## Panthéon

Le Panthéon est reconstruit par `scripts/sporteasy/build-pantheon-data.mjs` dans la même chaîne que les espaces Joueurs et Équipe. Les entraînements, matchs annulés, rencontres sans score complet, rencontres sans statistiques individuelles et conteneurs de tournoi sont exclus. Les conteneurs « Pro Tour » ne sont pas comptés comme des matchs supplémentaires.

Le contrôle `scripts/sporteasy/audit-public-data.mjs` compare le résultat aux matchs privés validés et bloque toute différence de nombre ou de date.

## Alertes

- Une synchronisation en échec produit une étape rouge intitulée « Signaler clairement une synchronisation en échec » et un résumé lisible dans GitHub Actions.
- Le contrôle de fraîcheur relit chaque heure les trois jeux de données publics. Il échoue si l’un d’eux est inaccessible, non daté ou vieux de plus de 36 heures.
- L’interface affiche également la date et l’heure et utilise un voyant orange lorsque les données dépassent 36 heures.
- Les anciennes notifications mobiles ont été retirées : leurs routes serveur n’existaient pas. Le script eStaff désinscrit l’ancien service de notification sur les appareils qui l’avaient enregistré.

Une « alerte GitHub Actions » est un contrôle rouge visible dans l’onglet Actions du dépôt et dans les notifications GitHub configurées par le responsable. Elle ne prétend pas être une notification mobile propre au Performance Hub.

## Permissions de l’automatisation

- Porte de Léonard : lecture du dépôt et création d’une identité temporaire uniquement.
- Chaîne eSupport : écriture du contenu pour le commit automatique, identité temporaire pour le relais privé et écriture Pages pour demander la reconstruction.
- Surveillance de fraîcheur : lecture du dépôt uniquement.

Le fichier fixe les permissions par tâche. Aucune permission d’écriture globale n’est accordée à tout le workflow.

## Sources eStaff

Les fichiers compilés de `estaff/assets/` ne constituent jamais la source officielle. Les sources lisibles de l’interface sont conservées dans `estaff-src/` et les ajouts lisibles dans `estaff/assets/esupport-report.js` et ses feuilles de style. Le service privé, ses tests, ses scripts de construction et le Rulebook sont conservés dans le projet source `estaff-cloud-runtime`.

La version de service correspondant à cette procédure est le commit `768d44fd286b00c715110b6de562db1b02441e3b`, publié comme version technique Sites 76. Une nouvelle version doit conserver le code source, les tests et le script de construction avant de remplacer cette référence.

## Retour arrière

En cas de défaut après publication :

1. ne pas modifier les données directement dans les fichiers générés ;
2. identifier le dernier commit public validé ;
3. corriger la source ou l’automatisation sur une branche issue de la branche publique actuelle ;
4. relancer la totalité des tests et audits ;
5. publier un nouveau commit correctif ;
6. vérifier les trois fichiers sur l’adresse publique.

Un retour arrière ne doit jamais réintroduire des identifiants techniques, des données privées ou une ancienne copie du Rulebook.
