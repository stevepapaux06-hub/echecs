"use client";

import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import { ArrowLeft, RotateCcw, Search, Undo2 } from "lucide-react";
import type { EngineEvaluation, PlayerColor } from "@/domain/chess/types";
import { uciLineToSan, uciToSan } from "@/domain/training/feedback";
import type { StockfishClient } from "@/infrastructure/engine/stockfish-client";
import { formatWhiteCentricEvaluation } from "@/infrastructure/engine/uci";
import { Brand } from "./brand";

function evaluationHeight(whiteCp: number): number {
  if (whiteCp >= 90_000) return 100;
  if (whiteCp <= -90_000) return 0;
  return Math.max(4, Math.min(96, 50 + Math.tanh(whiteCp / 500) * 46));
}

export function PositionAnalysisLab({
  initialFen,
  initialOrientation,
  question,
  engine,
  onClose,
}: {
  initialFen: string;
  initialOrientation: PlayerColor;
  question: string;
  engine: StockfishClient;
  onClose: () => void;
}) {
  const [position, setPosition] = useState(initialFen);
  const [history, setHistory] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<PlayerColor>(initialOrientation);
  const [evaluation, setEvaluation] = useState<EngineEvaluation | null>(null);
  const [status, setStatus] = useState("Démarrage du moteur…");
  const [error, setError] = useState<string | null>(null);
  const analysisToken = useRef(0);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const token = ++analysisToken.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setStatus("Analyse en cours…");
        setError(null);
        for (const depth of [8, 11, 13]) {
          try {
            const result = await engine.analyze(position, { depth, multiPv: 3, timeoutMs: 30_000 });
            if (token !== analysisToken.current) return;
            setEvaluation(result);
            setStatus(result.lines.length
              ? `Profondeur ${result.depth} · ${result.lines.length} variantes`
              : "Position terminée");
          } catch {
            if (token !== analysisToken.current) return;
            setError("L’analyse locale a été interrompue. Déplace une pièce ou relance la position.");
            setStatus("Moteur en pause");
            return;
          }
        }
      })();
    }, 220);
    return () => {
      window.clearTimeout(timer);
      analysisToken.current += 1;
    };
  }, [engine, position]);

  const chess = new Chess(position);
  const expectedPieceColor = chess.turn();
  const lineColors = ["rgba(123, 164, 75, .92)", "rgba(52, 122, 151, .82)", "rgba(213, 161, 74, .85)"];
  const options: ChessboardOptions = {
    id: "chesspath-position-analysis",
    position,
    boardOrientation: orientation,
    allowDragging: !chess.isGameOver(),
    allowDrawingArrows: true,
    showNotation: true,
    animationDurationInMs: 140,
    lightSquareStyle: { backgroundColor: "#e5dfc9" },
    darkSquareStyle: { backgroundColor: "#4f7461" },
    boardStyle: { borderRadius: "14px", overflow: "hidden", boxShadow: "0 28px 70px rgba(17, 39, 30, .2)" },
    arrows: (evaluation?.lines ?? []).slice(0, 3).flatMap((line, index) => line.pv[0] ? [{
      startSquare: line.pv[0].slice(0, 2),
      endSquare: line.pv[0].slice(2, 4),
      color: lineColors[index],
    }] : []),
    canDragPiece: ({ piece }) => piece.pieceType.toLowerCase().startsWith(expectedPieceColor),
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      if (!targetSquare) return false;
      const next = new Chess(position);
      try {
        next.move({ from: sourceSquare as Square, to: targetSquare as Square, promotion: "q" });
      } catch {
        return false;
      }
      setHistory((values) => [...values, position]);
      setPosition(next.fen());
      setEvaluation(null);
      return true;
    },
  };

  function reset(): void {
    setPosition(initialFen);
    setHistory([]);
    setEvaluation(null);
  }

  function undo(): void {
    const previous = history.at(-1);
    if (!previous) return;
    setPosition(previous);
    setHistory((values) => values.slice(0, -1));
    setEvaluation(null);
  }

  return (
    <main className="training-shell analysis-lab-shell">
      <nav className="training-nav">
        <Brand />
        <span>Laboratoire d’analyse · Stockfish local</span>
      </nav>
      <section className="analysis-lab">
        <div className="analysis-lab-heading">
          <button type="button" className="text-button back-button" onClick={onClose}><ArrowLeft size={16} /> Retour à l’exercice</button>
          <div><small>À explorer</small><h1>Teste tes idées librement.</h1><p>{question}</p></div>
        </div>
        <div className="analysis-lab-grid">
          <div>
            <div className="analysis-board-wrap">
              <div className="evaluation-bar" aria-label={`Évaluation ${evaluation ? formatWhiteCentricEvaluation(evaluation.whiteCp) : "en cours"}`}>
                <div style={{ height: `${evaluationHeight(evaluation?.whiteCp ?? 0)}%` }} />
                <span>{evaluation ? formatWhiteCentricEvaluation(evaluation.whiteCp) : "…"}</span>
              </div>
              <div className="board-frame"><Chessboard options={options} /></div>
            </div>
            <div className="analysis-controls">
              <button type="button" onClick={undo} disabled={!history.length}><Undo2 size={16} /> Annuler</button>
              <button type="button" onClick={reset}><RotateCcw size={16} /> Position initiale</button>
              <button type="button" onClick={() => setOrientation((value) => value === "white" ? "black" : "white")}>Retourner l’échiquier</button>
            </div>
          </div>
          <aside className="analysis-engine-panel">
            <div className="analysis-engine-status" aria-live="polite"><Search size={18} /><span>{error ?? status}</span></div>
            <div className="analysis-best-move">
              <small>Meilleur coup</small>
              <strong>{evaluation?.bestMove ? uciToSan(position, evaluation.bestMove) : "Analyse…"}</strong>
              <span>Évaluation affichée du point de vue des Blancs : + favorise les Blancs, − favorise les Noirs.</span>
            </div>
            <div className="analysis-lines">
              {(evaluation?.lines ?? []).slice(0, 3).map((line, index) => (
                <div key={`${line.multipv}:${line.pv[0]}`}>
                  <span style={{ backgroundColor: lineColors[index] }}>{index + 1}</span>
                  <p><strong>{line.pv[0] ? uciToSan(position, line.pv[0]) : "—"}</strong>{uciLineToSan(position, line.pv, 8)}</p>
                  <small>{formatWhiteCentricEvaluation(line.whiteCp)}</small>
                </div>
              ))}
              {!evaluation ? <p className="analysis-waiting">Stockfish approfondit progressivement la position sur ton appareil.</p> : null}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
