"""Mine verified defensive exercises from the official Lichess puzzle export.

Usage: python build-defense-bank.py <lichess_db_puzzle.csv.zst> <output.json>

Only puzzles tagged by Lichess as both ``defensiveMove`` and ``equality`` are
eligible. This intersection is the outcome gate: the move is a precise
defensive resource and the result becomes a draw or balanced position. The
script then classifies the concrete defensive mechanism from board geometry.
"""

from __future__ import annotations

import csv
import io
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import chess
import zstandard


SOURCE_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
TARGETS = {
    "active_defense": 240,
    "defensive_counterplay": 220,
    "exchange_attacker": 180,
    "simplification_to_hold": 180,
    "return_material": 140,
    "defensive_endgame_activity": 220,
}
MIN_POPULARITY = 60
MIN_PLAYS = 50
MIN_RATING = 800
MAX_RATING = 2300
PIECE_VALUE = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0,
}


def canonical_fen(board: chess.Board) -> str:
    return " ".join(board.fen(en_passant="fen").split()[:4])


def source_game_id(game_url: str, puzzle_id: str) -> str:
    match = re.search(r"lichess\.org/([A-Za-z0-9]{8,12})", game_url)
    return match.group(1) if match else f"puzzle-{puzzle_id}"


def position_ply(game_url: str) -> int | None:
    match = re.search(r"#(\d+)", game_url)
    return int(match.group(1)) if match else None


def non_pawn_material(board: chess.Board) -> int:
    return sum(
        PIECE_VALUE[piece.piece_type]
        for piece in board.piece_map().values()
        if piece.piece_type not in (chess.PAWN, chess.KING)
    )


def material_signature(board: chess.Board) -> str:
    values = []
    for color, label in ((chess.WHITE, "w"), (chess.BLACK, "b")):
        values.append(label + "".join(
            f"{chess.piece_symbol(piece_type)}{len(board.pieces(piece_type, color))}"
            for piece_type in (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT, chess.PAWN)
        ))
    return "-".join(values)


def pawn_signature(board: chess.Board) -> str:
    return ".".join(
        f"{'w' if board.color_at(square) else 'b'}{chess.square_name(square)}"
        for square in sorted(board.pieces(chess.PAWN, chess.WHITE) | board.pieces(chess.PAWN, chess.BLACK))
    )


def king_ring(board: chess.Board, color: chess.Color) -> chess.SquareSet:
    king = board.king(color)
    return board.attacks(king) if king is not None else chess.SquareSet()


def classify_mechanism(board: chess.Board, solution: list[chess.Move], themes: set[str]) -> str:
    first = solution[0]
    moving_piece = board.piece_at(first.from_square)
    captured_piece = board.piece_at(first.to_square)
    before_non_pawn = non_pawn_material(board)
    was_in_check = board.is_check()

    after_first = board.copy(stack=False)
    after_first.push(first)
    gives_check = after_first.is_check()

    after_line = board.copy(stack=False)
    for move in solution:
        if move not in after_line.legal_moves:
            break
        after_line.push(move)
    material_reduction = before_non_pawn - non_pawn_material(after_line)

    if "endgame" in themes and moving_piece and moving_piece.piece_type in (chess.ROOK, chess.KING):
        return "defensive_endgame_activity"
    if "sacrifice" in themes and moving_piece and (
        captured_piece is None
        or PIECE_VALUE[moving_piece.piece_type] > PIECE_VALUE[captured_piece.piece_type]
    ):
        return "return_material"
    if captured_piece and moving_piece:
        attacked_king_ring = bool(board.attacks(first.to_square) & king_ring(board, moving_piece.color))
        if was_in_check or attacked_king_ring:
            return "exchange_attacker"
    if material_reduction >= 6:
        return "simplification_to_hold"
    if gives_check:
        return "defensive_counterplay"
    return "active_defense"


def difficulty_bucket(rating: int) -> int:
    return min(4, max(0, (rating - MIN_RATING) // 300))


def choose_diverse(rows: list[dict], target: int) -> list[dict]:
    by_bucket: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        by_bucket[difficulty_bucket(row["difficulty"])].append(row)
    for values in by_bucket.values():
        values.sort(key=lambda item: (-item["qualityScore"], -item["plays"], item["id"]))

    chosen: list[dict] = []
    used_games: Counter[str] = Counter()
    used_signatures: Counter[str] = Counter()
    candidates = [item for bucket in range(5) for item in by_bucket[bucket]]
    cursor = 0
    while candidates and len(chosen) < target:
        candidates.sort(key=lambda item: (
            used_games[item["sourceGameId"]] * 1_000,
            used_signatures[item["planSignature"]] * 200,
            abs(difficulty_bucket(item["difficulty"]) - cursor % 5),
            -item["qualityScore"],
            item["id"],
        ))
        item = candidates.pop(0)
        chosen.append(item)
        used_games[item["sourceGameId"]] += 1
        used_signatures[item["planSignature"]] += 1
        cursor += 1
    return chosen


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Expected input .zst and output .json paths")
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    pools: dict[str, list[dict]] = defaultdict(list)
    seen_fens: set[str] = set()
    seen_game_moments: dict[tuple[str, str], list[int]] = defaultdict(list)
    scanned = 0
    after_theme_gate = 0
    after_quality_gate = 0
    after_technical_gate = 0

    with input_path.open("rb") as compressed:
        reader = zstandard.ZstdDecompressor().stream_reader(compressed)
        rows = csv.reader(io.TextIOWrapper(reader, encoding="utf-8", newline=""))
        next(rows, None)
        for fields in rows:
            scanned += 1
            if len(fields) < 9:
                continue
            puzzle_id, initial_fen, raw_moves, raw_rating, _, raw_popularity, raw_plays, raw_themes, game_url = fields[:9]
            themes = set(raw_themes.split())
            if not {"defensiveMove", "equality"}.issubset(themes):
                continue
            if themes & {"mate", "crushing", "advantage", "opening"}:
                continue
            after_theme_gate += 1
            try:
                rating = int(raw_rating)
                popularity = int(raw_popularity)
                plays = int(raw_plays)
            except ValueError:
                continue
            if not (MIN_RATING <= rating <= MAX_RATING and popularity >= MIN_POPULARITY and plays >= MIN_PLAYS):
                continue
            after_quality_gate += 1
            move_ucis = raw_moves.split()
            if len(move_ucis) < 2 or len(move_ucis) > 10:
                continue
            try:
                initial = chess.Board(initial_fen)
                setup_move = chess.Move.from_uci(move_ucis[0])
                if setup_move not in initial.legal_moves:
                    continue
                initial.push(setup_move)
                board = initial.copy(stack=False)
                solution = []
                for raw_move in move_ucis[1:]:
                    move = chess.Move.from_uci(raw_move)
                    if move not in board.legal_moves:
                        raise ValueError("illegal solution")
                    solution.append(move)
                    board.push(move)
            except (ValueError, AssertionError):
                continue
            exercise_board = initial.copy(stack=False)
            fen_key = canonical_fen(exercise_board)
            if fen_key in seen_fens:
                continue
            game_id = source_game_id(game_url, puzzle_id)
            ply = position_ply(game_url)
            concept = classify_mechanism(exercise_board, solution, themes)
            if ply is not None and any(abs(ply - prior) <= 4 for prior in seen_game_moments[(game_id, concept)]):
                continue
            first = solution[0]
            moving_piece = exercise_board.piece_at(first.from_square)
            captured_piece = exercise_board.piece_at(first.to_square)
            plan_signature = ":".join([
                concept,
                chess.piece_symbol(moving_piece.piece_type) if moving_piece else "?",
                str(chess.square_file(first.from_square) // 2),
                str(chess.square_rank(first.from_square) // 2),
                str(chess.square_file(first.to_square) // 2),
                str(chess.square_rank(first.to_square) // 2),
                chess.piece_symbol(captured_piece.piece_type) if captured_piece else "quiet",
            ])
            after_technical_gate += 1
            seen_fens.add(fen_key)
            if ply is not None:
                seen_game_moments[(game_id, concept)].append(ply)
            pools[concept].append({
                "id": f"lichess-{puzzle_id}",
                "fen": exercise_board.fen(en_passant="fen"),
                "category": "defense",
                "conceptSlug": concept,
                "secondaryConceptSlugs": ["defensive_resource"],
                "classificationConfidence": 0.96,
                "difficulty": rating,
                "source": "lichess",
                "sourceGameId": game_id,
                "sourceUrl": game_url or f"https://lichess.org/training/{puzzle_id}",
                "positionPly": ply,
                "sourceRole": "human_practice",
                "solutionMoves": move_ucis[1:],
                "qualityScore": popularity,
                "popularity": popularity,
                "plays": plays,
                "sourceThemes": sorted(themes),
                "isVerified": True,
                "playerColor": "white" if exercise_board.turn == chess.WHITE else "black",
                "pedagogicalMechanism": concept,
                "planSignature": plan_signature,
                "materialSignature": material_signature(exercise_board),
                "pawnStructureSignature": pawn_signature(exercise_board),
                "keyPieces": [chess.square_name(first.from_square)],
                "keySquares": [chess.square_name(first.to_square)],
            })

    selected = []
    counts = {}
    for concept, target in TARGETS.items():
        chosen = choose_diverse(pools[concept], target)
        selected.extend(chosen)
        counts[concept] = {
            "candidates": len(pools[concept]),
            "active": len(chosen),
            "uniqueGames": len({item["sourceGameId"] for item in chosen}),
        }
    selected.sort(key=lambda item: (item["conceptSlug"], item["difficulty"], item["id"]))
    payload = {
        "source": SOURCE_URL,
        "license": "CC0",
        "generatedAt": "2026-09-02",
        "scannedRows": scanned,
        "filters": {
            "requiredThemes": ["defensiveMove", "equality"],
            "minPopularity": MIN_POPULARITY,
            "minPlays": MIN_PLAYS,
            "rating": [MIN_RATING, MAX_RATING],
        },
        "pipelineReport": {
            "themeGate": after_theme_gate,
            "qualityGate": after_quality_gate,
            "technicalAndDedupeGate": after_technical_gate,
            "concepts": counts,
        },
        "positions": selected,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"scanned": scanned, "active": len(selected), "counts": counts}))


if __name__ == "__main__":
    main()
