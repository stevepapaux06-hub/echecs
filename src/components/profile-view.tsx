"use client";

import { useState } from "react";
import { ArrowRight, CalendarDays, CloudDownload, FileUp, LogOut, Mail, RefreshCw } from "lucide-react";
import type { AnalysisHistoryItem, PersistentProfile } from "@/infrastructure/supabase/repository";
import { sendMagicLink, signOut } from "@/infrastructure/supabase/repository";

export function ProfileView({
  profile,
  loading,
  onSync,
  onNewAnalysis,
  onImport,
  onOpenAnalysis,
}: {
  profile: PersistentProfile | null;
  loading: boolean;
  onSync: () => void;
  onNewAnalysis: () => void;
  onImport: () => void;
  onOpenAnalysis: (analysis: AnalysisHistoryItem) => void;
}) {
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  async function requestLink() {
    setAuthError(null);
    setAuthMessage(null);
    try {
      await sendMagicLink(email.trim());
      setAuthMessage("Lien envoyé. Ouvre ton e-mail puis reviens ici : ton profil sera conservé.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Le lien n’a pas pu être envoyé.");
    }
  }

  if (loading) {
    return <section className="page-shell profile-page"><p className="eyebrow"><span /> Profil</p><h1>Chargement de ton historique…</h1></section>;
  }

  if (!profile) {
    return (
      <section className="page-shell profile-page auth-page">
        <div>
          <p className="eyebrow"><span /> Profil permanent</p>
          <h1>Retrouve ton parcours,<br />même demain.</h1>
          <p>Reçois un lien de connexion par e-mail. Aucun mot de passe à mémoriser et aucune donnée n’est partagée entre joueurs.</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void requestLink(); }} className="auth-card">
          <Mail size={28} />
          <label htmlFor="auth-email">Ton adresse e-mail</label>
          <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="toi@exemple.com" required />
          <button className="primary-button" type="submit">Recevoir mon lien <ArrowRight size={16} /></button>
          {authMessage ? <p className="auth-success">{authMessage}</p> : null}
          {authError ? <p className="form-error">{authError}</p> : null}
          <small>Supabase Free conserve tes parties et analyses. Le lien sert uniquement à retrouver ton profil.</small>
        </form>
      </section>
    );
  }

  const chess = profile.chess;
  const latest = profile.analyses[0];
  return (
    <section className="page-shell profile-page">
      <header className="page-heading">
        <div><p className="eyebrow"><span /> Profil permanent</p><h1>{chess ? `Le parcours de ${chess.displayName}.` : "Ton espace ChessPath."}</h1></div>
        <button className="text-button" type="button" onClick={() => void signOut()}><LogOut size={15} /> Se déconnecter</button>
      </header>

      <div className="profile-kpis">
        <article><span>Parties enregistrées</span><strong>{profile.games.length}</strong><small>Chess.com et PGN, sans doublons</small></article>
        <article><span>Analyses conservées</span><strong>{profile.analyses.length}</strong><small>Chaque diagnostic reste accessible</small></article>
        <article><span>Exercices terminés</span><strong>{profile.attempts}</strong><small>Performance d’entraînement</small></article>
      </div>

      <div className="profile-grid">
        <article className="panel identity-card">
          <span className="section-kicker">Identité échiquéenne</span>
          <h2>{chess?.username || "Pseudo à synchroniser"}</h2>
          <div className="rating-grid">
            <div><small>Rapid</small><strong>{chess?.ratings?.rapid ?? "—"}</strong></div>
            <div><small>Blitz</small><strong>{chess?.ratings?.blitz ?? "—"}</strong></div>
            <div><small>Bullet</small><strong>{chess?.ratings?.bullet ?? "—"}</strong></div>
          </div>
          <div className="profile-actions">
            <button className="primary-button" type="button" onClick={onSync}><RefreshCw size={15} /> Synchroniser mes nouvelles parties</button>
            <button className="file-button" type="button" onClick={onNewAnalysis}>Nouvelle analyse</button>
            <button className="file-button" type="button" onClick={onImport}><FileUp size={15} /> Importer un PGN</button>
          </div>
        </article>

        <article className="panel latest-analysis">
          <span className="section-kicker">Dernière analyse</span>
          {latest ? (
            <>
              <CalendarDays size={24} />
              <h2>{new Intl.DateTimeFormat("fr-CH", { dateStyle: "long" }).format(new Date(latest.createdAt))}</h2>
              <p>{latest.title}</p>
              <button className="text-button" type="button" onClick={() => onOpenAnalysis(latest)}>Rouvrir le diagnostic <ArrowRight size={15} /></button>
            </>
          ) : <p>Lance une première analyse pour créer ton historique.</p>}
        </article>
      </div>

      <div className="profile-history panel">
        <div className="panel-heading"><div><span>Historique des analyses</span><h2>Rien n’est écrasé.</h2></div><small>{profile.analyses.length} analyse{profile.analyses.length > 1 ? "s" : ""}</small></div>
        <div className="history-list">
          {profile.analyses.length ? profile.analyses.map((analysis) => (
            <button type="button" key={analysis.id} onClick={() => onOpenAnalysis(analysis)}>
              <CalendarDays size={17} />
              <span><strong>{analysis.title}</strong><small>{new Intl.DateTimeFormat("fr-CH").format(new Date(analysis.createdAt))}</small></span>
              <ArrowRight size={16} />
            </button>
          )) : <p>Aucune analyse sauvegardée pour l’instant.</p>}
        </div>
      </div>

      <div className="saved-games panel">
        <div className="panel-heading"><div><span>Parties enregistrées</span><h2>Les dernières parties de ton profil.</h2></div><CloudDownload size={20} /></div>
        <div className="games-table">
          {profile.games.slice(0, 12).map((game) => (
            <div key={game.id}>
              <span>{game.source === "pgn" ? "PGN" : "Chess.com"}</span>
              <strong>vs {game.opponent}</strong>
              <small>{game.timeClass || "Cadence inconnue"} · {game.result || "résultat inconnu"}</small>
            </div>
          ))}
          {!profile.games.length ? <p>Aucune partie enregistrée.</p> : null}
        </div>
      </div>
    </section>
  );
}
