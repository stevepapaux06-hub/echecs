import { describe, expect, it } from "vitest";
import { AuthUserError, normalizeAuthError } from "./auth-errors";

describe("normalizeAuthError", () => {
  it.each([
    ["invalid_credentials", "Adresse email ou mot de passe incorrect."],
    ["email_not_confirmed", "Ton adresse email n’est pas encore confirmée."],
    ["over_email_send_rate_limit", "Un email vient déjà d’être demandé. Attends environ une minute avant de réessayer."],
    ["over_request_rate_limit", "Trop de demandes ont été envoyées. Réessaie un peu plus tard."],
    ["weak_password", "Ce mot de passe ne respecte pas les règles de sécurité configurées pour ChessPath."],
    ["otp_expired", "Ce lien a expiré ou a déjà été utilisé."],
  ])("traduit %s sans exposer l’objet Supabase", (code, message) => {
    const error = normalizeAuthError({ code, message: { private: "objet technique" } });
    expect(error).toBeInstanceOf(AuthUserError);
    expect(error.message).toBe(message);
    expect(error.message).not.toContain("[object Object]");
  });

  it("distingue le cooldown email d’une autre erreur 429", () => {
    expect(normalizeAuthError({ status: 429 }).message).toBe(
      "Trop de demandes ont été envoyées. Réessaie un peu plus tard.",
    );
  });

  it("retourne un message neutre pour une erreur inconnue", () => {
    expect(normalizeAuthError({ secret: "ne doit jamais être affiché" }).message).toBe(
      "Le service de connexion n’a pas pu terminer cette action.",
    );
  });
});
