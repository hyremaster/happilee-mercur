import { WorkspaceLogo } from "@happilee-app/icons";
import { ChatsSidebar } from "@happilee-app/ui/ecommerce";
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMe } from "../../../hooks/api/members";

type StoreSetupLayoutProps = {
  children: ReactNode;
  minHeight?: string;
  contentClassName?: string;
};

export const StoreSetupLayout = ({
  children,
  minHeight = "min-h-[calc(100vh-16px)]",
  contentClassName = "items-center gap-4xl",
}: StoreSetupLayoutProps) => {
  const { seller_member } = useMe({
    retry: false,
    throwOnError: false,
  });
  const member = seller_member?.member;

  const accountName =
    member &&
    ([member.first_name, member.last_name].filter(Boolean).join(" ") ||
      member.email);

  return (
    <div className="flex min-h-screen items-start bg-bg-brand-subtle px-md pt-md font-[Inter,sans-serif]">
      <div className="sticky top-md h-[calc(100vh-16px)] shrink-0 self-start pt-md">
        <ChatsSidebar
          workspaceLogo={
            <Link
              to="/stores"
              className="flex items-center justify-center rounded-md outline-none focus-visible:shadow-borders-focus"
              aria-label="Stores"
              data-testid="sidebar-logo-link"
            >
              <WorkspaceLogo />
            </Link>
          }
          account={{
            name: accountName ?? "Maheen Rahman",
            avatarUrl: "https://i.pravatar.cc/32?img=9",
          }}
          className="h-full"
        />
      </div>

      <div
        className={`flex flex-1 flex-col overflow-hidden rounded-tl-2xl rounded-tr-2xl border border-l border-r border-t border-border-primary bg-bg-primary ${minHeight} ${contentClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
