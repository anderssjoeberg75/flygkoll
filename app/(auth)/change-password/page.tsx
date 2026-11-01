import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!user.must_change_password) redirect("/");
  return <ChangePasswordForm email={user.email} />;
}
