"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronRight, Clock3, Eye, Sparkles, Target, TrendingUp, X } from "lucide-react";
import type { DiagnosticCategory, TrainingExercise } from "../domain/chess/types";
import { conceptDefinition } from "../domain/knowledge/concepts";
import type { ProgressFixtureName } from "../domain/progress/progress-read-model.fixtures";
import type { ObservedStrength, ProgressConcept, ProgressConceptStatus, ProgressDomain, ProgressReadModel } from "../domain/progress/progress-read-model";
import { PROGRESS_READ_MODEL_POLICY } from "../domain/progress/progress-read-model";
import type { PersistentProfile } from "../infrastructure/supabase/repository";

type PlayerMapCategory = Exclude<DiagnosticCategory, "opening">;
type Achievement = { conceptSlug: string; label: string; kind: "IMPROVING" | "RESOLVED" | "STRENGTH"; concept?: ProgressConcept; strength?: ObservedStrength };
type EvidenceTarget = { type: "concept"; slug: string } | { type: "domain"; category: PlayerMapCategory };
type ConceptGroup = "À renforcer" | "En amélioration" | "Solides / points forts" | "Stable" | "Données insuffisantes";
export type ProgressInsight = { concept: ProgressConcept; label: "PRIORITÉ" | "FOCUS RECOMMANDÉ" | "POINT FORT OBSERVÉ"; detail: string };
export type ProgressChange = { domain: ProgressDomain; delta: number; direction: "IMPROVEMENT" | "DECLINE" | "STABLE" };

const DOMAIN_ORDER: Array<{ id: PlayerMapCategory; label: string }> = [
  { id: "tactic", label: "Tactique" }, { id: "strategy", label: "Stratégie" },
  { id: "conversion", label: "Conversion" }, { id: "defense", label: "Défense" },
  { id: "endgame", label: "Finales" },
];
const CONCEPT_GROUP_ORDER: ConceptGroup[] = ["À renforcer", "En amélioration", "Solides / points forts", "Stable", "Données insuffisantes"];
const DEV_FIXTURE_NAMES: ProgressFixtureName[] = [
  "NO_DATA", "INSUFFICIENT_DATA", "EMERGING_ONLY", "RECURRING", "IMPROVING", "RESOLVED",
  "BALANCED", "TACTICAL_STRENGTH", "STRATEGY_FRAGILE", "MULTIPLE_STRENGTHS", "RICH_PROFILE",
];
const PIECES: Record<string, string> = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

export function developmentFixtureName(value: string | null, environment: string): ProgressFixtureName | null {
  if (environment !== "development" || !value) return null;
  return DEV_FIXTURE_NAMES.find((name) => name === value) ?? null;
}

function conceptVolume(concept: ProgressConcept) {
  const opportunities = concept.recent.exposures;
  const successes = concept.recent.correctlyTreated;
  return { opportunities, successes, rate: opportunities ? successes / opportunities : null };
}

export function progressStatusLabel(status: ProgressConceptStatus): string {
  if (status === "INSUFFICIENT_EVIDENCE") return "Données insuffisantes";
  if (status === "EMERGING") return "Focus recommandé";
  if (status === "RECURRING") return "Priorité";
  if (status === "IMPROVING") return "En amélioration";
  return "Résolue";
}

export function conceptDisplayStatus(concept: ProgressConcept): string {
  if (concept.status !== "INSUFFICIENT_EVIDENCE") return progressStatusLabel(concept.status);
  const volume = conceptVolume(concept);
  if (volume.opportunities < PROGRESS_READ_MODEL_POLICY.minimumComparableExposures) return "Données insuffisantes";
  if (volume.rate !== null && volume.rate >= PROGRESS_READ_MODEL_POLICY.minimumStrengthSuccessRate) return "Point fort observé";
  return "Focus recommandé";
}

function conceptGroup(concept: ProgressConcept): ConceptGroup {
  const status = conceptDisplayStatus(concept);
  if (status === "Priorité" || status === "Focus recommandé") return "À renforcer";
  if (status === "En amélioration") return "En amélioration";
  if (status === "Résolue" || status === "Point fort observé") return "Solides / points forts";
  if (status === "Données insuffisantes") return "Données insuffisantes";
  return "Stable";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Date indisponible";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function percent(value: number | null): string { return value === null ? "Non mesuré" : `${Math.round(value * 100)} %`; }
function signedPoints(value: number): string { const points = Math.round(value * 100); return `${points > 0 ? "+" : ""}${points} pts`; }

export function progressSummary(model: ProgressReadModel): { eyebrow: string; title: string; description: string } {
  if (model.dataState === "NO_DATA") return { eyebrow: "Carte du joueur", title: "Ta carte attend sa première analyse.", description: "ChessPath commencera par observer ton jeu, sans transformer une partie isolée en vérité sur ton profil." };
  const observed = model.domains.filter((domain) => domain.successRate !== null);
  if (observed.length < 2) return { eyebrow: "Carte du joueur", title: "Ton profil prend forme.", description: "Les domaines encore peu rencontrés restent volontairement non mesurés." };
  const ordered = observed.toSorted((first, second) => second.successRate! - first.successRate!);
  const strongest = ordered[0];
  const weakest = ordered.at(-1)!;
  const comparableVolumes = Math.min(strongest.opportunities, weakest.opportunities) / Math.max(strongest.opportunities, weakest.opportunities) >= 0.5;
  const meaningfulGap = comparableVolumes && strongest.successRate! - weakest.successRate! >= 0.12;
  if (model.priority?.status === "RECURRING") {
    const priorityDomain = model.domains.find((domain) => domain.category === model.priority?.category);
    return {
      eyebrow: "Carte du joueur",
      title: priorityDomain ? `Profil globalement ${meaningfulGap ? "contrasté" : "équilibré"}, avec une fragilité récurrente en ${priorityDomain.label.toLowerCase()}.` : `${model.priority.label} reste une fragilité récurrente.`,
      description: `${model.priority.label} est appuyé par ${model.priority.distinctGames} parties distinctes ; les axes montrent uniquement les occasions récentes observées.`,
    };
  }
  if (!meaningfulGap) return { eyebrow: "Carte du joueur", title: "Ton profil est plutôt équilibré.", description: `${observed.length} domaines reposent sur des occasions réellement observées dans tes parties récentes.` };
  return { eyebrow: "Carte du joueur", title: `${strongest.label} ressort mieux ; ${weakest.label.toLowerCase()} mérite davantage d’attention.`, description: "Cette lecture compare des volumes suffisamment proches ; elle ne fabrique ni Elo de domaine ni score de maîtrise." };
}

export function progressAchievements(model: ProgressReadModel): Achievement[] {
  const achievements: Achievement[] = model.concepts.flatMap((concept): Achievement[] => concept.status === "IMPROVING" || concept.status === "RESOLVED" ? [{ conceptSlug: concept.conceptSlug, label: concept.label, kind: concept.status, concept }] : []);
  const seen = new Set(achievements.map((item) => item.conceptSlug));
  for (const strength of model.observedStrengths) {
    if (seen.has(strength.conceptSlug)) continue;
    achievements.push({ conceptSlug: strength.conceptSlug, label: strength.label, kind: "STRENGTH", strength });
  }
  return achievements;
}

export function progressStrengths(model: ProgressReadModel): ProgressInsight[] {
  const bySlug = new Map(model.concepts.map((concept) => [concept.conceptSlug, concept]));
  return progressAchievements(model).flatMap((achievement): ProgressInsight[] => {
    const concept = bySlug.get(achievement.conceptSlug);
    if (!concept || !concept.category || concept.category === "opening") return [];
    const volume = conceptVolume(concept);
    return [{ concept, label: "POINT FORT OBSERVÉ", detail: achievement.kind === "IMPROVING"
      ? `${volume.successes}/${volume.opportunities} occasions récentes bien traitées ; la comparaison avec la fenêtre précédente progresse.`
      : achievement.kind === "RESOLVED"
        ? `${concept.distinctGames} anciennes parties concernées, aucune rechute validée dans la fenêtre récente.`
        : `${volume.successes}/${volume.opportunities} occasions récentes correctement traitées.` }];
  }).slice(0, 3);
}

export function progressWorkItems(model: ProgressReadModel): ProgressInsight[] {
  const strengths = new Set(progressStrengths(model).map((item) => item.concept.conceptSlug));
  const actionable = model.concepts.filter((concept) => concept.category && concept.category !== "opening" && !strengths.has(concept.conceptSlug) && concept.status !== "RESOLVED");
  const priorities = actionable.filter((concept) => concept.status === "RECURRING").toSorted((first, second) => (first.priority ?? 999) - (second.priority ?? 999)).map((concept): ProgressInsight => ({ concept, label: "PRIORITÉ", detail: `${concept.distinctGames} parties distinctes · ${concept.historicalErrors} erreurs · ${concept.historicalMissedOpportunities} occasions manquées.` }));
  const suggestions = actionable.filter((concept) => concept.status !== "RECURRING").map((concept) => ({ concept, volume: conceptVolume(concept) })).filter(({ concept, volume }) => concept.status === "EMERGING" || volume.opportunities >= PROGRESS_READ_MODEL_POLICY.minimumComparableExposures).toSorted((first, second) => Number(second.concept.status === "EMERGING") - Number(first.concept.status === "EMERGING") || (first.volume.rate ?? 1) - (second.volume.rate ?? 1) || second.volume.opportunities - first.volume.opportunities).map(({ concept, volume }): ProgressInsight => ({ concept, label: "FOCUS RECOMMANDÉ", detail: concept.status === "EMERGING" ? `Signal retrouvé dans ${concept.distinctGames} parties, encore insuffisant pour déclarer une faiblesse.` : `${volume.successes}/${volume.opportunities} occasions récentes bien traitées ; ce thème est relativement moins solide, sans constituer une faiblesse démontrée.` }));
  return [...priorities, ...suggestions].slice(0, 3);
}

export function progressChanges(model: ProgressReadModel): ProgressChange[] {
  return model.domains.flatMap((domain): ProgressChange[] => {
    if (domain.recent.successRate === null || domain.previous.successRate === null) return [];
    const delta = domain.recent.successRate - domain.previous.successRate;
    if (Math.abs(delta) < 0.01) return [];
    return [{ domain, delta, direction: delta >= 0.05 ? "IMPROVEMENT" : delta <= -0.05 ? "DECLINE" : "STABLE" }];
  }).toSorted((first, second) => Math.abs(second.delta) - Math.abs(first.delta));
}

function radarPoint(index: number, ratio: number, radius = 116): [number, number] {
  const angle = -Math.PI / 2 + index * (Math.PI * 2 / DOMAIN_ORDER.length);
  return [210 + Math.cos(angle) * radius * ratio, 168 + Math.sin(angle) * radius * ratio];
}
function pointsAt(ratio: number): string { return DOMAIN_ORDER.map((_, index) => radarPoint(index, ratio).join(",")).join(" "); }

function PlayerRadar({ domains, onSelect }: { domains: ProgressDomain[]; onSelect: (category: PlayerMapCategory) => void }) {
  const complete = domains.every((domain) => domain.successRate !== null);
  const observedCount = domains.filter((domain) => domain.successRate !== null).length;
  return <div className="player-radar-card"><div className="player-radar-heading"><span>Profil récent observé</span><strong>{observedCount}/5 domaines mesurés</strong></div><svg className="player-radar" viewBox="0 0 420 350" role="img" aria-label="Carte radar interactive des taux de réussite récents par domaine">{[0.25, 0.5, 0.75, 1].map((ratio) => <polygon key={ratio} className="radar-grid" points={pointsAt(ratio)} />)}{domains.map((domain, index) => { const edge = radarPoint(index, 1); const value = radarPoint(index, domain.successRate ?? 0.08); const label = radarPoint(index, 1.28); return <g key={domain.category} className={`radar-domain ${domain.successRate === null ? "radar-missing" : ""}`} role="button" tabIndex={0} aria-label={`Voir ${domain.label}, ${domain.successRate === null ? "non mesuré" : `${domain.correctlyTreated} réussites sur ${domain.opportunities} occasions`}`} onClick={() => onSelect(domain.category)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(domain.category); } }}><line className="radar-axis" x1="210" y1="168" x2={edge[0]} y2={edge[1]} /><line className="radar-value-line" x1="210" y1="168" x2={value[0]} y2={value[1]} /><circle className="radar-value-dot" cx={value[0]} cy={value[1]} r="5" /><text className="radar-label" x={label[0]} y={label[1]} textAnchor="middle"><tspan x={label[0]}>{domain.label}</tspan><tspan className="radar-label-value" x={label[0]} dy="15">{percent(domain.successRate)}</tspan><tspan className="radar-label-volume" x={label[0]} dy="12">{domain.successRate === null ? `${domain.opportunities}/5 occasions` : `${domain.correctlyTreated}/${domain.opportunities}`}</tspan></text></g>; })}{complete ? <polygon className="radar-profile" points={domains.map((domain, index) => radarPoint(index, domain.successRate!).join(",")).join(" ")} /> : null}</svg><p>Chaque axe utilise seulement la fenêtre récente : réussites ÷ occasions observées. Moins de 5 occasions reste non mesuré. Clique un axe pour ouvrir son domaine.</p></div>;
}

function ProgressChanges({ model }: { model: ProgressReadModel }) {
  const changes = progressChanges(model);
  if (!changes.length) return <div className="progress-chart-empty"><TrendingUp size={25} /><div><strong>Pas encore assez d’historique comparable.</strong><span>Chaque domaine a besoin d’au moins 5 occasions dans chacune des deux fenêtres de 10 parties. Les zéros absents ne sont pas inventés.</span></div></div>;
  return <div className="progress-change-grid">{changes.map(({ domain, delta, direction }) => <article key={domain.category} className={direction.toLowerCase()}><header><span>{domain.label}</span><strong>{signedPoints(delta)}</strong></header><div><b>{percent(domain.previous.successRate)}</b><ArrowRight size={15} /><b>{percent(domain.recent.successRate)}</b></div><p>{direction === "IMPROVEMENT" ? "Progression observée" : direction === "DECLINE" ? "Recul à surveiller" : "Variation légère"}</p><small>Avant : {domain.previous.correctlyTreated}/{domain.previous.opportunities} · Récent : {domain.recent.correctlyTreated}/{domain.recent.opportunities}</small></article>)}</div>;
}

function MiniPosition({ fen, orientation }: { fen: string; orientation: "white" | "black" }) {
  const rows = fen.split(" ")[0].split("/");
  const squares = rows.flatMap((row) => [...row].flatMap((token) => (/\d/.test(token) ? Array.from({ length: Number(token) }, () => "") : [token])));
  const ordered = orientation === "black" ? squares.toReversed() : squares;
  return <div className="progress-mini-board" role="img" aria-label={`Position d’échecs, ${orientation === "white" ? "Blancs" : "Noirs"} en bas`}>{ordered.map((piece, index) => <span key={index} className={(Math.floor(index / 8) + index % 8) % 2 === 0 ? "light" : "dark"}>{PIECES[piece] ?? ""}</span>)}</div>;
}

function acceptedMoves(exercise: TrainingExercise): string[] { return [...new Set([...(exercise.answerContract?.accepted.map((answer) => answer.moveUci) ?? []), ...(exercise.acceptedConceptMoveUcis ?? []), exercise.bestMove].filter(Boolean))]; }
function explanationLines(exercise: TrainingExercise): string[] {
  const explanation = exercise.explanation;
  if (!explanation) return [exercise.prompt];
  return [explanation.problem, explanation.notice, explanation.whyItWorksHere, explanation.plan, explanation.rule].filter((line): line is string => Boolean(line)).filter((line, index, lines) => lines.indexOf(line) === index).slice(0, 3);
}

function EvidencePanel({ concepts, label, exercises, onClose, onTrain }: { concepts: ProgressConcept[]; label: string; exercises: Map<string, TrainingExercise>; onClose: () => void; onTrain: () => void }) {
  const entries = concepts.flatMap((concept) => concept.supportingEvidence.map((evidence) => ({ concept, evidence }))).toSorted((first, second) => Date.parse(second.evidence.occurredAt ?? "") - Date.parse(first.evidence.occurredAt ?? ""));
  const distinctGames = new Set(entries.map(({ evidence }) => evidence.gameId)).size;
  return <section className="progress-evidence-panel" aria-label={`Erreurs et preuves pour ${label}`}><header><div><span>Erreurs et occasions récentes</span><h3>{label}</h3><p>{entries.length} moment{entries.length > 1 ? "s" : ""} validé{entries.length > 1 ? "s" : ""} dans {distinctGames} partie{distinctGames > 1 ? "s" : ""} distincte{distinctGames > 1 ? "s" : ""}, du plus récent au plus ancien.</p></div><button type="button" onClick={onClose} aria-label="Fermer les erreurs"><X size={20} /></button></header><div className="progress-evidence-list">{entries.map(({ concept, evidence }) => { const exercise = exercises.get(evidence.exerciseId); return <article key={`${concept.conceptSlug}:${evidence.evidenceId}`}><div className="evidence-position">{exercise ? <MiniPosition fen={exercise.fen} orientation={exercise.playerColor} /> : <div className="evidence-position-missing">Position historique non conservée dans cette analyse</div>}</div><div className="evidence-story"><div className="evidence-meta"><span className={evidence.reason === "ERROR" ? "error" : "opportunity"}>{evidence.reason === "ERROR" ? "Erreur" : "Occasion"}</span><span>{concept.label}</span><span>{formatDate(evidence.occurredAt)}</span><span>Partie {evidence.gameId}</span></div>{exercise ? <><h4>{exercise.title}</h4><dl><div><dt>Coup joué</dt><dd>{exercise.playedMove ?? "Non conservé"}</dd></div><div><dt>Réponses acceptées</dt><dd>{acceptedMoves(exercise).join(" · ")}</dd></div></dl>{explanationLines(exercise).map((line) => <p key={line}>{line}</p>)}{exercise.gameUrl ? <a href={exercise.gameUrl} target="_blank" rel="noreferrer">Voir la partie <ArrowRight size={14} /></a> : null}</> : <><h4>Moment {evidence.momentId}</h4><p>La preuve validée contribue au profil, mais le détail de cet ancien exercice n’est plus présent dans l’historique chargé.</p></>}</div></article>; })}</div><footer><button className="lime-button" type="button" onClick={onTrain}>M’entraîner sur ce thème <ArrowRight size={16} /></button></footer></section>;
}

function InsightCard({ item, kind, onDetail, onEvidence, onTrain }: { item: ProgressInsight; kind: "strength" | "work"; onDetail: () => void; onEvidence: () => void; onTrain?: () => void }) {
  const volume = conceptVolume(item.concept);
  return <article className={`player-insight-card ${kind}`}><span>{item.label}</span><h3>{item.concept.label}</h3><p>{item.detail}</p><div className="player-insight-stats"><strong>{volume.rate === null ? "—" : `${Math.round(volume.rate * 100)} %`}</strong><small>{volume.opportunities} occasion{volume.opportunities > 1 ? "s" : ""} récente{volume.opportunities > 1 ? "s" : ""}</small></div><div className="player-insight-actions"><button type="button" onClick={onDetail}>Voir le détail</button>{item.concept.supportingEvidence.length ? <button type="button" onClick={onEvidence}><Eye size={15} /> Voir {kind === "work" ? "mes erreurs" : "les preuves"}</button> : null}{kind === "work" && onTrain ? <button type="button" onClick={onTrain}>M’entraîner <ArrowRight size={15} /></button> : null}</div></article>;
}

function ConceptComparison({ concept }: { concept: ProgressConcept }) {
  const comparable = concept.recent.exposures >= PROGRESS_READ_MODEL_POLICY.minimumComparableExposures && concept.previous.exposures >= PROGRESS_READ_MODEL_POLICY.minimumComparableExposures && concept.recent.successRate !== null && concept.previous.successRate !== null;
  if (!comparable) return <p className="progress-comparison-empty">Pas assez d’occasions comparables pour afficher une évolution.</p>;
  const delta = concept.recent.successRate! - concept.previous.successRate!;
  return <div className="progress-concept-comparison"><span>Fenêtre précédente <strong>{percent(concept.previous.successRate)}</strong> · {concept.previous.correctlyTreated}/{concept.previous.exposures}</span><ArrowRight size={14} /><span>Fenêtre récente <strong>{percent(concept.recent.successRate)}</strong> · {concept.recent.correctlyTreated}/{concept.recent.exposures}</span><b className={delta > 0 ? "positive" : delta < 0 ? "negative" : ""}>{signedPoints(delta)}</b></div>;
}

export function ProgressView({ profile, onProfile, onAnalyze, onTrain }: { profile: PersistentProfile | null; onProfile: () => void; onAnalyze: () => void; onTrain: (conceptSlug: string, category: DiagnosticCategory | null, label: string) => void }) {
  const [fixtureName, setFixtureName] = useState<ProgressFixtureName | null>(null);
  const [fixtureModel, setFixtureModel] = useState<ProgressReadModel | null>(null);
  const [openDomain, setOpenDomain] = useState<DiagnosticCategory | null>(null);
  const [openConcept, setOpenConcept] = useState<string | null>(null);
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null);
  const model = fixtureModel ?? profile?.progress;
  const exerciseById = useMemo(() => new Map((profile?.analyses.flatMap((analysis) => analysis.exercises) ?? []).map((exercise) => [exercise.id, exercise])), [profile?.analyses]);
  const strengths = useMemo(() => model ? progressStrengths(model) : [], [model]);
  const workItems = useMemo(() => model ? progressWorkItems(model) : [], [model]);

  useEffect(() => { const requested = developmentFixtureName(new URLSearchParams(window.location.search).get("progressFixture"), process.env.NODE_ENV); if (!requested) return; void import("../domain/progress/progress-read-model.fixtures").then(({ buildProgressFixture }) => { setFixtureName(requested); setFixtureModel(buildProgressFixture(requested)); }); }, []);
  async function selectFixture(value: string) { if (process.env.NODE_ENV !== "development" || value === "REAL") { setFixtureName(null); setFixtureModel(null); return; } const selected = developmentFixtureName(value, process.env.NODE_ENV); if (!selected) return; const { buildProgressFixture } = await import("../domain/progress/progress-read-model.fixtures"); setFixtureName(selected); setFixtureModel(buildProgressFixture(selected)); }
  function openDomainDetails(category: PlayerMapCategory, conceptSlug?: string) { setOpenDomain(category); if (conceptSlug) setOpenConcept(conceptSlug); requestAnimationFrame(() => document.getElementById(`progress-domain-${category}`)?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  function openConceptDetails(concept: ProgressConcept) { if (!concept.category || concept.category === "opening") return; openDomainDetails(concept.category, concept.conceptSlug); }

  if (!profile && !model) return <section className="page-shell empty-state-page"><TrendingUp size={40} /><p className="eyebrow"><span /> Carte du joueur</p><h1>Connecte ton profil pour comprendre l’évolution de ton jeu.</h1><p>ChessPath compare uniquement des parties et des occasions pédagogiques réellement observées.</p><button className="primary-button" type="button" onClick={onProfile}>Créer mon profil <ArrowRight size={16} /></button></section>;
  if (!model) return null;
  const summary = progressSummary(model);
  const evidenceConcepts = evidenceTarget?.type === "concept" ? model.concepts.filter((concept) => concept.conceptSlug === evidenceTarget.slug) : evidenceTarget?.type === "domain" ? model.concepts.filter((concept) => concept.category === evidenceTarget.category && concept.supportingEvidence.length) : [];
  const evidenceLabel = evidenceTarget?.type === "concept" ? evidenceConcepts[0]?.label ?? "Ce concept" : DOMAIN_ORDER.find((domain) => domain.id === evidenceTarget?.category)?.label ?? "Ce domaine";
  const evidenceTrainingConcept = evidenceConcepts.toSorted((first, second) => (first.priority ?? 999) - (second.priority ?? 999))[0];

  return <section className="page-shell player-map-page">
    {process.env.NODE_ENV === "development" ? <label className="progress-fixture-switcher">Prévisualiser<select value={fixtureName ?? "REAL"} onChange={(event) => void selectFixture(event.target.value)}><option value="REAL">Données réelles</option>{DEV_FIXTURE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}</select></label> : null}
    <header className="player-map-hero"><div className="player-map-copy"><p className="eyebrow"><span /> {summary.eyebrow}</p><h1>{summary.title}</h1><p>{summary.description}</p><div className="player-map-confidence"><Clock3 size={16} /><span>{model.uniqueGames} parties uniques analysées</span><i /><span>{model.reevaluation.newGamesNeeded} avant la prochaine lecture</span></div></div><PlayerRadar domains={model.domains} onSelect={openDomainDetails} /></header>
    <section className="player-insights-section"><div className="player-insight-column"><div className="progress-section-heading"><div><span>Points forts</span><h2>Ce que ton jeu confirme.</h2></div></div>{strengths.length ? <div className="player-insight-list">{strengths.map((item) => <InsightCard key={item.concept.conceptSlug} item={item} kind="strength" onDetail={() => openConceptDetails(item.concept)} onEvidence={() => setEvidenceTarget({ type: "concept", slug: item.concept.conceptSlug })} />)}</div> : <div className="player-insight-empty"><Check size={19} /><p>Aucun point fort n’est encore assez observé. ChessPath attend au moins 5 occasions récentes.</p></div>}</div><div className="player-insight-column"><div className="progress-section-heading"><div><span>À travailler</span><h2>Ton prochain levier.</h2></div></div>{workItems.length ? <div className="player-insight-list">{workItems.map((item) => <InsightCard key={item.concept.conceptSlug} item={item} kind="work" onDetail={() => openConceptDetails(item.concept)} onEvidence={() => setEvidenceTarget({ type: "concept", slug: item.concept.conceptSlug })} onTrain={() => onTrain(item.concept.conceptSlug, item.concept.category, item.concept.label)} />)}</div> : <div className="player-insight-empty"><Target size={19} /><p>Aucune faiblesse démontrée ni recommandation assez étayée pour l’instant.</p><button type="button" onClick={onAnalyze}>Analyser des parties</button></div>}</div></section>
    {evidenceTarget && evidenceConcepts.length ? <EvidencePanel concepts={evidenceConcepts} label={evidenceLabel} exercises={exerciseById} onClose={() => setEvidenceTarget(null)} onTrain={() => evidenceTrainingConcept && onTrain(evidenceTrainingConcept.conceptSlug, evidenceTrainingConcept.category, evidenceTrainingConcept.label)} /> : null}
    <section className="progress-v2-section player-evolution-section"><div className="progress-section-heading"><div><span>Ce qui a changé</span><h2>Deux fenêtres comparables, sans faux zéros.</h2></div><small>{model.dataState === "READY" ? "10 parties précédentes → 10 parties récentes" : `Encore ${model.reevaluation.newGamesNeeded} partie${model.reevaluation.newGamesNeeded > 1 ? "s" : ""} avant une tendance fiable`}</small></div><ProgressChanges model={model} /></section>
    <section className="progress-v2-section progress-map-section"><div className="progress-section-heading"><div><span>Explorer par domaine</span><h2>Comprendre chaque sous-thème.</h2></div><small>Ouvre un domaine pour voir les observations réelles</small></div><div className="progress-domain-list">{DOMAIN_ORDER.map((domain) => { const domainProfile = model.domains.find((item) => item.category === domain.id)!; const concepts = model.concepts.filter((concept) => concept.category === domain.id); const open = openDomain === domain.id; const groups = CONCEPT_GROUP_ORDER.map((group) => ({ group, concepts: concepts.filter((concept) => conceptGroup(concept) === group) })).filter((group) => group.concepts.length); const hasEvidence = concepts.some((concept) => concept.supportingEvidence.length); return <article key={domain.id} id={`progress-domain-${domain.id}`}><button type="button" onClick={() => setOpenDomain(open ? null : domain.id)} aria-expanded={open}><strong>{domain.label}</strong><span>{domainProfile.successRate === null ? `${domainProfile.opportunities}/5 occasions récentes · non mesuré` : `${domainProfile.correctlyTreated}/${domainProfile.opportunities} occasions récentes bien traitées · ${percent(domainProfile.successRate)}`}</span>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>{open ? <div className="progress-domain-content">{hasEvidence ? <div className="progress-domain-tools"><button type="button" onClick={() => setEvidenceTarget({ type: "domain", category: domain.id })}><Eye size={14} /> Voir les erreurs du domaine</button></div> : null}<div className="progress-domain-concepts">{groups.length ? groups.map(({ group, concepts: groupedConcepts }) => <section key={group} className="progress-concept-group"><h3>{group}</h3>{groupedConcepts.map((item) => { const conceptOpen = openConcept === item.conceptSlug; const volume = conceptVolume(item); return <div key={item.conceptSlug}><button type="button" onClick={() => setOpenConcept(conceptOpen ? null : item.conceptSlug)} aria-expanded={conceptOpen}><span className={`progress-status ${conceptDisplayStatus(item).toLowerCase().replaceAll(" ", "-")}`}>{conceptDisplayStatus(item)}</span><strong>{item.label}</strong>{conceptOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>{conceptOpen ? <div className="progress-concept-detail"><p>{conceptDefinition(item.conceptSlug)?.shortDescription}</p><div className="progress-concept-stats"><span><strong>{volume.opportunities}</strong> occasions récentes</span><span><strong>{volume.successes}</strong> réussies</span><span><strong>{volume.opportunities - volume.successes}</strong> ratées</span></div><ConceptComparison concept={item} /><nav>{item.supportingEvidence.length ? <button type="button" onClick={() => setEvidenceTarget({ type: "concept", slug: item.conceptSlug })}><Eye size={14} /> Voir les erreurs / preuves</button> : null}<button type="button" onClick={() => onTrain(item.conceptSlug, item.category, item.label)}>M’entraîner <ArrowRight size={14} /></button></nav></div> : null}</div>; })}</section>) : <p>Aucun concept fiable observé dans ce domaine.</p>}</div></div> : null}</article>; })}</div><footer><Sparkles size={15} /> La carte évolue avec les nouvelles occasions observées ; elle ne crée ni Elo de domaine ni score de maîtrise.</footer></section>
  </section>;
}
