export function StorefrontTemplateSkeleton() {
  return (
    <div className="flex aspect-square w-full flex-col overflow-hidden rounded-xl border border-border-secondary bg-bg-primary">
      <div className="min-h-0 flex-1 animate-pulse bg-bg-secondary" />
      <div className="flex shrink-0 flex-col gap-sm p-lg">
        <div className="h-5 w-2/5 animate-pulse rounded-sm bg-bg-secondary" />
        <div className="h-8 w-full animate-pulse rounded-md bg-bg-secondary" />
      </div>
    </div>
  );
}
