"use client";

import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import { ArrowLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw, Search, Undo2 } from "lucide-react";
import type { EngineEvaluation, PlayerColor } from "@/domain/chess/types";
import { uciLineToSan, uciToSan } from "@/domain/training/feedback";
import { legalMoveTargets } from "@/domain/training/interaction";
import type { StockfishClient } from "@/infrastructure/engine/stockfish-client";
import { formatWhiteCentricEvaluation } from "@/infrastructure/engine/uci";
import { Brand } from "./brand";

function evaluationHeight(whiteCp: number): number {
  if (whiteCp >= 90_000) return 100;
  if (whiteCp <= -90_000) return 0;
  return Math.max(4, Math.min(96, 50 + Math.tanh(whiteCp / 500) * 46));
}

type LabPosition = {
  fen: string;
  san?: string;
  uci?: string;
};

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
  const [timeline, setTimeline] = useState<LabPosition[]>([{ fen: initialFen }]);
  const [cursor, setCursor] = useState(0);
  const [orientation, setOrientation] = useState<PlayerColor>(initialOrientation);
  const [evaluation, setEvaluation] = useState<EngineEvaluation | null>(null);
  const [status, setStatus] = useState("Démarrage du moteur…");
  const [error, setError] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const analysisToken = useRef(0);
  const position = timeline[cursor]?.fen ?? initialFen;

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

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      setSelectedSquare(null);
      setEvaluation(null);
      if (event.key === "ArrowLeft") setCursor((value) => Math.max(0, value - 1));
      if (event.key === "ArrowRight") setCursor((value) => Math.min(timeline.length - 1, value + 1));
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [timeline.length]);

  const chess = new Chess(position);
  const expectedPieceColor = chess.turn();
  const legalTargets = selectedSquare ? legalMoveTargets(position, selectedSquare) : [];
  const clickMoveSquares = Object.fromEntries([
    ...(selectedSquare ? [[selectedSquare, { boxShadow: "inset 0 0 0 4px rgba(247, 201, 72, .95)" }]] : []),
    ...legalTargets.map((target) => [target.square, target.capture ? {
      boxShadow: "inset 0 0 0 6px rgba(247, 201, 72, .72)", borderRadius: "10%",
    } : {
      backgroundImage: "radial-gradient(circle, rgba(247, 201, 72, .8) 0 13%, transparent 15%)",
    }]),
  ]);
  const lineColors = ["rgba(123, 164, 75, .92)", "rgba(52, 122, 151, .82)", "rgba(213, 161, 74, .85)"];
  function playMove(sourceSquare: string, targetSquare: string): boolean {
    const next = new Chess(position);
    let move;
    try {
      move = next.move({ from: sourceSquare as Square, to: targetSquare as Square, promotion: "q" });
    } catch {
      return false;
    }
    const entry = { fen: next.fen(), san: move.san, uci: `${move.from}${move.to}${move.promotion ?? ""}` };
    const branch = [...timeline.slice(0, cursor + 1), entry];
    setTimeline(branch);
    setCursor(branch.length - 1);
    setSelectedSquare(null);
    setEvaluation(null);
    return true;
  }

  function handleBoardSquareClick(square: string): void {
    if (chess.isGameOver()) return;
    if (selectedSquare && legalTargets.some((target) => target.square === square)) {
      playMove(selectedSquare, square);
      return;
    }
    const piece = chess.get(square as Square);
    setSelectedSquare(piece?.color === expectedPieceColor ? square : null);
  }

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
    squareStyles: clickMoveSquares,
    arrows: (evaluation?.lines ?? []).slice(0, 3).flatMap((line, index) => line.pv[0] ? [{
      startSquare: line.pv[0].slice(0, 2),
      endSquare: line.pv[0].slice(2, 4),
      color: lineColors[index],
    }] : []),
    canDragPiece: ({ piece }) => piece.pieceType.toLowerCase().startsWith(expectedPieceColor),
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      if (!targetSquare) return false;
      return playMove(sourceSquare, targetSquare);
    },
    onPieceClick: ({ square }) => { if (square) handleBoardSquareClick(square); },
    onSquareClick: ({ square }) => handleBoardSquareClick(square),
  };

  function reset(): void {
    setTimeline([{ fen: initialFen }]);
    setCursor(0);
    setSelectedSquare(null);
    setEvaluation(null);
  }

  function undo(): void {
    if (cursor === 0) return;
    setCursor((value) => value - 1);
    setSelectedSquare(null);
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
              <button type="button" onClick={() => { setCursor(0); setSelectedSquare(null); setEvaluation(null); }} disabled={cursor === 0} aria-label="Début de la ligne"><ChevronsLeft size={16} /> Début</button>
              <button type="button" onClick={undo} disabled={cursor === 0}><Undo2 size={16} /> Précédent</button>
              <button type="button" onClick={() => { setCursor((value) => Math.min(timeline.length - 1, value + 1)); setSelectedSquare(null); setEvaluation(null); }} disabled={cursor >= timeline.length - 1} aria-label="Coup suivant"><ChevronRight size={16} /> Suivant</button>
              <button type="button" onClick={() => { setCursor(timeline.length - 1); setSelectedSquare(null); setEvaluation(null); }} disabled={cursor >= timeline.length - 1} aria-label="Fin de la ligne"><ChevronsRight size={16} /> Fin</button>
              <button type="button" onClick={reset}><RotateCcw size={16} /> Position initiale</button>
              <button type="button" onClick={() => setOrientation((value) => value === "white" ? "black" : "white")}>Retourner l’échiquier</button>
            </div>
            <div className="analysis-move-history" aria-label="Historique de la variante jouée">
              <span>Variante jouée</span>
              <button type="button" className={cursor === 0 ? "active" : ""} onClick={() => { setCursor(0); setSelectedSquare(null); setEvaluation(null); }}>Départ</button>
              {timeline.slice(1).map((entry, index) => (
                <button type="button" className={cursor === index + 1 ? "active" : ""} onClick={() => { setCursor(index + 1); setSelectedSquare(null); setEvaluation(null); }} key={`${index}-${entry.uci}`}>{entry.san}</button>
              ))}
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
