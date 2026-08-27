"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleAlert,
  Crosshair,
  Gauge,
  Shield,
  Sparkles,
  Target,
} from "lucide-react";
import type { AnalysisPayload, CompleteAnalysis } from "@/domain/chess/types";
import { analyzePayload } from "@/domain/chess/analyze";
import { StockfishClient } from "@/infrastructure/engine/stockfish-client";
import { Brand } from "./brand";
import { TrainingBoard } from "./training-board";

type Screen = "home" | "loading" | "dashboard" | "training";

const pillars = [
  ["01", "Analyse", "Tes parties récentes, pas une moyenne abstraite."],
  ["02", "Diagnostic", "La faiblesse qui freine vraiment ta progression."],
  ["03", "Entraînement", "Des positions choisies dans ton propre jeu."],
];

function HomeScreen({
  onAnalyze,
  error,
}: {
  onAnalyze: (username: string) => void;
  error: string | null;
}) {
  const [username, setUsername] = useState("");

  return (
    <main className="landing-shell" id="top">
      <nav className="site-nav" aria-label="Navigation principale">
        <Brand />
        <span className="prototype-pill">Prototype V1</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Ton jeu. Tes faiblesses. Ton entraînement.</p>
          <h1>Découvre ce qui t&apos;empêche <em>réellement</em> de progresser.</h1>
          <p className="hero-subtitle">
            Analyse tes parties, identifie tes faiblesses et entraîne-toi sur les
            positions qui comptent vraiment pour toi.
          </p>

          <form
            className="analysis-form"
            onSubmit={(event) => {
              event.preventDefault();
              onAnalyze(username);
            }}
          >
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
              <button type="submit">Analyser mon jeu <ArrowRight size={17} aria-hidden="true" /></button>
            </div>
            <div className="form-meta">
              <span><Check size={14} aria-hidden="true" /> Aucun mot de passe requis</span>
              <button type="button" className="pgn-button" disabled>
                Importer un PGN <small>Bientôt</small>
              </button>
            </div>
            {error ? <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p> : null}
          </form>
        </div>

        <div className="diagnostic-preview" aria-label="Aperçu d’un diagnostic ChessPath">
          <div className="preview-topline">
            <span>Diagnostic joueur</span>
            <span className="live-dot">Analyse terminée</span>
          </div>
          <div className="priority-card">
            <span className="card-kicker">Priorité actuelle</span>
            <h2>Conversion des positions gagnantes</h2>
            <p>Tu obtiens l&apos;avantage. Le défi est maintenant de le garder.</p>
            <div className="conversion-row">
              <div><strong>6</strong><span>positions gagnantes</span></div>
              <div className="conversion-arrow" aria-hidden="true">→</div>
              <div><strong>3</strong><span>victoires converties</span></div>
            </div>
          </div>
          <div className="mini-insights">
            <div><span className="insight-icon good">↗</span><p><small>Force</small>Débuts solides</p></div>
            <div><span className="insight-icon warn">!</span><p><small>À travailler</small>Décisions au 25e coup</p></div>
          </div>
        </div>
      </section>

      <section className="how-it-works" aria-labelledby="method-title">
        <div>
          <p className="eyebrow"><span /> Une boucle qui apprend</p>
          <h2 id="method-title">De tes parties à un plan clair.</h2>
        </div>
        <div className="pillar-grid">
          {pillars.map(([index, title, description]) => (
            <article key={index}>
              <span>{index}</span><h3>{title}</h3><p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function LoadingScreen({ label, progress }: { label: string; progress: number }) {
  const steps = [
    ["Parties récupérées", progress >= 12],
    ["Positions reconstruites", progress >= 20],
    ["Décisions comparées", progress >= 88],
    ["Diagnostic préparé", progress >= 100],
  ] as const;

  return (
    <main className="loading-screen">
      <nav className="site-nav"><Brand /><span className="prototype-pill">Analyse locale</span></nav>
      <section className="loading-content" aria-live="polite">
        <div className="engine-orbit" aria-hidden="true"><span>♞</span></div>
        <p className="eyebrow"><span /> Stockfish travaille sur ton appareil</p>
        <h1>On reconstruit ton jeu,<br />décision par décision.</h1>
        <p className="loading-label">{label}</p>
        <div className="progress-track" role="progressbar" aria-label="Progression de l’analyse" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <strong className="progress-number">{Math.round(progress)}%</strong>
        <div className="analysis-steps">
          {steps.map(([step, done]) => (
            <span className={done ? "done" : ""} key={step}><BadgeCheck size={15} /> {step}</span>
          ))}
        </div>
        <p className="privacy-note">Aucune clé payante. Le moteur tourne localement dans ton navigateur.</p>
      </section>
    </main>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <div className="metric-heading"><span>{icon}</span><p>{label}</p></div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Dashboard({ result, onTrain, onReset }: { result: CompleteAnalysis; onTrain: () => void; onReset: () => void }) {
  const { metrics, profile } = result;
  const endgame = metrics.phaseMetrics.find((phase) => phase.phase === "endgame");
  const maxPhaseLoss = Math.max(1, ...metrics.phaseMetrics.map((phase) => phase.averageLossCp));

  return (
    <main className="dashboard-shell" id="top">
      <nav className="dashboard-nav">
        <Brand />
        <div className="player-chip">
          <span>{profile.title ?? profile.username.slice(0, 1).toUpperCase()}</span>
          <div><strong>{profile.username}</strong><small>{profile.rating ? `${profile.rating} Elo` : "Chess.com"}</small></div>
        </div>
      </nav>

      <section className="dashboard-intro">
        <div>
          <p className="eyebrow"><span /> Diagnostic personnalisé</p>
          <h1>Voilà ce que racontent<br />tes dernières parties.</h1>
        </div>
        <button type="button" className="text-button" onClick={onReset}><ArrowLeft size={16} /> Nouvelle analyse</button>
      </section>

      {result.warnings.map((warning) => <p className="data-warning" key={warning}><CircleAlert size={16} /> {warning}</p>)}

      <section className="diagnostic-layout">
        <article className="main-priority">
          <div className="priority-label"><Crosshair size={17} /> Priorité actuelle</div>
          <div>
            <h2>{metrics.priorityTitle}</h2>
            <p>{metrics.prioritySummary}</p>
          </div>
          <div className="evidence-line">
            <span>{metrics.gamesAnalyzed} parties</span>
            <span>{metrics.positionsAnalyzed} décisions examinées</span>
            <span>Stockfish profondeur 7</span>
          </div>
        </article>

        <div className="metric-grid">
          <MetricCard
            icon={<Target size={18} />}
            label="Conversion"
            value={metrics.conversionRate === null ? "—" : `${metrics.conversionRate}%`}
            detail={`${metrics.convertedWins}/${metrics.conversionOpportunities} avantages transformés`}
          />
          <MetricCard
            icon={<Gauge size={18} />}
            label="Grosses erreurs"
            value={`${metrics.importantErrorsPerGame}`}
            detail="par partie, seuil ≥ 1,5 pion"
          />
          <MetricCard
            icon={<Shield size={18} />}
            label="Défense"
            value={metrics.defenseRecoveryRate === null ? "—" : `${metrics.defenseRecoveryRate}%`}
            detail={`${metrics.recoveredPositions}/${metrics.defenseOpportunities} positions rétablies`}
          />
          <MetricCard
            icon={<BarChart3 size={18} />}
            label="Finales"
            value={endgame?.positions ? `${endgame.averageLossCp} cp` : "—"}
            detail={endgame?.positions ? `${endgame.positions} décisions examinées` : "échantillon insuffisant"}
          />
        </div>
      </section>

      <section className="dashboard-detail-grid">
        <article className="phase-panel panel">
          <div className="panel-heading"><div><span>Où l’évaluation t’échappe</span><h2>Perte moyenne par décision</h2></div><small>En centipions, pertes seulement</small></div>
          <div className="phase-bars">
            {metrics.phaseMetrics.map((phase) => (
              <div className="phase-row" key={phase.phase}>
                <div><strong>{phase.label}</strong><small>{phase.positions} positions</small></div>
                <div className="phase-track"><span style={{ width: `${Math.max(4, phase.averageLossCp / maxPhaseLoss * 100)}%` }} /></div>
                <strong>{phase.averageLossCp}</strong>
              </div>
            ))}
          </div>
          <p className="method-note">Une perte mesure la baisse d’évaluation entre le moment où tu dois jouer et la position après ton coup. Aucun score subjectif n’est ajouté.</p>
        </article>

        <article className="insight-panel panel">
          <div className="insight-column strength-list">
            <span><Sparkles size={16} /> Tes forces</span>
            {metrics.strengths.map((strength) => <p key={strength}><Check size={16} /> {strength}</p>)}
          </div>
          <div className="insight-column weakness-list">
            <span><CircleAlert size={16} /> Tes faiblesses</span>
            {metrics.weaknesses.map((weakness) => <p key={weakness}><ChevronRight size={16} /> {weakness}</p>)}
          </div>
        </article>
      </section>

      <section className="focus-section">
        <div>
          <p className="eyebrow"><span /> Le plan ChessPath</p>
          <h2>Les 3 choses qui devraient<br />te faire progresser maintenant.</h2>
        </div>
        <ol className="focus-list">
          {metrics.focusItems.map((item, index) => <li key={item}><span>0{index + 1}</span><p>{item}</p></li>)}
        </ol>
      </section>

      <section className="training-cta">
        <div><BrainCircuit size={30} /><div><span>Prochaine étape</span><h2>Transforme le diagnostic en réflexes.</h2><p>{result.exercises.length} position{result.exercises.length > 1 ? "s" : ""} de tes parties prête{result.exercises.length > 1 ? "s" : ""} à rejouer.</p></div></div>
        <button type="button" className="lime-button" onClick={onTrain} disabled={result.exercises.length === 0}>
          Entraîne-moi <ArrowRight size={18} />
        </button>
      </section>
    </main>
  );
}

export function ChessPathApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [error, setError] = useState<string | null>(null);
  const [loadingLabel, setLoadingLabel] = useState("Connexion à Chess.com");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<CompleteAnalysis | null>(null);
  const [trainingEngine, setTrainingEngine] = useState<StockfishClient | null>(null);
  const engineRef = useRef<StockfishClient | null>(null);

  useEffect(() => () => engineRef.current?.destroy(), []);

  async function startAnalysis(username: string) {
    setError(null);
    setScreen("loading");
    setProgress(4);
    setLoadingLabel("Récupération des parties publiques");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = (await response.json()) as AnalysisPayload | { error?: string };
      if (!response.ok || !("games" in data)) {
        throw new Error("error" in data && data.error ? data.error : "Impossible de récupérer ces parties.");
      }

      setProgress(14);
      setLoadingLabel(`${data.games.length} parties récupérées · préparation du moteur`);
      engineRef.current?.destroy();
      const engine = new StockfishClient();
      engineRef.current = engine;
      await engine.init();
      setTrainingEngine(engine);
      setProgress(20);

      const analysis = await analyzePayload(data, engine, ({ completed, total, label }) => {
        setLoadingLabel(label);
        setProgress(total > 0 ? 20 + completed / total * 72 : 92);
      });

      setLoadingLabel("Construction de ton diagnostic");
      setProgress(100);
      setResult(analysis);
      setScreen("dashboard");
    } catch (reason) {
      engineRef.current?.destroy();
      engineRef.current = null;
      setTrainingEngine(null);
      setError(reason instanceof Error ? reason.message : "L’analyse n’a pas pu se terminer.");
      setScreen("home");
    }
  }

  function reset() {
    engineRef.current?.destroy();
    engineRef.current = null;
    setTrainingEngine(null);
    setResult(null);
    setError(null);
    setScreen("home");
  }

  if (screen === "loading") return <LoadingScreen label={loadingLabel} progress={progress} />;
  if (screen === "dashboard" && result) {
    return <Dashboard result={result} onTrain={() => setScreen("training")} onReset={reset} />;
  }
  if (screen === "training" && result && trainingEngine) {
    return <TrainingBoard exercises={result.exercises} engine={trainingEngine} onBack={() => setScreen("dashboard")} />;
  }
  return <HomeScreen onAnalyze={startAnalysis} error={error} />;
}
