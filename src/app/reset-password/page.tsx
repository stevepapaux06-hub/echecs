import type { Metadata } from "next";
import { ResetPasswordView } from "@/components/reset-password-view";

export const metadata: Metadata = {
  title: "Modifier mon mot de passe — ChessPath",
  description: "Choisis un nouveau mot de passe pour ton compte ChessPath.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordView />;
}
