"""Build a small deterministic ChessPath bank from the official Lichess export.

Usage: python build-lichess-bank.py <lichess_db_puzzle.csv.zst> <output.json>
The build helper requires the `zstandard` and `python-chess` packages. They are
not runtime dependencies of ChessPath.
"""

from __future__ import annotations

import csv
import io
import json
import sys
from collections import defaultdict
from pathlib import Path

import chess
import zstandard


SOURCE_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
TARGET_PER_CONCEPT = 360
MIN_POPULARITY = 85
MIN_PLAYS = 100
MIN_RATING = 800
MAX_RATING = 2299

THEME_TO_CONCEPT = {
    "fork": "fork",
    "pin": "pin",
    "skewer": "skewer",
    "hangingPiece": "loose_piece",
    "capturingDefender": "remove_defender",
    "defensiveMove": "opponent_threat",
    "advancedPawn": "passed_pawn",
}

CONCEPT_CATEGORY = {
    "fork": "tactic",
    "pin": "tactic",
    "skewer": "tactic",
    "loose_piece": "tactic",
    "remove_defender": "tactic",
    "opponent_threat": "tactic",
    "passed_pawn": "endgame",
}


def rating_bucket(rating: int) -> int:
    return min(4, max(0, (rating - 800) // 300))


def choose_balanced(rows: list[dict]) -> list[dict]:
    by_bucket: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        by_bucket[rating_bucket(row["difficulty"])].append(row)
    for values in by_bucket.values():
        values.sort(key=lambda item: (-item["qualityScore"], -item["plays"], item["id"]))

    selected: list[dict] = []
    per_bucket = TARGET_PER_CONCEPT // 5
    for bucket in range(5):
        selected.extend(by_bucket[bucket][:per_bucket])
    selected_ids = {item["id"] for item in selected}
    remaining = sorted(
        (item for item in rows if item["id"] not in selected_ids),
        key=lambda item: (-item["qualityScore"], -item["plays"], item["id"]),
    )
    selected.extend(remaining[: max(0, TARGET_PER_CONCEPT - len(selected))])
    return selected[:TARGET_PER_CONCEPT]


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Expected input .zst and output .json paths")
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    candidates: dict[str, list[dict]] = defaultdict(list)
    seen_fens: set[str] = set()
    scanned = 0

    with input_path.open("rb") as compressed:
        reader = zstandard.ZstdDecompressor().stream_reader(compressed)
        text = io.TextIOWrapper(reader, encoding="utf-8", newline="")
        rows = csv.reader(text)
        next(rows, None)
        try:
            for fields in rows:
                scanned += 1
                if len(fields) < 9:
                    continue
                puzzle_id, initial_fen, raw_moves, raw_rating, _, raw_popularity, raw_plays, raw_themes, game_url = fields[:9]
                themes = raw_themes.split()
                mapped = list(dict.fromkeys(THEME_TO_CONCEPT[theme] for theme in themes if theme in THEME_TO_CONCEPT))
                if not mapped:
                    continue
                try:
                    rating = int(raw_rating)
                    popularity = int(raw_popularity)
                    plays = int(raw_plays)
                except ValueError:
                    continue
                if not (MIN_RATING <= rating <= MAX_RATING and popularity >= MIN_POPULARITY and plays >= MIN_PLAYS):
                    continue
                moves = raw_moves.split()
                if len(moves) < 2:
                    continue
                concept = min(mapped, key=lambda slug: len(candidates[slug]))
                if len(candidates[concept]) >= TARGET_PER_CONCEPT * 3:
                    continue
                try:
                    board = chess.Board(initial_fen)
                    board.push_uci(moves[0])
                    fen = board.fen(en_passant="fen")
                    for move in moves[1:]:
                        if chess.Move.from_uci(move) not in board.legal_moves:
                            raise ValueError("illegal solution")
                        board.push_uci(move)
                except (ValueError, AssertionError):
                    continue
                if fen in seen_fens:
                    continue
                seen_fens.add(fen)
                candidates[concept].append({
                    "id": f"lichess-{puzzle_id}",
                    "fen": fen,
                    "category": CONCEPT_CATEGORY[concept],
                    "conceptSlug": concept,
                    "secondaryConceptSlug": mapped[1] if len(mapped) > 1 else None,
                    "difficulty": rating,
                    "source": "lichess",
                    "sourceGameId": puzzle_id,
                    "sourceUrl": game_url or f"https://lichess.org/training/{puzzle_id}",
                    "solutionMoves": moves[1:],
                    "qualityScore": popularity,
                    "popularity": popularity,
                    "plays": plays,
                    "sourceThemes": themes,
                    "isVerified": True,
                    "playerColor": "white" if chess.Board(fen).turn == chess.WHITE else "black",
                })
                if all(len(candidates[slug]) >= TARGET_PER_CONCEPT * 3 for slug in THEME_TO_CONCEPT.values()):
                    break
        except zstandard.ZstdError:
            # A deliberately ranged download can end before the full frame.
            pass

    positions = []
    for concept in THEME_TO_CONCEPT.values():
        positions.extend(choose_balanced(candidates[concept]))
    positions.sort(key=lambda item: (item["conceptSlug"], item["difficulty"], item["id"]))
    payload = {
        "source": SOURCE_URL,
        "license": "CC0",
        "generatedAt": "2026-08-31",
        "scannedRows": scanned,
        "filters": {
            "minPopularity": MIN_POPULARITY,
            "minPlays": MIN_PLAYS,
            "rating": [MIN_RATING, MAX_RATING],
        },
        "positions": positions,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    counts = {concept: sum(item["conceptSlug"] == concept for item in positions) for concept in THEME_TO_CONCEPT.values()}
    print(json.dumps({"scanned": scanned, "total": len(positions), "counts": counts}))


if __name__ == "__main__":
    main()
