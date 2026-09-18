# Sources du eStaff

Ce dossier conserve les sources lisibles de l’interface eStaff. Le fichier minifié `estaff/assets/estaff.js` est un résultat compilé destiné au navigateur : il ne doit jamais être considéré comme la source de référence ni modifié manuellement.

Répartition officielle :

- `estaff-src/Supervision.tsx` et `estaff-src/supervision.module.css` : interface de supervision Oscar ;
- `estaff/assets/esupport-report.js` et les feuilles de style non minifiées : comportements complémentaires actuellement chargés par l’interface publique ;
- projet `estaff-cloud-runtime` : sources complètes du service privé, composants de connexion, contrôles d’accès, tests et scripts de construction ;
- `estaff-cloud-runtime/docs/estaff/LYKOS_ESTAFF_RULEBOOK.md` : unique Rulebook officiel.

Le service source actuellement publié correspond au commit `104bd80155a5c6f46fda944d0b99e57ea1305cc9` et à la version technique Sites 74. Toute prochaine compilation doit conserver sa source et ses tests avant publication.
