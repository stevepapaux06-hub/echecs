"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CloudDownload,
  KeyRound,
  Link2,
  LogOut,
  Mail,
  RefreshCw,
  Unlink,
  UserRound,
} from "lucide-react";
import type { AnalysisHistoryItem, PersistentProfile } from "@/infrastructure/supabase/repository";
import {
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updatePassword,
} from "@/infrastructure/supabase/repository";

type AuthMode = "sign-in" | "sign-up" | "forgot";

function errorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    const message = (reason as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function ProfileView({
  user,
  profile,
  loading,
  profileError,
  passwordRecovery,
  onPasswordRecovered,
  onRetryProfile,
  onSync,
  onLinkChess,
  onUnlinkChess,
  onOpenAnalysis,
}: {
  user: User | null;
  profile: PersistentProfile | null;
  loading: boolean;
  profileError: string | null;
  passwordRecovery: boolean;
  onPasswordRecovered: () => void;
  onRetryProfile: () => Promise<void>;
  onSync: () => Promise<void>;
  onLinkChess: (username: string) => Promise<void>;
  onUnlinkChess: () => Promise<void>;
  onOpenAnalysis: (analysis: AnalysisHistoryItem) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [chessUsername, setChessUsername] = useState(profile?.chess?.username ?? "");
  const [editingChess, setEditingChess] = useState(!profile?.chess);
  const [profileActionError, setProfileActionError] = useState<string | null>(null);
  const [profileActionBusy, setProfileActionBusy] = useState(false);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setAuthError(null);
    setAuthMessage(null);
    setPassword("");
    setPasswordConfirmation("");
  }

  async function submitAuth() {
    setAuthBusy(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "forgot") {
        await requestPasswordReset(normalizedEmail);
        setAuthMessage("Si ce compte existe, un lien de réinitialisation vient d’être envoyé.");
      } else if (mode === "sign-up") {
        if (password.length < 8) throw new Error("Choisis un mot de passe d’au moins 8 caractères.");
        if (password !== passwordConfirmation) throw new Error("Les deux mots de passe ne correspondent pas.");
        const connected = await signUpWithPassword(normalizedEmail, password);
        if (!connected) {
          setAuthMessage("Compte créé. Confirme ton adresse e-mail, puis connecte-toi avec ton mot de passe.");
        }
      } else {
        await signInWithPassword(normalizedEmail, password);
      }
    } catch (reason) {
      setAuthError(errorMessage(reason, "La connexion n’a pas pu aboutir."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitNewPassword() {
    setAuthBusy(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      if (password.length < 8) throw new Error("Choisis un mot de passe d’au moins 8 caractères.");
      if (password !== passwordConfirmation) throw new Error("Les deux mots de passe ne correspondent pas.");
      await updatePassword(password);
      window.history.replaceState({}, "", window.location.pathname);
      onPasswordRecovered();
      setPassword("");
      setPasswordConfirmation("");
      setAuthMessage("Ton nouveau mot de passe est enregistré.");
    } catch (reason) {
      setAuthError(errorMessage(reason, "Le mot de passe n’a pas pu être modifié."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function runProfileAction(action: () => Promise<void>, fallback: string) {
    setProfileActionBusy(true);
    setProfileActionError(null);
    try {
      await action();
    } catch (reason) {
      setProfileActionError(errorMessage(reason, fallback));
    } finally {
      setProfileActionBusy(false);
    }
  }

  if (passwordRecovery) {
    return (
      <section className="page-shell profile-page auth-page">
        <div>
          <p className="eyebrow"><span /> Sécurité du compte</p>
          <h1>Choisis ton nouveau<br />mot de passe.</h1>
          <p>Une fois enregistré, il fonctionnera sur ordinateur comme sur mobile.</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void submitNewPassword(); }} className="auth-card">
          <KeyRound size={28} />
          <label htmlFor="new-password">Nouveau mot de passe</label>
          <input id="new-password" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <label htmlFor="confirm-new-password">Confirmer le mot de passe</label>
          <input id="confirm-new-password" type="password" minLength={8} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required />
          <button className="primary-button" type="submit" disabled={authBusy}>{authBusy ? "Enregistrement…" : "Enregistrer mon mot de passe"} <ArrowRight size={16} /></button>
          {authMessage ? <p className="auth-success" role="status">{authMessage}</p> : null}
          {authError ? <p className="form-error" role="alert">{authError}</p> : null}
        </form>
      </section>
    );
  }

  if (loading) {
    return <section className="page-shell profile-page"><p className="eyebrow"><span /> Profil</p><h1>Chargement de ton historique…</h1></section>;
  }

  if (!user) {
    const signingUp = mode === "sign-up";
    const forgot = mode === "forgot";
    return (
      <section className="page-shell profile-page auth-page">
        <div>
          <p className="eyebrow"><span /> Profil permanent</p>
          <h1>Retrouve ton parcours,<br />sur tous tes appareils.</h1>
          <p>Connecte-toi par e-mail et mot de passe. Ta session reste enregistrée sur cet appareil jusqu’à ta déconnexion.</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void submitAuth(); }} className="auth-card">
          {forgot ? <KeyRound size={28} /> : <Mail size={28} />}
          <h2>{forgot ? "Mot de passe oublié" : signingUp ? "Créer mon compte" : "Se connecter"}</h2>
          <label htmlFor="auth-email">Adresse e-mail</label>
          <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="toi@exemple.com" required />
          {!forgot ? (
            <>
              <label htmlFor="auth-password">Mot de passe</label>
              <input id="auth-password" type="password" minLength={signingUp ? 8 : undefined} autoComplete={signingUp ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </>
          ) : null}
          {signingUp ? (
            <>
              <label htmlFor="auth-password-confirmation">Confirmer le mot de passe</label>
              <input id="auth-password-confirmation" type="password" minLength={8} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required />
            </>
          ) : null}
          <button className="primary-button" type="submit" disabled={authBusy}>
            {authBusy ? "Un instant…" : forgot ? "Envoyer le lien" : signingUp ? "Créer mon compte" : "Se connecter"} <ArrowRight size={16} />
          </button>
          {!forgot ? <button className="auth-link" type="button" onClick={() => changeMode("forgot")}>Mot de passe oublié ?</button> : null}
          <button className="auth-link" type="button" onClick={() => changeMode(signingUp || forgot ? "sign-in" : "sign-up")}>
            {signingUp || forgot ? <><ArrowLeft size={13} /> Retour à la connexion</> : "Pas encore de compte ? Créer mon profil"}
          </button>
          {authMessage ? <p className="auth-success" role="status">{authMessage}</p> : null}
          {authError ? <p className="form-error" role="alert">{authError}</p> : null}
          <small>Ton mot de passe est géré par Supabase. ChessPath ne te demandera jamais ton mot de passe Chess.com.</small>
        </form>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="page-shell profile-page empty-state-page">
        <UserRound size={30} />
        <p className="eyebrow"><span /> Profil connecté</p>
        <h1>Ton compte est connecté, mais son historique n’a pas pu être chargé.</h1>
        <p>{profileError || "Une erreur réseau temporaire a empêché le chargement."}</p>
        <div className="profile-actions">
          <button className="primary-button" type="button" onClick={() => void runProfileAction(onRetryProfile, "Le profil n’a pas pu être rechargé.")} disabled={profileActionBusy}>Réessayer</button>
          <button className="file-button" type="button" onClick={() => void runProfileAction(signOut, "La déconnexion n’a pas pu aboutir.")} disabled={profileActionBusy}><LogOut size={15} /> Se déconnecter</button>
        </div>
        {profileActionError ? <p className="form-error" role="alert">{profileActionError}</p> : null}
      </section>
    );
  }

  const chess = profile.chess;
  const latest = profile.analyses[0];
  return (
    <section className="page-shell profile-page">
      <header className="page-heading">
        <div><p className="eyebrow"><span /> Profil permanent</p><h1>{chess ? `Le parcours de ${chess.displayName}.` : "Ton espace ChessPath."}</h1><p className="account-email"><Mail size={14} /> {profile.user.email || user.email || "E-mail non disponible"}</p></div>
        <button className="text-button" type="button" onClick={() => void runProfileAction(signOut, "La déconnexion n’a pas pu aboutir.")} disabled={profileActionBusy}><LogOut size={15} /> Se déconnecter</button>
      </header>

      <div className="profile-kpis">
        <article><span>Parties enregistrées</span><strong>{profile.games.length}</strong><small>Chess.com et PGN, sans doublons</small></article>
        <article><span>Analyses conservées</span><strong>{profile.analyses.length}</strong><small>Chaque diagnostic reste accessible</small></article>
        <article><span>Exercices terminés</span><strong>{profile.attempts}</strong><small>Performance d’entraînement</small></article>
      </div>

      <div className="profile-grid">
        <article className="panel identity-card">
          <span className="section-kicker">Compte Chess.com lié</span>
          <h2>{chess?.username || "Aucun compte lié"}</h2>
          <div className="rating-grid">
            <div><small>Elo Rapid</small><strong>{chess?.ratings?.rapid ?? "—"}</strong></div>
            <div><small>Elo Blitz</small><strong>{chess?.ratings?.blitz ?? "—"}</strong></div>
            <div><small>Elo Bullet</small><strong>{chess?.ratings?.bullet ?? "—"}</strong></div>
          </div>

          {editingChess ? (
            <form className="chess-link-form" onSubmit={(event) => {
              event.preventDefault();
              void runProfileAction(async () => {
                await onLinkChess(chessUsername.trim());
                setEditingChess(false);
              }, "Le compte Chess.com n’a pas pu être lié.");
            }}>
              <label htmlFor="linked-chess-username">Pseudo public Chess.com</label>
              <input id="linked-chess-username" value={chessUsername} onChange={(event) => setChessUsername(event.target.value)} placeholder="ex. hikaru" autoComplete="off" required />
              <div>
                <button className="primary-button" type="submit" disabled={profileActionBusy || !chessUsername.trim()}><Link2 size={15} /> {profileActionBusy ? "Vérification…" : "Lier ce compte"}</button>
                {chess ? <button className="file-button" type="button" onClick={() => { setChessUsername(chess.username); setEditingChess(false); }}>Annuler</button> : null}
              </div>
              <small>Seul le pseudo public est utilisé. Ne saisis jamais ton mot de passe Chess.com.</small>
            </form>
          ) : (
            <div className="profile-actions">
              <button className="primary-button" type="button" onClick={() => void runProfileAction(onSync, "La synchronisation n’a pas pu aboutir.")} disabled={profileActionBusy}><RefreshCw size={15} /> Synchroniser mes parties</button>
              <button className="file-button" type="button" onClick={() => setEditingChess(true)} disabled={profileActionBusy}>Changer de compte Chess.com</button>
              <button className="danger-button" type="button" onClick={() => void runProfileAction(async () => {
                await onUnlinkChess();
                setChessUsername("");
                setEditingChess(true);
              }, "Le compte Chess.com n’a pas pu être délié.")} disabled={profileActionBusy}><Unlink size={15} /> Délier Chess.com</button>
            </div>
          )}
          {profileActionError ? <p className="form-error" role="alert">{profileActionError}</p> : null}
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
