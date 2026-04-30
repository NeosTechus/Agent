"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  setValue: (next: string) => void;
}
const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("Tabs.* must be used inside <Tabs>");
  return ctx;
}

export interface TabsProps {
  value: string;
  onValueChange: (next: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-white p-1 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}
export function TabsTrigger({
  value,
  className,
  ...props
}: TabsTriggerProps) {
  const { value: active, setValue } = useTabs();
  const selected = value === active;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => setValue(value)}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded px-3 text-sm font-medium transition-colors",
        selected
          ? "bg-primary text-primary-foreground"
          : "text-ink-muted hover:bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export interface TabsContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}
export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const { value: active } = useTabs();
  if (value !== active) return null;
  return <div role="tabpanel" className={className} {...props} />;
}
