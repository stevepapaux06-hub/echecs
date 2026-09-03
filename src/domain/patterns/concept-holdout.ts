/** Small, manually specified geometric holdout. Labels were written from the
 * stated mechanism, not produced by detectMovePatterns. These positions are
 * excluded from mining and are not training puzzles. This is qualitative
 * regression evidence, not a population estimate of detector precision. */
export const CONCEPT_HOLDOUT = [
  { id: "file-with-target", concept: "open_file", positive: true, move: "a1d1",
    fen: "2r2rk1/pp3ppp/3p1n2/2p1p3/4P3/2N2N2/PP3PPP/R4RK1 w - - 0 20",
    reason: "The rook gains a semi-open d-file directed at the fixed d6 pawn." },
  { id: "file-no-new-role", concept: "open_file", positive: false, move: "d1d2",
    fen: "2r2rk1/pp3ppp/3p1n2/2p1p3/4P3/2N2N2/PP3PPP/3R1RK1 w - - 0 20",
    reason: "Same file, same target and no new entry: the move does not teach a new file decision." },
  { id: "weak-square-with-target", concept: "weak_square", positive: true, move: "f4d5",
    fen: "6k1/p5pp/1q6/8/5N2/8/6PP/3R3K w - - 0 25",
    reason: "A supported knight can use d5 to attack b6, with no enemy c/e pawn able to chase it." },
  { id: "weak-square-no-target", concept: "weak_square", positive: false, move: "f4d5",
    fen: "6k1/p5pp/8/8/5N2/8/6PP/3R3K w - - 0 25",
    reason: "The nominal weak square has no target or new consequence." },
  { id: "rook-new-target", concept: "rook_activity", positive: true, move: "a2d2",
    fen: "7r/6k1/3p3p/8/6P1/P6P/R7/1K6 w - - 0 36",
    reason: "The passive rook leaves its own a3 pawn and gains pressure on d6." },
  { id: "rook-cosmetic", concept: "rook_activity", positive: false, move: "a1b1",
    fen: "7r/6k1/7p/8/6P1/7P/6K1/R7 w - - 0 36",
    reason: "A rook merely changes file without a material activity increase." },
] as const;
