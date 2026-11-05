import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import ThemeToggle from "@/app/theme-toggle";

type AuthFrameProps = {
  eyebrow: string;
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
};

export function AuthFrame({
  eyebrow,
  title,
  description,
  footer,
  children,
}: AuthFrameProps) {
  return (
    <main className="auth-theme relative px-6 py-10">
      <div className="absolute right-5 top-5 z-10"><ThemeToggle /></div>
      <div className="auth-card mx-auto grid max-w-6xl overflow-hidden rounded-[32px] border border-white/[0.08] shadow-[0_24px_64px_rgba(30,41,59,0.09)] backdrop-blur lg:grid-cols-[0.95fr_1.05fr]">
        <section className="panel-card hidden rounded-none border-0 border-r border-white/[0.08] p-8 lg:flex lg:flex-col">
          <div className="surface-grid absolute inset-0 opacity-[0.08]" />
          <div>
            <Link href="/" className="block w-fit rounded bg-white">
              <Image src="/company-logo.png" alt="ILAMED International institutional logo" width={2164} height={746} className="h-auto w-[min(100%,360px)] object-contain" priority />
            </Link>
            <p className="section-kicker mt-12">Workspace access</p>
            <h2 className="display-font mt-5 max-w-xl text-5xl leading-[1.05] text-white/94">
              Shaping Aesthetic Education Through Quality Training, Clinical Excellence and Trusted Expertise.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-white/50">
              Institute of Laser &amp; Aesthetic Medicine Training
            </p>
          </div>
        </section>

        <section className="flex items-center p-8 sm:p-10">
          <div className="mx-auto w-full max-w-xl">
            <p className="section-kicker">{eyebrow}</p>
            <h1 className="display-font mt-4 text-5xl leading-[1.04] text-white/94">
              {title}
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-7 text-white/48">
              {description}
            </p>

            <div className="panel-card mt-8 rounded-[30px] p-6 sm:p-7">
              {children}
            </div>

            <div className="mt-5 text-sm text-white/45">{footer}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
