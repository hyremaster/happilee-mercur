import { ReactNode } from "react";

type DashboardLayoutProps = {
  sidebar?: ReactNode;
  children: ReactNode;
};

export const DashboardLayout = ({ sidebar, children }: DashboardLayoutProps) => {
  return (
    <div className="flex h-dvh w-dvw overflow-hidden bg-[var(--ds-bg-brand-primary)]">
      <div className="flex min-h-0 min-w-0 flex-1">
        {sidebar}
        <div className="flex h-dvh w-full min-w-0 flex-col overflow-hidden p-3">
          <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--ds-border-secondary)] bg-[var(--ds-bg-primary)]">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
