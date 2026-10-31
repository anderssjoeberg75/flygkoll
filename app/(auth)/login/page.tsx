import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { login } from "../actions";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  const n = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (n === 0) redirect("/register");
  return (
    <AuthForm
      mode="login"
      action={login}
      footer={process.env.FLYGKOLL_OPEN_SIGNUP === "1" ? <p className="small muted">Inget konto? <Link href="/register">Registrera dig</Link></p> : null}
    />
  );
}
