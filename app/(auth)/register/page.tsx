import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { ClearOfflineCache } from "@/components/ClearOfflineCache";
import { register } from "../actions";
import { db } from "@/lib/db";

export default function RegisterPage() {
  const n = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  return (
    <>
      <ClearOfflineCache />
      <AuthForm
        mode="register"
        action={register}
        footer={
          <p className="small muted">
            {n === 0 ? "Första kontot blir administratör för organisationen." : <>Har du konto? <Link href="/login">Logga in</Link></>}
          </p>
        }
      />
    </>
  );
}
