# ChessPath V2

**Ton jeu. Tes faiblesses. Ton entraînement.**

ChessPath transforme les parties d’un joueur en diagnostic explicable, puis en exercices personnalisés. La V2 conserve l’identité visuelle de la V1 tout en ajoutant une vraie boucle durable : analyser, diagnostiquer, entraîner, mesurer et adapter.

## Fonctionnalités disponibles

- analyse de 1 à 100 parties publiques Chess.com, sans mot de passe ;
- filtres Rapid, Blitz, Bullet, Daily ou toutes cadences, avec parcours des archives jusqu’au volume demandé ;
- import d’un fichier `.pgn` ou de plusieurs PGN collés, y compris les parties OTB ;
- évaluation Stockfish 18 Lite WebAssembly, calculée dans le navigateur et normalisée du point de vue du joueur ;
- seconde passe moteur sur les positions les plus critiques et variantes MultiPV ;
- diagnostic fondé sur des exemples observés : tactique, stratégie, ouvertures, finales, conversion et défense ;
- feedback d’exercice avec qualité du coup, explication, variantes navigables, flèches de coups et flèches de plan ;
- séances à un coup, tactiques multi-coups et finales/conversions jouées contre le moteur ;
- nouvelle position pédagogique sur le même concept après une erreur personnelle ;
- profil permanent Supabase : parties dédupliquées, analyses historiques, faiblesses, exercices, tentatives et instantanés de progression ;
- navigation Accueil, Analyser, S’entraîner, Progression et Profil.

Le moteur et les règles constituent le cœur du produit. Aucune API d’IA générative payante n’est nécessaire.

## Lancer le projet

Prérequis : Node.js 20+ et pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Renseigner dans `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

La migration de référence est dans `supabase/migrations/`. Les tables publiques utilisent toutes Row Level Security : un utilisateur authentifié ne peut lire ou modifier que ses propres données. Aucune clé `service_role` n’est exposée au navigateur.

## Vérifications

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Les tests moteur couvrent notamment les positions égales, les avantages blancs et noirs, les mats des deux couleurs, la compensation, un gain positionnel technique et chaque coup de la bibliothèque pédagogique.

## Architecture

```text
src/
├── app/                         interface Next.js et route Chess.com
├── components/                  accueil, analyse, profil, progrès, entraînement
├── domain/
│   ├── chess/                   types, PGN, phases, analyse moteur
│   ├── diagnostic/              métriques, thèmes récurrents, confiance
│   └── training/                exercices personnels, bibliothèque, feedback
└── infrastructure/
    ├── chesscom/                PubAPI et parcours des archives
    ├── engine/                  Stockfish Worker, UCI, MultiPV
    └── supabase/                authentification et dépôt persistant
```

Stockfish travaille dans un Web Worker isolé. Le domaine échiquéen ne dépend ni de React ni de Supabase, ce qui permet de faire évoluer le diagnostic ou d’ajouter Lichess sans réécrire l’interface.

## Méthode et limites honnêtes

- une grosse perte correspond actuellement à au moins 150 centipions ;
- le volume demandé est respecté côté récupération, mais le budget de profondeur et le nombre de décisions par partie s’adaptent pour que 100 parties restent utilisables dans un navigateur ;
- le diagnostic affiche un niveau de confiance et ne transforme pas un petit échantillon en vérité générale ;
- les nouveaux exercices thématiques proviennent aujourd’hui d’une bibliothèque pédagogique validée par Stockfish ; leur génération procédurale à grande échelle reste une étape future ;
- le statut « maîtrisée » exige à la fois une disparition mesurée du problème dans de nouvelles parties et plusieurs réussites à l’entraînement ;
- l’analyse locale n’est pas destinée à remplacer une préparation de grand maître à très grande profondeur.

Stockfish est distribué sous GPLv3. Sa licence est fournie avec les fichiers du moteur dans `public/engine/`.
