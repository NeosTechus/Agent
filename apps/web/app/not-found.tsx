import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          Page not found
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          The page you're looking for doesn't exist or has moved.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Go home
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-5 text-sm font-medium text-ink hover:bg-surface"
          >
            Contact us
          </Link>
        </div>
      </div>
    </main>
  );
}
