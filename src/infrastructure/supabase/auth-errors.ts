export type AuthUserErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "email_rate_limit"
  | "rate_limited"
  | "weak_password"
  | "invalid_email"
  | "expired_link"
  | "network"
  | "signup_neutral"
  | "unexpected";

export class AuthUserError extends Error {
  readonly code: AuthUserErrorCode;

  constructor(code: AuthUserErrorCode, message: string) {
    super(message);
    this.name = "AuthUserError";
    this.code = code;
  }
}

function authErrorDetails(reason: unknown): { code: string; status: number | null; normalized: string } {
  const error = reason && typeof reason === "object" ? reason as Record<string, unknown> : null;
  const code = typeof error?.code === "string" ? error.code : "";
  const status = typeof error?.status === "number" ? error.status : null;
  const message = reason instanceof Error
    ? reason.message
    : typeof error?.message === "string"
      ? error.message
      : "";
  const name = reason instanceof Error ? reason.name : "";

  return {
    code,
    status,
    normalized: `${code} ${name} ${message}`.toLowerCase(),
  };
}

export function normalizeAuthError(reason: unknown): AuthUserError {
  if (reason instanceof AuthUserError) return reason;

  const { code, status, normalized } = authErrorDetails(reason);
  if (code === "invalid_credentials" || normalized.includes("invalid login credentials")) {
    return new AuthUserError("invalid_credentials", "Adresse email ou mot de passe incorrect.");
  }
  if (code === "email_not_confirmed" || normalized.includes("email not confirmed")) {
    return new AuthUserError("email_not_confirmed", "Ton adresse email n’est pas encore confirmée.");
  }
  if (code === "over_email_send_rate_limit") {
    return new AuthUserError(
      "email_rate_limit",
      "Un email vient déjà d’être demandé. Attends environ une minute avant de réessayer.",
    );
  }
  if (code === "over_request_rate_limit" || status === 429 || normalized.includes("rate limit")) {
    return new AuthUserError("rate_limited", "Trop de demandes ont été envoyées. Réessaie un peu plus tard.");
  }
  if (code === "weak_password" || normalized.includes("password should be")) {
    return new AuthUserError(
      "weak_password",
      "Ce mot de passe ne respecte pas les règles de sécurité configurées pour ChessPath.",
    );
  }
  if (
    code === "otp_expired"
    || code === "bad_jwt"
    || code === "session_not_found"
    || normalized.includes("token has expired")
    || normalized.includes("invalid token")
  ) {
    return new AuthUserError("expired_link", "Ce lien a expiré ou a déjà été utilisé.");
  }
  if (code === "email_address_invalid" || normalized.includes("invalid email")) {
    return new AuthUserError("invalid_email", "Saisis une adresse email valide.");
  }
  if (code === "user_already_exists" || normalized.includes("already registered")) {
    return new AuthUserError(
      "signup_neutral",
      "Si cette adresse nécessite une confirmation, un email a été envoyé. Si tu as déjà un compte, connecte-toi ou utilise Mot de passe oublié.",
    );
  }
  if (
    normalized.includes("authretryablefetcherror")
    || normalized.includes("failed to fetch")
    || normalized.includes("network")
  ) {
    return new AuthUserError(
      "network",
      "La connexion au service de compte a échoué. Vérifie ton réseau puis réessaie.",
    );
  }

  return new AuthUserError("unexpected", "Le service de connexion n’a pas pu terminer cette action.");
}
