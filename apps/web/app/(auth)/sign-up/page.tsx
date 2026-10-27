import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Create an account — Drishya" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/workspace");
  return <AuthForm mode="sign-up" />;
}
