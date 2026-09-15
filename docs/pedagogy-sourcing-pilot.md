# ChessPath — sourcing pédagogique pilote

Ce document conserve les décisions reproductibles du pilote. Il ne constitue
pas une autorisation d'activer automatiquement une position issue d'une source.

| Source | Population / Elo | Format et volume examiné | Forces | Faiblesses / contraintes | Décision |
| --- | --- | --- | --- | --- | --- |
| [Lichess standard database](https://database.lichess.org/standard/) — janvier 2013 | Parties publiques notées, Elo et cadence disponibles; pilote surtout 1200–1800 | PGN local; 46 candidats déjà qualifiés réexaminés | Provenance directe, reconstruction PGN, décisions humaines, CC0 | Le mois ancien est très concentré autour de 1500 et produit 0 candidat 800–1200 dans ce lot | Utiliser pour conversion 1200–1800 et positions modèles |
| [datasnaek/chess](https://www.kaggle.com/datasets/datasnaek/chess), miroir [TidyTuesday](https://github.com/rfordatascience/tidytuesday/tree/main/data/2024/2024-10-01) | 20 058 parties Lichess; 531 notées avec les deux joueurs 800–1200, 361 éligibles après cadence/écart Elo | CSV SAN; 25 moments prometteurs examinés par Stockfish | Petit corpus CC0, vrais pseudos/Elo, bon test rapide de représentativité | Pas de PGN complet, date/cadence normalisées par le jeu de données; 1 candidat calme sérieux mais 0/25 actif, car un plan concurrent équivalent restait inexpliqué | Conserver le candidat en challenge/reference et arrêter le scaling avant un meilleur préfiltre |
| [Lichess puzzle database](https://database.lichess.org/#puzzles) | Positions issues de parties, rating puzzle; Elo joueur d'origine non garanti | Banque locale existante | Excellente vérité tactique et ressources défensives forcing | Biais tactique; mauvaise source pour la stratégie calme | Conserver pour tactique/défense forcing, pas pour stratégie calme |
| [Lichess tablebase API](https://lichess.org/api#tag/Tablebase/operation/tablebaseStandard) | Finales jusqu'à sept pièces | Trois références techniques conservées | Vérité WDL/DTZ déterministe | Ne prouve jamais à elle seule le label Lucena/Philidor/opposition; API limitée | Référence technique, activation seulement avec méthode structurelle démontrée |
| [FICS Games Database](https://www.ficsgames.org/download.html) | Parties standard/blitz/lightning avec ratings et temps | Source évaluée, non ingérée | Très gros volume amateur et métadonnées utiles | Licence de réutilisation non suffisamment claire pour ce sprint | Éviter tant que la licence n'est pas clarifiée |
| Livres, cours et articles | Variable | Aucun contenu copié | Bons repères pour taxonomie et mécanismes classiques | Droit d'auteur et biais de sélection | Référence conceptuelle seulement; aucune copie de texte/banque |

## Contrat de décision

Le funnel est strictement : provenance → reconstruction → légalité → moteur ou
tablebase → tactique cachée → concept prioritaire → plans concurrents → contraste
humain → explication causale → déduplication → `ACTIVE_TRAINING`,
`CHALLENGE_REFERENCE`, `QUARANTINE` ou `REJECT`.

`sourceAverageRating` décrit les joueurs de la partie. `difficulty` décrit la
difficulté pédagogique estimée. Les deux valeurs ne sont jamais substituées.

Les fichiers `pedagogy-pilot.generated.json` et `bank-contrast-challenge.ts`
gardent respectivement le résultat du pilote et les cas adversariaux. Seul le
tableau `activeTraining` entre dans la banque utilisateur.
