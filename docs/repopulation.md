# Non-tactical Training Bank: Decision Contrast v2

Scope: offline bank selection/mining only. UI, Auth, tactical data, runtime engine,
training history and sampler are unchanged. No LLM or paid inference is involved.

## Selection rules

- Strategy captures need a demonstrated useful exchange, not merely a capture.
  Free material, routine recaptures and unmotivated queen exchanges remain excluded.
- The old ±150 cp / +80..320 cp bands are priors. Causal evidence and material /
  counterplay context can justify positions outside those bands; overwhelming and
  lost positions are still excluded.
- Alternatives combine MultiPV and a round-robin over other pieces, natural
  exchanges, checks and competing concepts. Visible unsupported material blunders
  are excluded before comparing evaluations. Moves are grouped by mechanism/target.
- A natural error has no 200 cp upper limit. The contrast must demonstrate an
  objectively costly missed mechanism, a dissipated advantage or a lost holding
  resource. Equivalent reasonable plans do not make a Training exercise.
- Eligible small endings require Syzygy. Different DTZ values with the same WDL
  are **not** a contrast. A bank title such as Opposition gets no automatic pass.
- Defense from games can also use stable Stockfish WDL evidence at depth 16,
  a near-equal root and a separately checked continuation. This is probabilistic
  engine evidence, not a claim of exact tablebase proof.
- A two-decision strategic unit requires linked pieces/targets, a credible reply,
  a second independently sound and contrasting decision, and an observed state
  change. A same-piece preparatory maneuver is allowed only with its verified
  continuation. Arbitrary PV length never creates a lesson.
- Endings retain the existing position-based milestones. Neither elapsed moves
  nor a high evaluation terminates them successfully.

## Reproducible offline workflow

All downloaded corpora, engine results and resumable mining records are in the
ignored `.tmp-corpus/` directory. Ordinary tests perform no mining or network I/O.

1. `scripts/extract-training-corpus.py` streams the PGN export into candidates.
   `CHESSPATH_EXTRACT_ENDINGS=1` includes ending candidates without using the
   source evaluation to exclude high-scoring but potentially delicate wins.
2. Run `scripts/repopulate-training.test.ts` with `CHESSPATH_REPOPULATE=1`.
   `CHESSPATH_MINE_SHARD`, `CHESSPATH_MINE_SHARDS` and optionally
   `CHESSPATH_MINE_PARTITION`, `CHESSPATH_MINE_DOMAIN`, `CHESSPATH_MINE_CORPUS`
   split deterministic work. `CHESSPATH_TABLEBASE=1` enables cached public probes.
3. Run `scripts/compile-repopulation.test.ts` with
   `CHESSPATH_COMPILE_REPOPULATION=1` to produce a report only. Add
   `CHESSPATH_REPOPULATION_PUBLISH=1` to compile the generated bank files.
4. Run the reference-profile compiler and the bank/sequence regression tests.

The compiler applies the existing legality and neighbouring-game gates, then
normalised mirrored geometry and concentration limits (player, pawn structure,
material and plan). Multi-decision strategy lessons are preferred; extra valid
single decisions remain reference-only so the published strategy bank is mostly
plans. Counts in `repopulation-report.json` are **after** these exclusions.

The report separates measured failures from gates not run after an early rejection.
It contains the per-concept funnel and concrete rejected FEN samples. Full rejected
candidates remain locally reproducible; only bounded rejection samples are shipped
with the Reference Bank to avoid unnecessarily enlarging the website.

## Sources and licence

- New real-game positions: [Lichess Broadcast database](https://database.lichess.org/#broadcasts),
  May, June and July 2026 corpora prepared for mining. See the report's actual
  mined-corpus counts for which subsets were examined and accepted.
- Broadcast game data and the derived broadcast position records are attributed
  to Lichess and their individual game URLs, and distributed under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  Changes: extraction, pedagogical classification and engine validation.
  This data licence does not relicense the application source code.
- Existing reference sources are retained, including Lichess Standard / Puzzles
  (CC0) and existing master-game seeds. No tactical-bank expansion is performed.
- Small-position outcomes: [Lichess tablebase API](https://github.com/lichess-org/lila-tablebase).

## Limits

Stockfish depth 10 for ordinary comparisons, depth 16 for independently validated
game defenses; this is not grandmaster-reviewed ground truth. Static human
plausibility and causal detectors remain conservative. A detector's occurrence
count is not a measured accuracy percentage. Rare theoretical methods are not
filled with mirrored clones, and weakly supported concepts stay reference-only.
