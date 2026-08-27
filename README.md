# ChessPath

**Ton jeu. Tes faiblesses. Ton entraînement.**

ChessPath est un prototype de coach d’échecs adaptatif pour joueurs intermédiaires. Il transforme des parties publiques Chess.com en un diagnostic compréhensible, puis en exercices jouables issus des positions du joueur.

## Ce qui fonctionne dans cette V1

- saisie d’un pseudo Chess.com, sans mot de passe ;
- récupération des parties récentes via la PubAPI officielle ;
- parsing PGN, reconstruction des positions et validation des coups avec `chess.js` ;
- analyse locale dans le navigateur avec Stockfish WebAssembly ;
- métriques explicables : pertes d’évaluation importantes, phase la plus coûteuse, conversion d’avantages et défense ;
- diagnostic priorisé, forces, faiblesses et trois axes de travail ;
- exercices générés à partir des parties du joueur ;
- échiquier responsive avec coups légaux, feedback moteur, recommencement et navigation ;
- gestion des comptes inexistants, comptes sans partie, données insuffisantes et indisponibilité de l’API.

Aucun compte, aucune base de données et aucune API d’IA payante ne sont requis pour cette version.

## Lancer le projet

Prérequis : Node.js 20+ et pnpm.

```bash
pnpm install
pnpm dev
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000).

## Vérifications

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Architecture

```text
src/
├── app/                         interface Next.js et route API
├── components/                  accueil, diagnostic et entraînement
├── domain/
│   ├── chess/                   PGN, phases et analyse des décisions
│   ├── diagnostic/              métriques et priorisation
│   └── training/                génération d’exercices
└── infrastructure/
    ├── chesscom/                client PubAPI
    └── engine/                  client Stockfish Web Worker
```

Le serveur ne calcule pas les évaluations : il récupère et normalise les données publiques. Le navigateur exécute Stockfish localement, puis les fonctions du domaine calculent les métriques et les exercices. Cette séparation permet d’ajouter Lichess, un import PGN, un moteur plus profond ou une persistance sans réécrire l’interface.

## Métriques de la V1

Les seuils sont volontairement lisibles et documentés dans le code :

- **grosse perte d’évaluation** : perte d’au moins 150 centipions sur une décision ;
- **avantage significatif** : au moins +2,00 du point de vue du joueur ;
- **position inférieure** : au plus −1,50 du point de vue du joueur ;
- **phases** : classification par numéro de coup et matériel restant.

Ces mesures ne prétendent pas produire un score universel de « stratégie ». Le diagnostic décrit uniquement ce que les positions analysées permettent de justifier.

## Limites connues

- l’analyse est limitée à huit parties et à un échantillon de décisions pour rester rapide dans le navigateur ;
- la profondeur moteur est adaptée au prototype, pas à une préparation de grand maître ;
- l’import PGN et Lichess sont représentés dans l’architecture mais pas encore exposés ;
- l’historique de progression et la répétition espacée nécessiteront une persistance ultérieure.

Stockfish est distribué sous GPLv3. Sa licence est copiée avec les fichiers du moteur dans `public/engine/`.
