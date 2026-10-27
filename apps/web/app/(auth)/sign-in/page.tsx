import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in — Drishya" };

export default async function SignInPage() {
  if (await getSession()) redirect("/workspace");
  return <AuthForm mode="sign-in" />;
}
