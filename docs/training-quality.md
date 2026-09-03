# Reference Bank / Training Bank

La banque de références conserve les positions légales, même quand elles ne sont
pas de bons exercices. La banque active applique les contrôles techniques existants,
puis les contrôles non compensables de `human-quality.ts`. Aucun rejet n'est
réactivé pour satisfaire un objectif de volume.

## Contrôles appliqués

- Phase matérielle cohérente ; stratégie entre −1,5 et +1,5 ; conversion avec un
  avantage préexistant entre +0,8 et +3,2, du point de vue du joueur.
- Résultat jouable : WDL Stockfish pour les grandes positions (estimation, pas
  preuve théorique), Syzygy pour les finales à sept pièces ou moins. Pour la
  défense, uniquement résultat Syzygy ou séquence Lichess defensiveMove/equality.
- Pas de prise gratuite, échange de dames, recapture documentée, choix
  quasi forcé ou capture stratégique non justifiée.
- Le coup doit produire le signal causal du concept, pas simplement coexister
  avec une faiblesse ou une colonne.
- Six dimensions stockées de 0 à 2 : contraste, erreur naturelle, transfert,
  changement d'état, difficulté humaine, clarté. Seuil 9/12 et aucune dimension
  nulle. Tout hard fail reste éliminatoire.
- Les alternatives viennent d'une recherche MultiPV ; leur plausibilité humaine
  reste une heuristique (pièce/idée distincte et erreur non catastrophique), pas
  une annotation de coach ni une mesure psychométrique.
- Une stratégie multi-coup doit avoir une deuxième décision liée à la pièce ou
  à la cible, une autre réponse plausible, et un changement structurel vérifié.
  Sinon seul un choix initial suffisamment contrasté peut rester single_move.

## Terminaison

Les finales et plans validés terminent sur `pedagogicalMilestone`, jamais sur
une évaluation élevée ni le compteur de coups. La référence doit réellement
atteindre ce milestone. Les choix alternatifs restent jouables ; le contrôle
structurel s'applique à la position réellement obtenue. Un mat/nul terminal
termine également la tentative, y compris après la réponse adverse.

Une vérification Syzygy du résultat initial ne transforme pas un milestone
structurel ultérieur en « preuve Syzygy ». Les deux éléments sont stockés séparément.
Les anciens exemples Lucena/Philidor restent en référence tant qu'une méthode
complète n'a pas été validée, plutôt que réussir après un déplacement de tour.

## Références et Pattern Engine

`concept-specifications.ts` partage des signaux calculables avec le scan des
parties et le filtre de banque. `reference-profiles.generated.json` contient
la couverture des signaux par des parties différentes et des exemples limites.
Le scanner plafonne les concepts insuffisamment soutenus sous le seuil du
diagnostic. Il ne reconnaît jamais une FEN par recherche dans la banque.

Les positifs/limites du corpus sont des labels automatiques de features, PAS
une vérité terrain indépendante. Le holdout manuel distinct contient six cas
géométriques : trois positifs et trois hard negatives pour colonne, case faible
et activité de tour. Il est exclu du mining et de l'entraînement.
Ce petit ensemble ne permet aucune annonce de précision globale. Les autres
concepts indiquent explicitement une couverture holdout vide.

## Reproduction

Les commandes suivantes utilisent les dépendances existantes, sans API d'IA.
Sous PowerShell, activer seulement le script voulu :

1. `$env:CHESSPATH_BANK_AUDIT='1'`, puis
   `pnpm exec vitest run scripts/audit-training-quality.test.ts`.
   Optionnel : `$env:CHESSPATH_TABLEBASE='1'` autorise les requêtes publiques
   Syzygy. Sans accès ou résultat en cache, la position reste référence.
2. Après mesure des trous seulement, `$env:CHESSPATH_REMINE='1'`, puis
   `pnpm exec vitest run scripts/remine-quality.test.ts`.
   Ce script utilise le PGN déjà téléchargé dans `.tmp-corpus`, pas un nouvel
   import externe. Les candidats ne sont pas marqués vérifiés.
3. Repasser l'audit sur les candidats, puis
   `$env:CHESSPATH_REFERENCE_COMPILE='1'` et
   `pnpm exec vitest run scripts/compile-reference-profiles.test.ts`.
4. Retirer ces variables pour les tests ordinaires : `pnpm test`,
   `pnpm typecheck`, `pnpm lint`, `pnpm build`.

Les recherches moteur et résultats Syzygy sont cachés dans `.tmp-corpus`
(non commité). L'application n'effectue aucun mining ni appel de tablebase
pendant la navigation. Le rapport reproductible est `bank-quality-report.json`.
Les comptes et analyses historiques ne sont pas modifiés. Les copies anciennes
de la banque sont remplacées en mémoire par le catalogue actif. Les positions
personnelles gardent leur pipeline de sélection existant ; cette passe ne
réécrit pas les analyses des utilisateurs.

## Limites assumées

Les détecteurs sont conservateurs : mobilité avec cible, colonne avec entrée,
avant-poste exploitable, pression sur pion isolé, contact de rupture, quelques
méthodes de pions/tours et suppressions de menaces directes. Ils ne prouvent pas
la stratégie générale, les forteresses complexes, la prophylaxie abstraite ou
les sacrifices positionnels. Les finales de fous/cavaliers et certaines méthodes
nommées restent peu ou pas couvertes en Training. La profondeur moteur de
validation est limitée ; les grandes finales n'ont pas de preuve exacte.

Le travail sur les explications détaillées et la stabilisation moteur à plus
grande profondeur demeure distinct de cette passe. Aucune banque finie ne
garantit un entraînement indéfiniment nouveau.
