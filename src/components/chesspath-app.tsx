"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
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
import type {
  AnalysisPayload,
  CompleteAnalysis,
  PlayerProfile,
  TrainingExercise,
} from "@/domain/chess/types";
import { analyzePayload } from "@/domain/chess/analyze";
import { parsePgnCollection } from "@/domain/chess/pgn";
import { allConceptExercises } from "@/domain/training/library";
import { buildTrainingSession, type TrainingFilter } from "@/domain/training/session";
import { StockfishClient } from "@/infrastructure/engine/stockfish-client";
import { getSupabaseClient } from "@/infrastructure/supabase/client";
import {
  loadPersistentProfile,
  reopenAnalysis,
  saveCompleteAnalysis,
  saveChessProfile,
  saveExerciseAttempt,
  saveGames,
  unlinkChessProfile,
  type AnalysisHistoryItem,
  type PersistentProfile,
} from "@/infrastructure/supabase/repository";
import { AnalysisForm, type AnalysisRequest } from "./analysis-form";
import { AppNav, type AppSection } from "./app-nav";
import { ProfileView } from "./profile-view";
import { ProgressView } from "./progress-view";
import { TrainingBoard } from "./training-board";
import { TrainingHub } from "./training-hub";

type Screen = AppSection | "loading" | "dashboard" | "training";
type AuthEntryMode = "sign-in" | "forgot";
type AuthNotice = { kind: "success" | "error"; message: string };

function readableError(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    const message = (reason as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

async function readApiResponse<T>(response: Response, fallback: string): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(response.ok
      ? "Le serveur a renvoyé une réponse illisible."
      : `${fallback} (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data
      ? (data as { error?: unknown }).error
      : null;
    throw new Error(typeof message === "string" && message ? message : `${fallback} (HTTP ${response.status}).`);
  }
  return data as T;
}

function currentAuthParams(): URLSearchParams {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  hash.forEach((value, key) => params.set(key, value));
  return params;
}

function clearAuthUrlParameters(clearHash: boolean) {
  const url = new URL(window.location.href);
  for (const key of ["auth", "password", "error", "error_code", "error_description"]) {
    url.searchParams.delete(key);
  }
  if (clearHash) url.hash = "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

const pillars = [
  ["01", "Analyse", "De 1 à 100 parties, filtrées par cadence ou importées en PGN."],
  ["02", "Diagnostic", "Des thèmes récurrents avec exemples et niveau de confiance."],
  ["03", "Entraînement", "Tes erreurs, puis des positions pédagogiques lorsque le concept correspond."],
];

function HomeScreen({
  profile,
  onAnalyze,
  onNavigate,
  error,
}: {
  profile: PersistentProfile | null;
  onAnalyze: (request: AnalysisRequest) => void;
  onNavigate: (section: AppSection) => void;
  error: string | null;
}) {
  const latest = profile?.analyses[0];
  if (profile?.chess && latest) {
    return (
      <main className="landing-shell returning-home">
        <AppNav active="home" onNavigate={onNavigate} connected />
        <section className="returning-hero">
          <div>
            <p className="eyebrow"><span /> Bon retour</p>
            <h1>Bonjour {profile.chess.displayName}.</h1>
            <p>Ton historique est bien là. Voici la priorité issue de ta dernière analyse sauvegardée.</p>
            <div className="returning-actions">
              <button className="lime-button" type="button" onClick={() => onNavigate("training-hub")}>S’entraîner <ArrowRight size={17} /></button>
              <button className="file-button" type="button" onClick={() => onNavigate("analyze")}>Nouvelle analyse</button>
            </div>
          </div>
          <article className="returning-priority">
            <span>Priorité actuelle</span>
            <h2>{latest.metrics.priorityTitle}</h2>
            <p>{latest.metrics.prioritySummary}</p>
            <div><strong>{profile.savedGamesCount}</strong><small>parties conservées</small><strong>{profile.analyses.length}</strong><small>analyses historiques</small></div>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="landing-shell" id="top">
      <AppNav active="home" onNavigate={onNavigate} connected={Boolean(profile)} />
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Ton jeu. Tes faiblesses. Ton entraînement.</p>
          <h1>Découvre ce qui t&apos;empêche <em>réellement</em> de progresser.</h1>
          <p className="hero-subtitle">Analyse tes parties, identifie tes faiblesses et entraîne-toi sur les positions qui comptent vraiment pour toi.</p>
          <AnalysisForm onAnalyze={onAnalyze} error={error} />
        </div>
        <div className="diagnostic-preview" aria-label="Aperçu d’un diagnostic ChessPath">
          <div className="preview-topline"><span>Diagnostic joueur</span><span className="live-dot">Confiance élevée</span></div>
          <div className="priority-card">
            <span className="card-kicker">Thème récurrent</span>
            <h2>Coups forcing manqués</h2>
            <p>7 exemples sur 18 positions où un échec ou une prise méritait d’être calculé en priorité.</p>
            <div className="conversion-row"><div><strong>7</strong><span>erreurs reliées</span></div><div className="conversion-arrow">→</div><div><strong>2+2</strong><span>positions personnelles + nouvelles</span></div></div>
          </div>
          <div className="mini-insights">
            <div><span className="insight-icon good">✓</span><p><small>Persistant</small>Historique conservé</p></div>
            <div><span className="insight-icon warn">↗</span><p><small>Mesurable</small>Évolution entre analyses</p></div>
          </div>
        </div>
      </section>
      <section className="how-it-works" aria-labelledby="method-title">
        <div><p className="eyebrow"><span /> Une boucle qui apprend</p><h2 id="method-title">De tes parties à un plan clair.</h2></div>
        <div className="pillar-grid">{pillars.map(([index, title, description]) => <article key={index}><span>{index}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>
    </main>
  );
}

function AnalyzeScreen({
  username,
  error,
  connected,
  onAnalyze,
  onNavigate,
}: {
  username?: string;
  error: string | null;
  connected: boolean;
  onAnalyze: (request: AnalysisRequest) => void;
  onNavigate: (section: AppSection) => void;
}) {
  return (
    <main className="app-page">
      <AppNav active="analyze" onNavigate={onNavigate} connected={connected} />
      <section className="page-shell analyze-page">
        <header className="page-heading"><div><p className="eyebrow"><span /> Analyser</p><h1>Choisis exactement<br />ce que Stockfish examine.</h1></div><p>Le moteur tourne sur ton appareil. Sur un grand volume, ChessPath échantillonne les décisions puis approfondit les bascules les plus importantes.</p></header>
        <AnalysisForm compact defaultUsername={username} onAnalyze={onAnalyze} error={error} />
      </section>
    </main>
  );
}

function LoadingScreen({
  label,
  progress,
  connected,
  onNavigate,
}: {
  label: string;
  progress: number;
  connected: boolean;
  onNavigate: (section: AppSection) => void;
}) {
  const steps = [
    ["Parties récupérées", progress >= 12],
    ["Positions reconstruites", progress >= 20],
    ["Décisions comparées", progress >= 88],
    ["Diagnostic préparé", progress >= 100],
  ] as const;
  return (
    <main className="loading-screen">
      <AppNav active="analyze" onNavigate={onNavigate} connected={connected} />
      <section className="loading-content" aria-live="polite">
        <div className="engine-orbit"><span>♞</span></div>
        <p className="eyebrow"><span /> Stockfish travaille sur ton appareil</p>
        <h1>On reconstruit ton jeu,<br />décision par décision.</h1>
        <p className="loading-label">{label}</p>
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
        <strong className="progress-number">{Math.round(progress)}%</strong>
        <div className="analysis-steps">{steps.map(([step, done]) => <span className={done ? "done" : ""} key={step}><BadgeCheck size={15} /> {step}</span>)}</div>
        <p className="privacy-note">Position complète évaluée par Stockfish 18 local · aucun calcul matériel maison.</p>
      </section>
    </main>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article className="metric-card"><div className="metric-heading"><span>{icon}</span><p>{label}</p></div><strong>{value}</strong><small>{detail}</small></article>;
}

function confidenceLabel(value: string): string {
  return value === "high" ? "élevée" : value === "medium" ? "moyenne" : "faible";
}

function Dashboard({
  result,
  connected,
  saveStatus,
  onTrain,
  onReset,
  onNavigate,
}: {
  result: CompleteAnalysis;
  connected: boolean;
  saveStatus: string | null;
  onTrain: () => void;
  onReset: () => void;
  onNavigate: (section: AppSection) => void;
}) {
  const { metrics, selection } = result;
  const endgame = metrics.phaseMetrics.find((phase) => phase.phase === "endgame");
  const maxPhaseLoss = Math.max(1, ...metrics.phaseMetrics.map((phase) => phase.averageLossCp));

  return (
    <main className="dashboard-shell" id="top">
      <AppNav active="analyze" onNavigate={onNavigate} connected={connected} />
      <section className="dashboard-intro">
        <div><p className="eyebrow"><span /> Diagnostic personnalisé</p><h1>Voilà ce que racontent<br />tes dernières parties.</h1></div>
        <button type="button" className="text-button" onClick={onReset}><ArrowLeft size={16} /> Nouvelle analyse</button>
      </section>
      <div className="analysis-scope"><strong>{metrics.gamesAnalyzed} partie{metrics.gamesAnalyzed > 1 ? "s" : ""} {selection.cadence === "all" ? "toutes cadences" : selection.cadence}</strong><span>{metrics.positionsAnalyzed} décisions Stockfish · seconde passe profondeur 10</span></div>
      {result.warnings.map((warning) => <p className="data-warning" key={warning}><CircleAlert size={16} /> {warning}</p>)}
      {saveStatus ? <p className={`save-status ${connected ? "saved" : ""}`}>{connected ? <Check size={15} /> : <CircleAlert size={15} />}{saveStatus}</p> : null}

      <section className="diagnostic-layout">
        <article className="main-priority">
          <div className="priority-label"><Crosshair size={17} /> Priorité actuelle · confiance {confidenceLabel(metrics.primaryTheme.confidence)}</div>
          <div><h2>{metrics.priorityTitle}</h2><p>{metrics.prioritySummary}</p></div>
          <div className="evidence-line"><span>{metrics.primaryTheme.successCount ?? Math.max(0, metrics.primaryTheme.sampleSize - metrics.primaryTheme.issueCount)}/{metrics.primaryTheme.sampleSize} occasions réussies</span><span>{metrics.gamesAnalyzed} parties</span><span>Pattern Engine + Stockfish</span></div>
        </article>
        <div className="metric-grid">
          <MetricCard icon={<Target size={18} />} label="Conversion" value={metrics.conversionRate === null ? "—" : `${metrics.conversionRate}%`} detail={`${metrics.convertedWins}/${metrics.conversionOpportunities} avantages transformés`} />
          <MetricCard icon={<Gauge size={18} />} label="Grosses erreurs" value={`${metrics.importantErrorsPerGame}`} detail="par partie, seuil ≥ 1,5 pion" />
          <MetricCard icon={<Shield size={18} />} label="Défense" value={metrics.defenseRecoveryRate === null ? "—" : `${metrics.defenseRecoveryRate}%`} detail={`${metrics.recoveredPositions}/${metrics.defenseOpportunities} positions rétablies`} />
          <MetricCard icon={<BarChart3 size={18} />} label="Finales" value={endgame?.positions ? `${endgame.averageLossCp} cp` : "—"} detail={endgame?.positions ? `${endgame.positions} décisions examinées` : "échantillon insuffisant"} />
        </div>
      </section>

      <section className="dashboard-detail-grid evidence-grid">
        <article className="panel diagnostic-proof">
          <div className="panel-heading"><div><span>Pourquoi ce diagnostic ?</span><h2>Des exemples vérifiables.</h2></div><small>Confiance {confidenceLabel(metrics.primaryTheme.confidence)}</small></div>
          <div className="proof-list">{metrics.primaryTheme.evidence.length ? metrics.primaryTheme.evidence.map((item) => <p key={item}><ChevronRight size={16} />{item}</p>) : <p>Les données restent trop limitées pour isoler un motif précis.</p>}</div>
          <p className="method-note">Le niveau de confiance augmente avec le nombre de positions pertinentes et la répétition du même problème. ChessPath ne transforme pas deux exemples en vérité générale.</p>
        </article>
        <article className="panel theme-panel">
          <div className="panel-heading"><div><span>Thèmes récurrents</span><h2>Ce que l’échantillon permet d’affirmer.</h2></div><small>{metrics.themes.length} thème{metrics.themes.length > 1 ? "s" : ""}</small></div>
          <div className="theme-list">{metrics.themes.slice(0, 5).map((theme) => <div key={theme.id}><span>{theme.category}</span><strong>{theme.title}</strong><small>{theme.successCount ?? Math.max(0, theme.sampleSize - theme.issueCount)}/{theme.sampleSize} occasions réussies · confiance {confidenceLabel(theme.confidence)}</small></div>)}</div>
        </article>
      </section>

      <section className="dashboard-detail-grid">
        <article className="phase-panel panel">
          <div className="panel-heading"><div><span>Où l’évaluation t’échappe</span><h2>Perte moyenne par décision</h2></div><small>Centipions, pertes seulement</small></div>
          <div className="phase-bars">{metrics.phaseMetrics.map((phase) => <div className="phase-row" key={phase.phase}><div><strong>{phase.label}</strong><small>{phase.positions} positions</small></div><div className="phase-track"><span style={{ width: `${Math.max(4, phase.averageLossCp / maxPhaseLoss * 100)}%` }} /></div><strong>{phase.averageLossCp}</strong></div>)}</div>
          <p className="method-note">La perte compare la vraie évaluation Stockfish avant et après le coup, toujours du point de vue du joueur.</p>
        </article>
        <article className="insight-panel panel">
          <div className="insight-column strength-list"><span><Sparkles size={16} /> Tes forces</span>{metrics.strengths.map((strength) => <p key={strength}><Check size={16} /> {strength}</p>)}</div>
          <div className="insight-column weakness-list"><span><CircleAlert size={16} /> Tes faiblesses</span>{metrics.weaknesses.map((weakness) => <p key={weakness}><ChevronRight size={16} /> {weakness}</p>)}</div>
        </article>
      </section>

      <section className="focus-section"><div><p className="eyebrow"><span /> Le plan ChessPath</p><h2>Les 3 choses qui devraient<br />te faire progresser maintenant.</h2></div><ol className="focus-list">{metrics.focusItems.map((item, index) => <li key={item}><span>0{index + 1}</span><p>{item}</p></li>)}</ol></section>
      <section className="training-cta"><div><BrainCircuit size={30} /><div><span>Prochaine étape</span><h2>Transforme le diagnostic en réflexes.</h2><p>Des positions personnelles sélectionnées pour leur valeur pédagogique, puis des exercices fiables lorsque le concept correspond.</p></div></div><button type="button" className="lime-button" onClick={onTrain} disabled={!result.exercises.length}>Entraîne-moi <ArrowRight size={18} /></button></section>
    </main>
  );
}

export function ChessPathApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [error, setError] = useState<string | null>(null);
  const [loadingLabel, setLoadingLabel] = useState("Connexion à Chess.com");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<CompleteAnalysis | null>(null);
  const [trainingExercises, setTrainingExercises] = useState<TrainingExercise[]>([]);
  const [trainingFilter, setTrainingFilter] = useState<TrainingFilter>("recommended");
  const [trainingSeenIds, setTrainingSeenIds] = useState<ReadonlySet<string>>(new Set());
  const [trainingEngine, setTrainingEngine] = useState<StockfishClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [persistent, setPersistent] = useState<PersistentProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authEntryMode, setAuthEntryMode] = useState<AuthEntryMode>("sign-in");
  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const engineRef = useRef<StockfishClient | null>(null);
  const profileRequestRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);

  async function refreshProfile(targetUser: User | null) {
    const requestId = ++profileRequestRef.current;
    if (!targetUser) {
      setPersistent(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    try {
      const loadedProfile = await loadPersistentProfile(targetUser);
      if (requestId === profileRequestRef.current) setPersistent(loadedProfile);
    } catch (reason) {
      if (requestId === profileRequestRef.current) {
        setPersistent(null);
        setProfileError(readableError(reason, "Ton historique n’a pas pu être chargé."));
      }
    } finally {
      if (requestId === profileRequestRef.current) setProfileLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const authParams = currentAuthParams();
    const authErrorCode = authParams.get("error_code");
    const authUrlError = authParams.get("error") || authParams.get("error_description");
    const callbackType = authParams.get("type");
    const requestedAuthMode = authParams.get("auth");

    if (authErrorCode || authUrlError) {
      setAuthNotice({ kind: "error", message: "Ce lien a expiré ou a déjà été utilisé." });
      setAuthEntryMode("sign-in");
      setScreen("profile");
      clearAuthUrlParameters(true);
    } else if (requestedAuthMode === "forgot" || requestedAuthMode === "login") {
      setAuthEntryMode(requestedAuthMode === "forgot" ? "forgot" : "sign-in");
      setScreen("profile");
      if (authParams.get("password") === "updated") {
        setAuthNotice({ kind: "success", message: "Mot de passe modifié. Tu peux maintenant te connecter." });
      }
      clearAuthUrlParameters(false);
    }

    try {
      const supabase = getSupabaseClient();
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        const current = session?.user ?? null;
        const nextUserId = current?.id ?? null;
        const previousUserId = activeUserIdRef.current;
        const accountChanged = previousUserId !== nextUserId;

        if (accountChanged && (previousUserId !== null || event === "SIGNED_OUT")) {
          profileRequestRef.current += 1;
          setPersistent(null);
          setProfileError(null);
          setProfileLoading(Boolean(current));
          setResult(null);
          setTrainingExercises([]);
          setSaveStatus(null);
          setError(null);
        }
        activeUserIdRef.current = nextUserId;
        setUser(current);
        if (event === "PASSWORD_RECOVERY") {
          setPasswordRecovery(true);
          setScreen("profile");
        }
        if (event === "SIGNED_IN" && (callbackType === "signup" || callbackType === "email")) {
          setPasswordRecovery(false);
          setAuthNotice({ kind: "success", message: "Adresse email confirmée. Ton compte ChessPath est prêt." });
          setScreen("profile");
        }
        if (event === "SIGNED_OUT") {
          setPasswordRecovery(false);
          setAuthEntryMode("sign-in");
          setScreen("profile");
        }
        // Supabase auth callbacks must stay synchronous. Profile queries are
        // deferred to avoid contending with the session refresh lock on mobile.
        queueMicrotask(() => {
          if (active) void refreshProfile(current);
        });
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    } catch (reason) {
      queueMicrotask(() => {
        if (!active) return;
        setProfileLoading(false);
        setProfileError(readableError(reason, "Le service de connexion n’est pas configuré."));
      });
    }
    return () => {
      active = false;
      unsubscribe();
      engineRef.current?.destroy();
    };
    // Supabase's listener emits INITIAL_SESSION, including restored sessions.
  }, []);

  function navigate(section: AppSection) {
    setError(null);
    setAuthNotice(null);
    setScreen(section);
  }

  async function ensureEngine(): Promise<StockfishClient> {
    if (engineRef.current) return engineRef.current;
    const engine = new StockfishClient();
    engineRef.current = engine;
    await engine.init();
    setTrainingEngine(engine);
    return engine;
  }

  async function runPayload(payload: AnalysisPayload) {
    setProgress(14);
    setLoadingLabel(`${payload.games.length} parties récupérées · préparation du moteur`);
    const engine = await ensureEngine();
    setProgress(20);
    const analysis = await analyzePayload(payload, engine, ({ completed, total, label }) => {
      setLoadingLabel(label);
      setProgress(total > 0 ? Math.min(96, 20 + completed / total * 76) : 96);
    });
    setLoadingLabel("Le Pattern Engine sélectionne les moments vraiment utiles");
    setProgress(97);
    // The optional OpenAI pedagogy module remains available in the codebase,
    // but Pattern Engine V1 deliberately performs no paid AI call.
    const completedAnalysis = analysis;
    setLoadingLabel("Construction de ton diagnostic");
    setProgress(100);
    setResult(completedAnalysis);
    setTrainingExercises(completedAnalysis.exercises);

    if (user) {
      setSaveStatus("Sauvegarde de cette analyse dans ton profil…");
      try {
        await saveCompleteAnalysis(user.id, payload, completedAnalysis);
        setSaveStatus("Analyse, parties, faiblesses et exercices sauvegardés dans ton profil.");
        await refreshProfile(user);
      } catch (saveError) {
        setSaveStatus(`Le diagnostic fonctionne, mais la sauvegarde a échoué : ${saveError instanceof Error ? saveError.message : "erreur inconnue"}`);
      }
    } else {
      setSaveStatus("Diagnostic non sauvegardé : connecte ton profil pour le retrouver plus tard.");
    }
    setScreen("dashboard");
  }

  async function startAnalysis(request: AnalysisRequest) {
    setError(null);
    setSaveStatus(null);
    setScreen("loading");
    setProgress(4);
    try {
      let payload: AnalysisPayload;
      if (request.source === "pgn") {
        setLoadingLabel("Validation et reconstruction du PGN");
        payload = parsePgnCollection(request.pgn, request.playerName, request.count);
      } else {
        setLoadingLabel(`Recherche de ${request.count} partie${request.count > 1 ? "s" : ""} ${request.cadence === "all" ? "toutes cadences" : request.cadence}`);
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: request.username, limit: request.count, cadence: request.cadence }),
        });
        const data = await readApiResponse<AnalysisPayload>(response, "Impossible de récupérer ces parties");
        if (!Array.isArray(data.games)) throw new Error("ChessPath a reçu des parties dans un format invalide.");
        payload = data;
      }
      await runPayload(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L’analyse n’a pas pu se terminer.");
      setScreen("analyze");
    }
  }

  async function startTraining(exercises: TrainingExercise[], filter: TrainingFilter = "recommended") {
    if (!exercises.length) return;
    setScreen("loading");
    setProgress(15);
    setLoadingLabel("Préparation de ta séance Stockfish");
    try {
      await ensureEngine();
      setTrainingExercises(exercises);
      setTrainingFilter(filter);
      setTrainingSeenIds(new Set());
      setProgress(100);
      setScreen("training");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le moteur n’a pas pu préparer la séance.");
      setScreen("training-hub");
    }
  }

  function openAnalysis(history: AnalysisHistoryItem) {
    if (!persistent?.chess) return;
    const reopened = reopenAnalysis(history, persistent.chess);
    setResult(reopened);
    setTrainingExercises(reopened.exercises);
    setSaveStatus("Analyse historique rouverte depuis ton profil.");
    setScreen("dashboard");
  }

  async function recordAttempt(exercise: TrainingExercise, status: "success" | "partial" | "failed", lossCp: number, moves: string[]) {
    if (!user) return;
    try {
      await saveExerciseAttempt(user.id, exercise, status, lossCp, moves);
      await refreshProfile(user);
    } catch {
      // Training must stay playable even if a background persistence write fails.
    }
  }

  async function continueTraining(currentExerciseIds: string[]): Promise<boolean> {
    const seen = new Set([...trainingSeenIds, ...currentExerciseIds]);
    const priorityConcept = result?.metrics.primaryTheme.id ?? persistent?.analyses[0]?.metrics.primaryTheme.id;
    const next = buildTrainingSession(
      hubExercises,
      persistent?.trainingAttempts ?? [],
      trainingFilter,
      7,
      {
        userRating: result?.profile.rating ?? persistent?.chess?.rating,
        priorityConcept,
        excludeExerciseIds: seen,
      },
    );
    setTrainingSeenIds(seen);
    if (!next.length) return false;
    setTrainingExercises(next);
    return true;
  }

  async function synchronize() {
    if (!user || !persistent?.chess?.username) {
      setScreen("analyze");
      return;
    }
    setScreen("loading");
    setError(null);
    setProgress(8);
    setLoadingLabel("Synchronisation des archives Chess.com");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: persistent.chess.username, limit: 100, cadence: "all" }),
      });
      const payload = await readApiResponse<AnalysisPayload>(response, "Synchronisation impossible");
      if (!Array.isArray(payload.games)) throw new Error("ChessPath a reçu des parties dans un format invalide.");
      await saveChessProfile(user.id, payload.profile);
      const saved = await saveGames(user.id, payload.profile, payload.games);
      await refreshProfile(user);
      setSaveStatus(`${saved.inserted} nouvelle${saved.inserted > 1 ? "s" : ""} partie${saved.inserted > 1 ? "s" : ""} trouvée${saved.inserted > 1 ? "s" : ""}. Aucune partie existante n’a été dupliquée.`);
      setScreen("profile");
    } catch (reason) {
      setError(readableError(reason, "Synchronisation impossible."));
      setScreen("profile");
    }
  }

  async function linkChessAccount(username: string) {
    if (!user) throw new Error("Connecte-toi à ChessPath avant de lier un compte Chess.com.");
    const response = await fetch("/api/chesscom/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const chessProfile = await readApiResponse<PlayerProfile>(response, "Liaison Chess.com impossible");
    if (!chessProfile.username) throw new Error("Chess.com a renvoyé un profil incomplet.");
    await saveChessProfile(user.id, chessProfile);
    await refreshProfile(user);
    setSaveStatus(`Le compte Chess.com ${chessProfile.username} est lié à ton profil.`);
  }

  async function unlinkChessAccount() {
    if (!user) return;
    await unlinkChessProfile(user.id);
    await refreshProfile(user);
    setSaveStatus("Le compte Chess.com est délié. Tes parties et anciennes analyses sont conservées.");
  }

  const connected = Boolean(user);
  const hubExercises = useMemo(() => {
    const historical = [...new Map([
      ...(result?.exercises ?? []),
      ...(persistent?.analyses.flatMap((analysis) => analysis.exercises) ?? []),
    ].map((exercise) => [exercise.id, exercise])).values()];
    const historicalIds = new Set(historical.map((exercise) => exercise.id));
    return [
      ...historical,
      ...allConceptExercises().filter((exercise) => !historicalIds.has(exercise.id)),
    ];
  }, [persistent?.analyses, result?.exercises]);
  const navProps = { onNavigate: navigate, connected };

  if (screen === "loading") return <LoadingScreen label={loadingLabel} progress={progress} {...navProps} />;
  if (screen === "dashboard" && result) return <Dashboard result={result} saveStatus={saveStatus} onTrain={() => navigate("training-hub")} onReset={() => navigate("analyze")} {...navProps} />;
  if (screen === "training" && trainingExercises.length && trainingEngine) return <TrainingBoard key={trainingExercises[0].id} exercises={trainingExercises} engine={trainingEngine} onBack={() => navigate("training-hub")} onContinue={continueTraining} onAttempt={(...args) => void recordAttempt(...args)} />;
  if (screen === "analyze") return <AnalyzeScreen username={persistent?.chess?.username} error={error} onAnalyze={(request) => void startAnalysis(request)} {...navProps} />;
  if (screen === "training-hub") return <main className="app-page"><AppNav active="training-hub" {...navProps} /><TrainingHub exercises={hubExercises} attempts={persistent?.trainingAttempts ?? []} priority={result?.metrics.priorityTitle ?? persistent?.analyses[0]?.metrics.priorityTitle} priorityConcept={result?.metrics.primaryTheme.id ?? persistent?.analyses[0]?.metrics.primaryTheme.id} userRating={result?.profile.rating ?? persistent?.chess?.rating} onStart={(items, filter) => void startTraining(items, filter)} onAnalyze={() => navigate("analyze")} /></main>;
  if (screen === "progress") return <main className="app-page"><AppNav active="progress" {...navProps} /><ProgressView profile={persistent} onProfile={() => navigate("profile")} /></main>;
  if (screen === "profile") return <main className="app-page"><AppNav active="profile" {...navProps} />{authNotice ? <p className={`global-notice ${authNotice.kind === "error" ? "error" : ""}`} role={authNotice.kind === "error" ? "alert" : "status"}>{authNotice.message}</p> : null}{saveStatus ? <p className="global-notice">{saveStatus}</p> : null}{error ? <p className="global-notice error">{error}</p> : null}<ProfileView key={user?.id ?? "guest"} user={user} profile={persistent} loading={profileLoading} profileError={profileError} initialAuthMode={authEntryMode} passwordRecovery={passwordRecovery} onPasswordRecovered={() => setPasswordRecovery(false)} onRetryProfile={() => refreshProfile(user)} onSync={synchronize} onLinkChess={linkChessAccount} onUnlinkChess={unlinkChessAccount} onOpenAnalysis={openAnalysis} /></main>;
  return <HomeScreen profile={persistent} error={error} onAnalyze={(request) => void startAnalysis(request)} onNavigate={navigate} />;
}
