import { Announcement03 } from "@happilee-app/icons";
import { ChatsSidebar } from "@happilee-app/ui/ecommerce";
import { ReactNode } from "react";
import config from "virtual:mercur/config";
import { useMe } from "../../../hooks/api/members";

type StoreSetupLayoutProps = {
  children: ReactNode;
  minHeight?: string;
};

const WorkspaceLogo = () => {
  if (config.logo) {
    return (
      <img
        src={config.logo}
        alt={config.name ?? "Workspace"}
        className="h-8 w-8 rounded-md object-cover"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-fg-white">
      <Announcement03 size={18} />
    </div>
  );
};

export const StoreSetupLayout = ({
  children,
  minHeight = "min-h-[calc(100vh-16px)]",
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
    <div className="flex min-h-screen items-start bg-bg-brand-subtle px-md pt-md">
      <div className="sticky top-md h-[calc(100vh-16px)] shrink-0 self-start pt-md">
        <ChatsSidebar
          workspaceLogo={<WorkspaceLogo />}
          items={[]}
          account={{
            name: accountName ?? "Maheen Rahman",
            avatarUrl: "https://i.pravatar.cc/32?img=9",
          }}
          className="h-full"
        />
      </div>

      <div
        className={`flex flex-1 flex-col items-center gap-4xl overflow-hidden rounded-tl-2xl rounded-tr-2xl border border-l border-r border-t border-border-primary bg-bg-primary ${minHeight}`}
      >
        {children}
      </div>
    </div>
  );
};
