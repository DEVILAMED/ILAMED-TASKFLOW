import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/app/auth-frame";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.role === "ADMIN" ? "/admin" : user.role === "MANAGER" ? "/manager" : "/company-tasks");
  }

  return (
    <AuthFrame
      eyebrow="Sign in"
      title="Welcome back"
      description="See the tasks assigned to you, check due dates, and update your progress."
      footer={
        <p>
          New here?{" "}
          <Link className="font-semibold text-[var(--accent)] transition hover:text-white" href="/register">
            Create an account
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthFrame>
  );
}
