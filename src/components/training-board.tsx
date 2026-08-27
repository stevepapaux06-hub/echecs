"use client";

import { useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import { ArrowLeft, ArrowRight, Check, ExternalLink, RotateCcw, Search, Sparkles } from "lucide-react";
import type { TrainingExercise } from "@/domain/chess/types";
import type { StockfishClient } from "@/infrastructure/engine/stockfish-client";
import { Brand } from "./brand";

type Feedback = {
  tone: "great" | "good" | "warning";
  title: string;
  body: string;
  bestMoveSan: string;
  playedMoveSan: string;
  afterPlayerCp: number;
};

function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.slice(4, 5) || "q",
    });
    return move.san;
  } catch {
    return uci;
  }
}

function formatEvaluation(cp: number): string {
  if (Math.abs(cp) >= 9_000) return cp > 0 ? "gain forcé" : "mat proche";
  const pawns = Math.abs(cp / 100).toFixed(1).replace(".0", "");
  return cp > 20 ? `+${pawns}` : cp < -20 ? `−${pawns}` : "équilibre";
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
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [thinking, setThinking] = useState(false);
  const exercise = exercises[index];

  function resetBoard(targetIndex = index) {
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
      const evaluation = await engine.evaluate(fenAfter, 9);
      const afterPlayerCp = exercise.playerColor === "white" ? evaluation.whiteCp : -evaluation.whiteCp;
      const loss = Math.max(0, exercise.baselinePlayerCp - afterPlayerCp);
      const playedUci = `${move.from}${move.to}${move.promotion ?? ""}`;
      const exact = playedUci === exercise.bestMove;
      const bestMoveSan = uciToSan(exercise.fen, exercise.bestMove);

      if (exact || loss <= 45) {
        setFeedback({
          tone: "great",
          title: exact ? "Excellent — choix du moteur" : "Très bon choix",
          body: exact
            ? "Tu as trouvé la continuation principale de Stockfish. La position garde tout son potentiel."
            : "Ton coup n’est pas le premier choix, mais il conserve pratiquement toute la valeur de la position.",
          bestMoveSan,
          playedMoveSan: move.san,
          afterPlayerCp,
        });
      } else if (loss <= 140) {
        setFeedback({
          tone: "good",
          title: "Jouable, mais moins précis",
          body: "L’idée reste viable, mais elle cède une partie de l’avantage. Compare les réponses forcing après ton coup et après le choix du moteur.",
          bestMoveSan,
          playedMoveSan: move.san,
          afterPlayerCp,
        });
      } else {
        setFeedback({
          tone: "warning",
          title: "L’évaluation chute nettement",
          body: exercise.type === "conversion"
            ? "Ce coup relâche la pression et permet à l’adversaire de revenir. En position gagnante, cherche d’abord le moyen de limiter son contre-jeu."
            : "Une ressource adverse devient possible après ce coup. Reviens à la position et commence par les réponses forcing de l’adversaire.",
          bestMoveSan,
          playedMoveSan: move.san,
          afterPlayerCp,
        });
      }
    } catch {
      setPosition(exercise.fen);
      setFeedback({
        tone: "warning",
        title: "Le moteur n’a pas répondu",
        body: "Ton coup était légal, mais l’évaluation locale a été interrompue. Tu peux recommencer la position.",
        bestMoveSan: uciToSan(exercise.fen, exercise.bestMove),
        playedMoveSan: move.san,
        afterPlayerCp: exercise.baselinePlayerCp,
      });
    } finally {
      setThinking(false);
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
    squareStyles: feedback ? {
      [exercise.bestMove.slice(0, 2)]: { boxShadow: "inset 0 0 0 4px rgba(184, 227, 109, .75)" },
      [exercise.bestMove.slice(2, 4)]: { boxShadow: "inset 0 0 0 4px rgba(184, 227, 109, .75)" },
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
            <div className="thinking-card" aria-live="polite"><Search size={22} /><div><strong>Stockfish vérifie ton choix…</strong><span>Le moteur tourne localement.</span></div></div>
          ) : feedback ? (
            <div className={`feedback-card ${feedback.tone}`} aria-live="polite">
              <span className="feedback-icon">{feedback.tone === "warning" ? "!" : <Check size={20} />}</span>
              <div><small>Retour ChessPath</small><h2>{feedback.title}</h2><p>{feedback.body}</p></div>
              <div className="move-comparison">
                <div><span>Ton coup</span><strong>{feedback.playedMoveSan}</strong></div>
                <div><span>Choix moteur</span><strong>{feedback.bestMoveSan}</strong></div>
                <div><span>Après ton coup</span><strong>{formatEvaluation(feedback.afterPlayerCp)}</strong></div>
              </div>
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
