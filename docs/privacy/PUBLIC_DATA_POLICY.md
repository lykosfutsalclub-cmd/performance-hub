# Politique des données publiques du Performance Hub

Version : 1.1 — 18 septembre 2026

## Objet

Le Performance Hub publie des statistiques sportives afin de présenter l’activité et les performances du Lykos FC. La publication doit rester limitée aux informations réellement utiles à cet objectif.

## Données admises après autorisation vérifiée

- nom d’affichage du joueur ;
- participation et statistiques sportives ;
- distinctions et résultats sportifs ;
- poste, numéro et ancienneté sportive lorsqu’ils sont utiles à la lecture.

## Données exclues du site public

- identifiants SportEasy, identifiants d’événements ou de saisons fournis par un service externe ;
- mot de passe, jeton, cookie ou information de session ;
- adresse, téléphone, courriel ou autre coordonnée privée ;
- date de naissance complète ;
- information médicale, administrative ou financière ;
- information relative à un mineur sans cadre renforcé et autorisation adaptée.

Les identifiants nécessaires au fonctionnement de l’interface sont créés par le Performance Hub à partir d’un libellé public. Ils ne permettent pas d’accéder au compte SportEasy du joueur.

## Autorisation et retrait

Une preuve d’autorisation doit être conservée dans le registre privé du club avant de qualifier une publication nominative d’autorisée. Le registre ne doit pas être publié sur GitHub.

Une personne concernée peut demander une correction, une limitation ou un retrait en écrivant à `lykosfutsalclub@gmail.com`. La demande est vérifiée par le responsable du club avant modification.

## Contrôle avant publication

Chaque publication automatisée doit vérifier :

1. que les audits sportifs réussissent ;
2. que les identifiants techniques externes ne figurent pas dans les fichiers publics ;
3. que la date de génération est présente ;
4. qu’aucune nouvelle catégorie de donnée personnelle n’est ajoutée sans décision et autorisation adaptées.

La synchronisation nominative automatique reste désactivée tant que la variable privée de gouvernance `PUBLIC_INDIVIDUAL_DATA_AUTHORIZED` ne vaut pas `verified`. Cette activation ne doit intervenir qu’après contrôle du registre privé par le responsable du club.

## Règle de sécurité proportionnée

Une alerte de sécurité non critique est journalisée, attribuée et corrigée, mais ne bloque pas la publication de données sportives déjà autorisées et validées. Oscar peut déclencher immédiatement une synchronisation SportEasy en lecture seule vers le Performance Hub officiel.

Le blocage de sécurité est réservé à une divulgation détectée ou raisonnablement plausible de données critiques : coordonnées personnelles privées, adresse postale, données bancaires ou de paiement, données médicales, administratives ou financières confidentielles, secrets d'authentification, données non autorisées concernant un mineur, ou compromission active susceptible d'altérer la publication. L'adresse institutionnelle publiée par le club comme contact officiel n'est pas une coordonnée privée.

Cette règle ne contourne pas les audits de justesse sportive, la preuve d'autorisation nominative, le contrôle après publication ou le retour arrière en cas d'échec.

## État actuel de l’autorisation

Le 18 septembre 2026, Fabien, agissant en qualité de président, directeur sportif et coach du Lykos FC, a confirmé que le club est autorisé à publier les noms et statistiques individuelles actuellement présents dans le Performance Hub.

Cette confirmation couvre uniquement les données sportives déjà présentes et admises par cette politique. Elle n’autorise pas l’ajout futur de coordonnées privées, dates de naissance complètes, données médicales, administratives ou financières. Les justificatifs détaillés et les éventuelles demandes de retrait restent conservés dans le registre privé du club.
