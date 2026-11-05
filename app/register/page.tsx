import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/app/auth-frame";
import { getCurrentUser } from "@/lib/auth";
import RegisterForm from "./register-form";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.role === "ADMIN" ? "/admin" : user.role === "MANAGER" ? "/manager" : "/company-tasks");
  }

  return (
    <AuthFrame
      eyebrow="Create account"
      title="Get started"
      description="Create your account to receive company task assignments and keep your progress up to date."
      footer={
        <p>
          Already have an account?{" "}
          <Link className="font-semibold text-[var(--accent)] transition hover:text-white" href="/login">
            Sign in
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthFrame>
  );
}
