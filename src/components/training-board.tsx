"use client";

import { useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import { ArrowLeft, ArrowRight, Check, ExternalLink, RotateCcw, Search, Sparkles } from "lucide-react";
import type { TrainingExercise } from "@/domain/chess/types";
import {
  buildTrainingFeedback,
  type TrainingFeedback,
  uciToSan,
} from "@/domain/training/feedback";
import type { StockfishClient } from "@/infrastructure/engine/stockfish-client";
import { Brand } from "./brand";

function formatEvaluation(cp: number): string {
  if (Math.abs(cp) >= 90_000) return cp > 0 ? "gain forcé" : "mat proche";
  const pawns = Math.abs(cp / 100).toFixed(1).replace(".0", "");
  return cp > 20 ? `+${pawns}` : cp < -20 ? `−${pawns}` : "équilibre";
}

function formatLoss(cp: number): string {
  if (cp <= 20) return "≈ 0";
  return `${(cp / 100).toFixed(1).replace(".0", "")} pion${cp >= 150 ? "s" : ""}`;
}

export function TrainingBoard({
  exercises,
  engine,
  onBack,
}: {
  exercises: TrainingExercise[];
  engine: StockfishClient;
  onBack: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState(exercises[0]?.fen ?? new Chess().fen());
  const [feedback, setFeedback] = useState<TrainingFeedback | null>(null);
  const [thinking, setThinking] = useState(false);
  const baselineCache = useRef(new Map<string, Awaited<ReturnType<StockfishClient["analyze"]>>>());
  const attemptToken = useRef(0);
  const exercise = exercises[index];

  function resetBoard(targetIndex = index) {
    attemptToken.current += 1;
    setPosition(exercises[targetIndex].fen);
    setFeedback(null);
    setThinking(false);
  }

  function nextExercise() {
    const next = (index + 1) % exercises.length;
    setIndex(next);
    resetBoard(next);
  }

  async function attemptMove(sourceSquare: string, targetSquare: string | null): Promise<boolean> {
    if (!targetSquare || thinking || feedback) return false;
    const token = ++attemptToken.current;
    const chess = new Chess(position);
    let move;
    try {
      move = chess.move({ from: sourceSquare as Square, to: targetSquare as Square, promotion: "q" });
    } catch {
      return false;
    }

    const fenAfter = chess.fen();
    setPosition(fenAfter);
    setThinking(true);
    try {
      const playedUci = `${move.from}${move.to}${move.promotion ?? ""}`;
      let baseline = baselineCache.current.get(exercise.id);
      if (!baseline) {
        baseline = await engine.analyze(exercise.fen, { depth: 10, multiPv: 3 });
        baselineCache.current.set(exercise.id, baseline);
      }
      const after = await engine.analyze(fenAfter, { depth: 10, multiPv: 1 });
      if (token !== attemptToken.current) return true;

      setFeedback(buildTrainingFeedback({
        fen: exercise.fen,
        playerColor: exercise.playerColor,
        exerciseType: exercise.type,
        playedMove: playedUci,
        playedMoveSan: move.san,
        baseline,
        after,
      }));
      // Feedback compares arrows and candidate moves from the original decision.
      setPosition(exercise.fen);
    } catch {
      if (token !== attemptToken.current) return true;
      setPosition(exercise.fen);
      setFeedback({
        grade: "mistake",
        tone: "warning",
        title: "Le moteur n’a pas répondu",
        body: "Ton coup était légal, mais l’évaluation locale a été interrompue. Tu peux recommencer la position.",
        bestMove: exercise.bestMove,
        bestMoveSan: uciToSan(exercise.fen, exercise.bestMove),
        playedMove: `${move.from}${move.to}${move.promotion ?? ""}`,
        playedMoveSan: move.san,
        bestLineSan: "",
        playedLineSan: "",
        lossCp: 0,
        afterPlayerCp: exercise.baselinePlayerCp,
        candidates: [],
      });
    } finally {
      if (token === attemptToken.current) setThinking(false);
    }
    return true;
  }

  const options: ChessboardOptions = {
    id: `chesspath-training-${exercise.id}`,
    position,
    boardOrientation: exercise.playerColor,
    allowDragging: !thinking && !feedback,
    allowDrawingArrows: true,
    showNotation: true,
    animationDurationInMs: 180,
    lightSquareStyle: { backgroundColor: "#e5dfc9" },
    darkSquareStyle: { backgroundColor: "#4f7461" },
    boardStyle: { borderRadius: "14px", overflow: "hidden", boxShadow: "0 28px 70px rgba(17, 39, 30, .2)" },
    arrows: feedback ? [
      {
        startSquare: feedback.bestMove.slice(0, 2),
        endSquare: feedback.bestMove.slice(2, 4),
        color: "rgba(123, 164, 75, .9)",
      },
      ...(feedback.playedMove !== feedback.bestMove ? [{
        startSquare: feedback.playedMove.slice(0, 2),
        endSquare: feedback.playedMove.slice(2, 4),
        color: feedback.tone === "warning" ? "rgba(189, 107, 66, .85)" : "rgba(213, 161, 74, .85)",
      }] : []),
    ] : [],
    squareStyles: feedback ? {
      [feedback.bestMove.slice(0, 2)]: { boxShadow: "inset 0 0 0 4px rgba(184, 227, 109, .75)" },
      [feedback.bestMove.slice(2, 4)]: { boxShadow: "inset 0 0 0 4px rgba(184, 227, 109, .75)" },
    } : {},
    canDragPiece: ({ piece }) => {
      const expected = exercise.playerColor === "white" ? "w" : "b";
      return !thinking && !feedback && piece.pieceType.toLowerCase().startsWith(expected);
    },
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      void attemptMove(sourceSquare, targetSquare);
      return Boolean(targetSquare);
    },
  };

  return (
    <main className="training-shell" id="top">
      <nav className="training-nav">
        <Brand />
        <div className="exercise-progress"><span style={{ width: `${((index + 1) / exercises.length) * 100}%` }} /></div>
        <span>{index + 1} / {exercises.length}</span>
      </nav>

      <section className="training-layout">
        <div className="board-column">
          <button type="button" className="text-button back-button" onClick={onBack}><ArrowLeft size={16} /> Retour au diagnostic</button>
          <div className="board-frame">
            <Chessboard options={options} />
          </div>
          <div className="board-actions">
            <button type="button" onClick={() => resetBoard()}><RotateCcw size={16} /> Recommencer</button>
            <span>Les coups illégaux sont automatiquement refusés.</span>
          </div>
        </div>

        <aside className="exercise-panel">
          <div className="exercise-type"><span>{exercise.type === "conversion" ? "Conversion" : exercise.type === "defense" ? "Défense" : exercise.type === "endgame" ? "Finale" : "Tes erreurs"}</span><small>Position personnelle</small></div>
          <p className="source-label">{exercise.sourceLabel}</p>
          <h1>{exercise.title}</h1>
          <p className="exercise-prompt">{exercise.prompt}</p>

          {thinking ? (
            <div className="thinking-card" aria-live="polite"><Search size={22} /><div><strong>Stockfish vérifie ton choix…</strong><span>Même profondeur avant/après · 3 lignes candidates.</span></div></div>
          ) : feedback ? (
            <div className={`feedback-card ${feedback.tone}`} aria-live="polite">
              <span className="feedback-icon">{feedback.tone === "warning" ? "!" : <Check size={20} />}</span>
              <div><small>Retour ChessPath</small><h2>{feedback.title}</h2><p>{feedback.body}</p></div>
              <div className="move-comparison">
                <div><span>Ton coup</span><strong>{feedback.playedMoveSan}</strong></div>
                <div><span>Ligne principale</span><strong>{feedback.bestMoveSan}</strong></div>
                <div><span>Perte réelle</span><strong>{formatLoss(feedback.lossCp)}</strong></div>
              </div>
              {feedback.bestLineSan ? (
                <div className="line-comparison">
                  <div><span>Suite de référence</span><p>{feedback.bestLineSan}</p></div>
                  {feedback.playedLineSan ? <div><span>Après ton choix</span><p>{feedback.playedLineSan}</p></div> : null}
                </div>
              ) : null}
              {feedback.candidates.length > 1 ? (
                <div className="candidate-lines">
                  <span>Continuations évaluées</span>
                  <div>
                    {feedback.candidates.map((candidate) => (
                      <p key={candidate.uci}>
                        <strong>{candidate.san}</strong>
                        <small>{formatEvaluation(candidate.playerCp)}</small>
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hint-card"><Sparkles size={20} /><p><strong>Avant de jouer</strong>Liste les échecs, les prises et les menaces de ton adversaire.</p></div>
          )}

          <div className="exercise-footer">
            <a href={exercise.gameUrl} target="_blank" rel="noreferrer">Voir la partie source <ExternalLink size={14} /></a>
            <button type="button" className="primary-button" onClick={nextExercise} disabled={!feedback}>
              Exercice suivant <ArrowRight size={17} />
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}
