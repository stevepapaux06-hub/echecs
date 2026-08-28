"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, KeyRound } from "lucide-react";
import { normalizeAuthError } from "@/infrastructure/supabase/auth-errors";
import { getSupabaseClient } from "@/infrastructure/supabase/client";
import { signOut, updatePassword } from "@/infrastructure/supabase/repository";

const RECOVERY_MARKER = "chesspath-password-recovery";

type RecoveryState = "checking" | "ready" | "submitting" | "success" | "invalid";

function currentAuthParams(): URLSearchParams {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  hash.forEach((value, key) => params.set(key, value));
  return params;
}

export function ResetPasswordView() {
  const [state, setState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(false);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const params = currentAuthParams();
    const urlErrorCode = params.get("error_code");
    const urlError = params.get("error") || params.get("error_description");

    if (urlErrorCode || urlError) {
      sessionStorage.removeItem(RECOVERY_MARKER);
      window.history.replaceState({}, "", "/reset-password");
      queueMicrotask(() => {
        if (!active) return;
        setError(normalizeAuthError({ code: urlErrorCode || "otp_expired", message: urlError }).message);
        setState("invalid");
      });
      return;
    }

    const recoveryInUrl = params.get("type") === "recovery";
    const rememberedRecovery = sessionStorage.getItem(RECOVERY_MARKER) === "1";

    try {
      const supabase = getSupabaseClient();
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        if (event === "PASSWORD_RECOVERY" && session) {
          sessionStorage.setItem(RECOVERY_MARKER, "1");
          setError(null);
          setState("ready");
        }
        if (event === "SIGNED_OUT") {
          sessionStorage.removeItem(RECOVERY_MARKER);
        }
      });
      unsubscribe = () => listener.subscription.unsubscribe();

      void supabase.auth.getSession().then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) {
          setError(normalizeAuthError(sessionError).message);
          setState("invalid");
          return;
        }
        if (data.session && (recoveryInUrl || rememberedRecovery)) {
          sessionStorage.setItem(RECOVERY_MARKER, "1");
          setState("ready");
          return;
        }
        setError("Ce lien a expiré ou a déjà été utilisé.");
        setState("invalid");
      });
    } catch (reason) {
      queueMicrotask(() => {
        if (!active) return;
        setError(normalizeAuthError(reason).message);
        setState("invalid");
      });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function submitNewPassword() {
    if (requestRef.current) return;
    requestRef.current = true;
    setError(null);
    setState("submitting");
    try {
      if (!password) throw new Error("Saisis un nouveau mot de passe.");
      if (password !== confirmation) throw new Error("Les deux mots de passe ne correspondent pas.");
      await updatePassword(password);
      await signOut();
      sessionStorage.removeItem(RECOVERY_MARKER);
      setPassword("");
      setConfirmation("");
      setState("success");
      window.setTimeout(() => {
        window.location.replace("/?auth=login&password=updated");
      }, 900);
    } catch (reason) {
      setError(reason instanceof Error && reason.message
        ? reason.message
        : normalizeAuthError(reason).message);
      setState("ready");
    } finally {
      requestRef.current = false;
    }
  }

  if (state === "checking") {
    return (
      <main className="app-page">
        <section className="page-shell profile-page empty-state-page" aria-live="polite">
          <KeyRound size={30} />
          <p className="eyebrow"><span /> Sécurité du compte</p>
          <h1>Vérification du lien…</h1>
          <p>ChessPath vérifie ta session de récupération.</p>
        </section>
      </main>
    );
  }

  if (state === "invalid") {
    return (
      <main className="app-page">
        <section className="page-shell profile-page empty-state-page">
          <KeyRound size={30} />
          <p className="eyebrow"><span /> Lien de récupération</p>
          <h1>Ce lien n’est plus valide.</h1>
          <p role="alert">{error || "Ce lien a expiré ou a déjà été utilisé."}</p>
          <div className="profile-actions">
            <Link className="primary-button" href="/?auth=forgot">Demander un nouveau lien</Link>
            <Link className="file-button" href="/?auth=login"><ArrowLeft size={15} /> Retour à la connexion</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-page">
      <section className="page-shell profile-page auth-page">
        <div>
          <p className="eyebrow"><span /> Sécurité du compte</p>
          <h1>Choisis ton nouveau<br />mot de passe.</h1>
          <p>Supabase validera les règles de sécurité réellement configurées pour ChessPath.</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void submitNewPassword(); }} className="auth-card">
          <KeyRound size={28} />
          <h2>{state === "success" ? "Mot de passe modifié" : "Nouveau mot de passe"}</h2>
          {state === "success" ? (
            <p className="auth-success" role="status">Mot de passe modifié. Retour à la connexion…</p>
          ) : (
            <>
              <label htmlFor="reset-password">Nouveau mot de passe</label>
              <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={state === "submitting"} />
              <label htmlFor="reset-password-confirmation">Confirmer le mot de passe</label>
              <input id="reset-password-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={state === "submitting"} />
              <button className="primary-button" type="submit" disabled={state === "submitting"}>
                {state === "submitting" ? "Modification…" : "Modifier mon mot de passe"} <ArrowRight size={16} />
              </button>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
            </>
          )}
        </form>
      </section>
    </main>
  );
}
