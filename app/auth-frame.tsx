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
    <main className="auth-theme relative px-4 py-5 sm:px-6 sm:py-10">
      <div className="mx-auto mb-5 flex max-w-xl items-center justify-between gap-4 lg:absolute lg:right-5 lg:top-5 lg:z-10 lg:m-0 lg:max-w-none">
        <Link href="/" className="auth-mobile-brand block min-w-0 rounded-lg p-2 lg:hidden">
          <Image src="/company-logo.png" alt="ILAMED home" width={2164} height={746} className="h-auto w-40 max-w-full sm:w-48" priority />
        </Link>
        <div className="shrink-0"><ThemeToggle /></div>
      </div>
      <div className="auth-card mx-auto grid max-w-xl overflow-hidden rounded-[20px] border border-white/[0.08] shadow-[0_24px_64px_rgba(30,41,59,0.09)] backdrop-blur sm:rounded-[32px] lg:max-w-6xl lg:grid-cols-[0.95fr_1.05fr]">
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

        <section className="flex min-w-0 items-center p-5 sm:p-8 lg:p-10">
          <div className="mx-auto w-full max-w-xl">
            <p className="section-kicker">{eyebrow}</p>
            <h1 className="display-font mt-3 text-[32px] leading-[1.15] text-white/94 sm:mt-4 sm:text-[40px] lg:text-5xl lg:leading-[1.04]">
              {title}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/48 lg:mt-4 lg:leading-7">
              {description}
            </p>

            <div className="mt-6 lg:mt-8 lg:rounded-[30px] lg:border lg:border-[var(--stroke)] lg:bg-[var(--panel)] lg:p-7 lg:shadow-sm">
              {children}
            </div>

            <div className="mt-5 text-sm text-white/45">{footer}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
