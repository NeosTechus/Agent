"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Spinner,
} from "@/components/ui";
import { queryKeys } from "@/lib/query-keys";
import { deleteDoc, listDocs, uploadDoc, type KbDoc } from "@/lib/knowledge-base";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

const ACCEPTED =
  ".pdf,.docx,.txt,.md,.json,.csv," +
  "application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "text/plain,text/markdown,application/json,text/csv";

export default function KnowledgeBasePage() {
  const qc = useQueryClient();
  // V1 — single business per org. The first business in the org is implicit.
  // When multi-location lands, this picks up a selector.
  const businessId = React.useMemo(
    () =>
      (typeof window !== "undefined"
        ? window.localStorage.getItem("active_business_id")
        : null) ?? "",
    [],
  );

  const docsQuery = useQuery({
    queryKey: queryKeys.kb.list(businessId || undefined),
    queryFn: () => listDocs(businessId || undefined).then((r) => r.documents),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      if (!businessId) {
        return Promise.reject(
          new Error(
            "Set active business in onboarding before uploading knowledge base files.",
          ),
        );
      }
      return uploadDoc(businessId, file);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.kb.all });
      toast.success("Document uploaded — indexing in background.");
    },
    onError: (e) => toast.error((e as Error).message ?? "Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDoc(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.kb.all });
      toast.success("Document removed.");
    },
    onError: (e) => toast.error((e as Error).message ?? "Delete failed"),
  });

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const HeaderBar = (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Knowledge base</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Upload menus, FAQs, and other documents your agent should reference. PDF, DOCX, Markdown, and plaintext supported. 50&nbsp;MB max per file.
        </p>
      </div>
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={onFilePicked}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? <Spinner /> : "Upload document"}
        </Button>
      </div>
    </div>
  );

  if (docsQuery.isLoading) return <LoadingState title="Loading documents…" />;
  if (docsQuery.isError) {
    return (
      <ErrorState
        title="Could not load knowledge base"
        description={(docsQuery.error as Error)?.message ?? "Try again."}
      />
    );
  }

  const docs: KbDoc[] = docsQuery.data ?? [];
  if (docs.length === 0) {
    return (
      <div className="space-y-8">
        {HeaderBar}
        <EmptyState
          title="No documents yet"
          description="Upload a menu PDF, hours, policies, or any other document — your agent will use it to answer caller questions accurately."
          action={
            <Button onClick={() => fileInputRef.current?.click()}>Upload document</Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {HeaderBar}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Uploaded</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {docs.map((doc) => (
              <tr key={doc.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-ink">{doc.file_name}</td>
                <td className="px-4 py-3 text-ink-muted">{doc.file_type || "—"}</td>
                <td className="px-4 py-3 text-ink-muted">
                  {formatBytes(doc.size_bytes)}
                </td>
                <td className="px-4 py-3">
                  {doc.indexed_at ? (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Indexed
                    </span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      Indexing…
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {formatTimestamp(doc.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
