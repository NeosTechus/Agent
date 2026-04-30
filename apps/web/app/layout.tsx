import type { Metadata } from "next";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/providers/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Receptionist",
  description: "An AI receptionist that answers your phone 24/7.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-ink antialiased">
        <QueryProvider>
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              className: "font-sans",
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
