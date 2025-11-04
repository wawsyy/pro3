import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Encrypted Random Selector",
  description: "Privacy-preserving random selection powered by FHEVM with enhanced security features",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        <Providers>
          <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-12 pt-8">
            <TopNav />
            <div className="mt-8 flex-1">{children}</div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
