import { EmptyState, Button } from "@/components/ui";

export default function TeamPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Team</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Invite teammates and manage who has access to your account.
        </p>
      </div>
      <EmptyState
        title="It's just you for now"
        description="Invite a teammate to help review calls, update your knowledge base, or manage billing."
        action={<Button>Invite teammate</Button>}
      />
    </div>
  );
}
