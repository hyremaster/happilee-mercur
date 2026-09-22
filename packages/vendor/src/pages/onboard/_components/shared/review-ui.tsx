import { Edit01, CheckCircle } from "@happilee-app/icons";
import { Button, FeaturedIcon } from "@happilee-app/ui";
import { ReactNode } from "react";

export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-xxs sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-xl">
      <span className="text-sm text-text-tertiary">{label}</span>
      <span className="min-w-0 break-all text-sm font-medium text-text-primary [overflow-wrap:anywhere]">
        {value}
      </span>
    </div>
  );
}

export function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-secondary bg-bg-primary shadow-xs">
      <div className="flex items-center justify-between border-b border-secondary px-xl py-lg">
        <span className="text-md font-semibold text-text-primary">{title}</span>
        {onEdit && (
          <Button
            hierarchy="ghost"
            size="sm"
            iconLeading={<Edit01 />}
            className="border border-border-primary shadow-xs"
            onPress={onEdit}
          >
            Edit
          </Button>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-lg px-xl py-lg">{children}</div>
    </div>
  );
}

export function ReadyToGoLiveBanner() {
  return (
    <div className="flex w-full items-start gap-lg rounded-xl border border-brand bg-brand-25 p-xl">
      <FeaturedIcon icon={<CheckCircle />} color="brand" theme="dark" size="md" />
      <div className="flex min-w-0 flex-col gap-xs">
        <p className="text-sm font-semibold text-text-brand">Ready to go live</p>
        <p className="text-sm text-text-tertiary">
          After submitting, your store will be created and you&apos;ll unlock the
          commerce features module — catalog, orders, customers and reports.
        </p>
      </div>
    </div>
  );
}
