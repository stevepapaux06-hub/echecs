# ChessPath Pilot Concept Development Reference

Status: **DEVELOPMENT REFERENCE**, version `1.0.0-pilot`.

This directory is a conceptual test bench for exactly six pilot concepts:
`outpost`, `open_file`, `improve_worst_piece`, `opposition`,
`restrict_counterplay`, and `exchange_attacker`.

It is not a gold set, an independent holdout, a Training Bank, or evidence that
the current Pattern Engine is accurate.

## Layer boundaries

1. **Verified chess state** supplies board facts only.
2. **Typed concept objects** carry evidence, counterevidence, uncertainty,
   constitutive conditions, and confounders.
3. **Affordances** ask what the property actually enables.
4. **Decision comparison** compares plausible human plans and critical replies.
5. **Pedagogical centrality** separates presence, decision relevance, priority,
   and confidence; abstention is a first-class result.
6. **Training suitability** is recorded separately and never publishes a
   reference position into Training.

## Files

- `types.ts`: versioned schemas for contracts, typed objects, references,
  coverage, abstentions, and the future holdout manifest.
- `pilot-contracts.ts`: the six reviewed concept contracts and anti-shortcut
  policies.
- `source-catalog.ts`: frozen provenance for natural positions already present
  in ChessPath's source corpus. It contains no conceptual labels.
- `development-reference.ts`: 60 pilot annotations: two natural-positive
  hypotheses and eight informative negative/boundary families per concept.
- `pilot-benchmark.ts`: counterfactual pairs, invariance probes, causal flips,
  challenge set, coverage matrix, known gaps, and future holdout manifest.
- `splits.ts`: deterministic leave-one-cluster-out helpers.
- `pilot-reference.test.ts`: integrity, legality, separation, coverage, and
  leakage tests. It never invokes the current Pattern Engine.

## Anti-circularity

The positions were frozen from an existing source corpus before this pilot
annotation module was introduced. Some were originally surfaced by existing
ChessPath rules, so their labels are **not independent**. The module therefore:

- records every item as `development_reference`;
- does not import `detectMovePatterns`, the Pattern Engine, or the Training Bank;
- treats Stockfish or tablebases as future objective checks, not concept-name
  authorities;
- requires a future collection path that does not run ChessPath detectors;
- excludes all game/player/position/structure/counterfactual clusters from the
  future independent holdout.

## Coverage and saturation

Raw position count is not the stopping rule. The matrix tracks mechanism family,
structure, material, side to move, Elo bucket, evaluation state, tactical
competition, neighboring concepts, source, difficulty, negative family,
natural/branch/synthetic status, and agreement status.

The pilot is **not saturated**. `COVERAGE_GAPS` deliberately names missing error
families per concept. The next validation phase should measure new error-family
discovery and stability under leave-one-game/source/structure/counterfactual-
generator-out splits. Saturation can only be considered after independent,
double-blind annotation and segment calibration.

## Counterfactual policy

Natural before/after positions are preferred, followed by legal branches from
the same position. No synthetic FEN was added in this pilot. If controlled
synthetic transformations are added later, they must remain a minority, pass
legality/plausibility/hidden-tactic checks, retain non-causal variables, carry a
transformation cluster, and remain permanently excluded from Training.
