import { WorkspaceLogo } from "@happilee-app/icons";
import { ChatsSidebar } from "@happilee-app/ui/ecommerce";
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { User01 } from "../../../components/icons/user-01";
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
  const navigate = useNavigate();
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
    <div className="flex min-h-screen items-start bg-bg-brand-subtle px-md pt-md">
      <div className="sticky top-md flex h-[calc(100vh-16px)] shrink-0 flex-col items-center self-start pt-md">
        <ChatsSidebar
          workspaceLogo={
            <button
              type="button"
              onClick={() => navigate("/stores")}
              aria-label="Go to stores"
              className="flex cursor-pointer items-center justify-center rounded-md hover:opacity-80 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
              data-testid="sidebar-logo"
            >
              <WorkspaceLogo />
            </button>
          }
          className="min-h-0 flex-1"
        />
        <div className="flex shrink-0 flex-col items-center p-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-border-brand text-fg-quaternary"
            title={accountName ?? "Account"}
            aria-label={accountName ?? "Account"}
            data-testid="sidebar-account"
          >
            <User01 size={20} />
          </div>
        </div>
      </div>

      <div
        className={`flex flex-1 flex-col overflow-hidden rounded-tl-2xl rounded-tr-2xl border border-l border-r border-t border-border-primary bg-bg-primary ${minHeight} ${contentClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
