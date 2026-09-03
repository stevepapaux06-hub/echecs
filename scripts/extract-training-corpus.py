"""Stream public PGN into offline mining input; no generated board positions.
Broadcast derivatives retain CC-BY-SA provenance. Run separately from tests.
"""
import sys, io, json, hashlib, re, os
from pathlib import Path
sys.path.insert(0, str(Path('.tmp-corpus/python-packages').resolve()))
import chess
import chess.pgn
import zstandard

sources = sys.argv[1:] or [str(p) for p in sorted(Path('.tmp-corpus').glob('lichess_db_broadcast_*.pgn.zst'))]
endings_only = os.environ.get('CHESSPATH_EXTRACT_ENDINGS') == '1'
for filename in sources:
    path = Path(filename)
    dest = path.with_suffix('.endings.candidates.jsonl' if endings_only else '.candidates.jsonl')
    if dest.exists() and dest.with_suffix('.report.json').exists():
        print('Cached', dest, flush=True)
        continue
    raw = path.open('rb')
    stream = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(raw), encoding='utf-8', errors='replace') if path.suffix == '.zst' else io.TextIOWrapper(raw, encoding='utf-8', errors='replace')
    counts = dict(games=0, eligible=0, positions=0, invalid=0)
    players, ids = set(), set()
    with dest.open('w', encoding='utf-8') as out:
        while True:
            game = chess.pgn.read_game(stream)
            if game is None: break
            counts['games'] += 1
            h = game.headers
            if game.errors or h.get('Variant', 'Standard') not in ('Standard', 'From Position'):
                counts['invalid'] += 1
                continue
            try: rating = (int(h.get('WhiteElo',0)) + int(h.get('BlackElo',0))) / 2
            except ValueError: continue
            if not 1800 <= rating <= 2850: continue
            tc = h.get('TimeControl','?')
            numeric = re.match(r'^(?:\d+/)?(\d+)(?:[+:]|$)',tc)
            if numeric and int(numeric[1]) < 180: continue
            if not numeric and ('bullet' in tc.lower() or ('broadcast' not in path.name)): continue
            nodes = list(game.mainline())
            if len(nodes) < 40: continue
            game_id = hashlib.sha256((' '.join(n.move.uci() for n in nodes)).encode()).hexdigest()[:20]
            if game_id in ids: continue
            ids.add(game_id); counts['eligible'] += 1
            players.update([h.get('White','?'),h.get('Black','?')])
            board = game.board(); previous = None
            for ply, node in enumerate(nodes):
                move = node.move
                count = len(board.piece_map())
                nonpawns = sum({chess.KNIGHT:320,chess.BISHOP:330,chess.ROOK:500,chess.QUEEN:900}.get(p.piece_type,0) for p in board.piece_map().values()) if endings_only else 99999
                cp = node.parent.eval()
                cp = cp.pov(board.turn).score() if cp is not None else None
                # Source evaluation only narrows work, never activates a lesson.
                sample = ply >= 24 and ply <= 220 and (ply % (3 if count <= 10 or endings_only else 6) == 0)
                if endings_only: sample = sample and nonpawns <= 2600
                if sample and (endings_only or cp is None or -170 <= cp <= 420) and not move.promotion and board.legal_moves.count() >= 4:
                    data = dict(fen=board.fen(), move=move.uci(), previous=previous, game=game_id,
                        ply=ply+1, players=[h.get('White','?'),h.get('Black','?')], rating=rating,
                        source='lichess_broadcast' if 'broadcast' in path.name else 'lichess_standard',
                        corpus=path.name, url=h.get('GameURL',h.get('Site','')), date=h.get('UTCDate',h.get('Date','?')),
                        sourceCp=cp, humanLine=[n.move.uci() for n in nodes[ply:ply+11]])
                    out.write(json.dumps(data, ensure_ascii=False,separators=(',',':'))+'\n'); counts['positions'] += 1
                board.push(move); previous = move.uci()
            if counts['games'] % 5000 == 0: print(path.name, counts, flush=True)
    counts.update(source=path.name, uniqueGames=len(ids), uniquePlayers=len(players),
                  license='CC-BY-SA-4.0' if 'broadcast' in path.name else 'CC0')
    dest.with_suffix('.report.json').write_text(json.dumps(counts,indent=2),encoding='utf-8')
    print(counts, flush=True)
