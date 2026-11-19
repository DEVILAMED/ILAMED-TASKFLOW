import type { Metadata } from "next";
import "./globals.css";
import "@fontsource-variable/inter";

export const metadata: Metadata = {
  title: {
    default: "ILAMED",
    template: "%s | ILAMED",
  },
  description:
    "The ILAMED employee workspace for assigned tasks, due dates, checklists, and progress tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var theme="light";try{if(localStorage.getItem("ilamed-theme")==="dark")theme="dark"}catch{}document.documentElement.dataset.theme=theme})()` }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
