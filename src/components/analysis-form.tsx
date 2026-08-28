"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, CircleAlert, FileUp } from "lucide-react";
import type { GameCadence } from "@/domain/chess/types";

export type AnalysisRequest =
  | { source: "chesscom"; username: string; count: number; cadence: GameCadence }
  | { source: "pgn"; playerName: string; count: number; pgn: string };

function validCount(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 100;
}

export function AnalysisForm({
  onAnalyze,
  error,
  compact = false,
  defaultUsername = "",
}: {
  onAnalyze: (request: AnalysisRequest) => void;
  error: string | null;
  compact?: boolean;
  defaultUsername?: string;
}) {
  const [source, setSource] = useState<"chesscom" | "pgn">("chesscom");
  const [username, setUsername] = useState(defaultUsername);
  const [playerName, setPlayerName] = useState(defaultUsername);
  const [count, setCount] = useState(10);
  const [cadence, setCadence] = useState<GameCadence>("all");
  const [pgn, setPgn] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!validCount(count)) {
      setLocalError("Choisis un nombre entier entre 1 et 100.");
      return;
    }
    setLocalError(null);
    if (source === "chesscom") {
      onAnalyze({ source, username: username.trim(), count, cadence });
    } else {
      onAnalyze({ source, playerName: playerName.trim(), count, pgn });
    }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pgn")) {
      setLocalError("Choisis un fichier avec l’extension .pgn.");
      return;
    }
    const text = await file.text();
    if (!text.trim()) {
      setLocalError("Ce fichier PGN est vide.");
      return;
    }
    setPgn(text);
    setLocalError(null);
  }

  return (
    <form
      className={`analysis-form v2-analysis-form ${compact ? "compact" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="source-tabs" role="tablist" aria-label="Source des parties">
        <button type="button" className={source === "chesscom" ? "active" : ""} onClick={() => setSource("chesscom")}>Chess.com</button>
        <button type="button" className={source === "pgn" ? "active" : ""} onClick={() => setSource("pgn")}>Importer un PGN</button>
      </div>

      {source === "chesscom" ? (
        <>
          <label htmlFor="username">Pseudo Chess.com</label>
          <div className="input-row">
            <span className="platform-badge" aria-hidden="true">C</span>
            <input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="ex. hikaru"
              autoComplete="off"
              required
              minLength={2}
            />
          </div>
        </>
      ) : (
        <div className="pgn-fields">
          <label htmlFor="player-name">Ton nom dans le PGN</label>
          <input
            id="player-name"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="ex. Steve Papaux"
            required
          />
          <div className="pgn-upload-row">
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept=".pgn,text/plain"
              onChange={(event) => void loadFile(event.target.files?.[0])}
            />
            <button type="button" className="file-button" onClick={() => fileRef.current?.click()}>
              <FileUp size={16} /> Choisir un fichier .pgn
            </button>
            <span>{pgn ? `${pgn.length.toLocaleString("fr-CH")} caractères chargés` : "ou colle le texte ci-dessous"}</span>
          </div>
          <textarea
            value={pgn}
            onChange={(event) => setPgn(event.target.value)}
            placeholder={'[Event "Partie"]\n[White "Steve"]\n[Black "Adversaire"]\n\n1. e4 e5 ...'}
            rows={compact ? 5 : 7}
            required
          />
        </div>
      )}

      <div className="analysis-options">
        <label>
          <span>Nombre de parties à analyser</span>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            required
          />
          <small>Entre 1 et 100, au choix.</small>
        </label>
        {source === "chesscom" ? (
          <label>
            <span>Cadence</span>
            <select value={cadence} onChange={(event) => setCadence(event.target.value as GameCadence)}>
              <option value="all">Toutes les cadences</option>
              <option value="rapid">Rapid</option>
              <option value="blitz">Blitz</option>
              <option value="bullet">Bullet</option>
              <option value="daily">Daily</option>
            </select>
            <small>ChessPath parcourt les archives jusqu’au volume demandé.</small>
          </label>
        ) : (
          <div className="pgn-info"><Check size={16} /><span>Une ou plusieurs parties sont acceptées.</span></div>
        )}
      </div>

      <button className="analysis-submit" type="submit">
        {source === "chesscom" ? "Analyser mon jeu" : "Importer et analyser"} <ArrowRight size={17} />
      </button>
      <div className="form-meta">
        <span><Check size={14} /> Stockfish local · aucune clé IA payante</span>
        <span>{count} partie{count > 1 ? "s" : ""} · analyse adaptative</span>
      </div>
      {localError || error ? <p className="form-error" role="alert"><CircleAlert size={16} /> {localError || error}</p> : null}
    </form>
  );
}

