import { oauthStartUrl } from "@/lib/auth";

/**
 * OAuth provider buttons. These are plain anchor tags — full-page navigation
 * is required so the browser follows the backend redirect chain to the IdP.
 * Do NOT switch this to fetch().
 */
export function OAuthButtons() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <a
        href={oauthStartUrl("google")}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <GoogleIcon className="h-4 w-4" />
        Google
      </a>
      <a
        href={oauthStartUrl("microsoft")}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <MicrosoftIcon className="h-4 w-4" />
        Microsoft
      </a>
    </div>
  );
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-white px-2 text-ink-subtle">{label}</span>
      </div>
    </div>
  );
}

// Brand-mark icons inlined as SVG — avoids pulling a logo package.
// lucide-react has no Google/Microsoft glyphs; these are the official marks.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5 6.7 2.5 2.4 6.8 2.4 12.1S6.7 21.7 12 21.7c6.9 0 9.5-4.8 9.5-7.3 0-.5-.05-.9-.12-1.3H12z"
      />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
      <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
      <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
      <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
    </svg>
  );
}
