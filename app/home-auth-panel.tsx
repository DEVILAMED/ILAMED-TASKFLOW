"use client";

import Link from "next/link";
import { useState } from "react";
import LoginForm from "@/app/login/login-form";
import RegisterForm from "@/app/register/register-form";

type AuthMode = "login" | "register";

export default function HomeAuthPanel() {
  const [mode, setMode] = useState<AuthMode>("login");
  const isLogin = mode === "login";

  return (
    <section className="panel-card w-full rounded-[30px] p-6 sm:p-8" aria-labelledby="home-auth-title">
      <div className="grid grid-cols-2 rounded-xl border border-[var(--stroke)] bg-[var(--panel-soft)] p-1" role="tablist" aria-label="Account access">
        <button
          type="button"
          role="tab"
          aria-selected={isLogin}
          aria-controls="home-auth-panel"
          onClick={() => setMode("login")}
          className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
            isLogin ? "bg-[var(--panel-strong)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--stroke)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isLogin}
          aria-controls="home-auth-panel"
          onClick={() => setMode("register")}
          className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
            !isLogin ? "bg-[var(--panel-strong)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--stroke)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Create account
        </button>
      </div>

      <div id="home-auth-panel" role="tabpanel" className="mt-7">
        <p className="section-kicker">{isLogin ? "Employee workspace" : "Join the workspace"}</p>
        <h2 id="home-auth-title" className="display-font mt-2 text-3xl text-slate-900">
          {isLogin ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {isLogin
            ? "Sign in to view your assigned work and update your progress."
            : "Create an account to receive tasks assigned by your administrator."}
        </p>

        <div className="mt-6">
          {isLogin ? <LoginForm /> : <RegisterForm />}
        </div>

        <p className="mt-5 text-center text-xs text-slate-500">
          {isLogin ? (
            <>
              Need an account?{" "}
              <button type="button" onClick={() => setMode("register")} className="font-semibold text-indigo-600 hover:text-indigo-800">
                Create one
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button type="button" onClick={() => setMode("login")} className="font-semibold text-indigo-600 hover:text-indigo-800">
                Sign in
              </button>
            </>
          )}
        </p>
        <Link href="https://www.ilamed.org/" target="_blank" rel="noreferrer" className="mt-4 block text-center text-xs text-slate-400 transition hover:text-indigo-600">
          Visit ilamed.org
        </Link>
      </div>
    </section>
  );
}
