import { Avatar } from "@medusajs/ui";
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import config from "virtual:mercur/config";

import AvatarBox from "@components/common/logo-box/avatar-box";

type DashboardLayoutProps = {
  sidebar?: ReactNode;
  children: ReactNode;
};

const DashboardUserAvatar = () => {
  const fallback = config.name?.charAt(0)?.toUpperCase() ?? "U";

  return (
    <Avatar
      size="small"
      fallback={fallback}
      className="shadow-borders-base"
    />
  );
};

export const DashboardLayout = ({ sidebar, children }: DashboardLayoutProps) => {
  return (
    <div className="flex h-dvh w-dvw overflow-hidden bg-[var(--ds-bg-brand-primary)]">
      <aside className="flex w-[72px] shrink-0 flex-col items-center justify-between py-4">
        <Link
          to="/stores"
          className="rounded-xl outline-none focus-visible:shadow-borders-focus"
          data-testid="sidebar-logo-link"
        >
          <AvatarBox />
        </Link>
        <DashboardUserAvatar />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1">
        {sidebar}
        <div className="flex h-dvh w-full min-w-0 flex-col overflow-hidden py-3 pr-3">
          <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--ds-border-secondary)] bg-[var(--ds-bg-primary)]">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
