import { CheckCircle, Copy01, RefreshCw01 } from "@happilee-app/icons";
import {
  Button,
  InputField,
  RadioCardGroup,
  StorefrontTemplateCard,
} from "@happilee-app/ui";
import { useEffect, useRef, useState } from "react";
import { toast } from "@medusajs/ui";
import type { StorefrontTemplate } from "../../../../services/onboardingServices";
import { URL_PREFIX } from "../constants";
import {
  clampFieldLength,
  FIELD_LIMIT_STORE_HANDLE,
} from "../field-limits";
import { getHandleFormatStatus } from "../handle-utils";
import { StorefrontTemplateSkeleton } from "../shared/storefront-template-option";
import type { HandleAvailabilityState } from "../use-handle-availability";
import type { StorefrontConfig } from "../types";

/** Makes StorefrontTemplateCard square — the primitive uses aspect-[16/10] on the preview. */
const SQUARE_STOREFRONT_TEMPLATE_CARD_CLASS =
  "aspect-square [&>div:first-child]:aspect-auto [&>div:first-child]:min-h-0 [&>div:first-child]:flex-1 [&>div:first-child]:shrink [&>div:last-child]:shrink-0";

type StorefrontSetupStepProps = {
  data: StorefrontConfig;
  handleAvailability: HandleAvailabilityState;
  templates: StorefrontTemplate[];
  isLoadingTemplates: boolean;
  isTemplatesError: boolean;
  onRetryTemplates: () => void;
  onChange: (patch: Partial<StorefrontConfig>) => void;
  onPreviewTemplate: (templateKey: string) => void;
};

export function isStorefrontValid(
  data: StorefrontConfig,
  handleAvailable: boolean,
) {
  const formatStatus = getHandleFormatStatus(data.handle);
  return formatStatus.valid && handleAvailable && !!data.template;
}

export const StorefrontSetupStep = ({
  data,
  handleAvailability,
  templates,
  isLoadingTemplates,
  isTemplatesError,
  onRetryTemplates,
  onChange,
  onPreviewTemplate,
}: StorefrontSetupStepProps) => {
  const [didCopy, setDidCopy] = useState(false);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    const value = data.handle?.trim() ?? "";

    if (!value) {
      toast.error("Nothing to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
      setDidCopy(true);

      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }

      copyResetTimeoutRef.current = setTimeout(() => {
        setDidCopy(false);
      }, 900);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="flex w-full flex-col items-start gap-4xl">
      <div className="flex w-full flex-col gap-sm">
        <div className="flex items-center gap-xxs text-sm font-medium text-text-secondary">
          <span>Website URL</span>
          <span className="text-text-brand" aria-hidden="true">
            *
          </span>
        </div>

        <div className="flex w-full items-center overflow-hidden rounded-md border border-border-primary shadow-xs">
          <span className="shrink-0 whitespace-nowrap border-r border-border-secondary bg-bg-secondary px-[14px] py-[10px] text-sm text-text-tertiary">
            {URL_PREFIX}
          </span>
          <InputField
            aria-label="Store URL slug"
            placeholder="store_name"
            size="md"
            unstyled
            value={data.handle}
            onChange={(v) =>
              onChange({
                handle: clampFieldLength(v.toLowerCase(), FIELD_LIMIT_STORE_HANDLE),
              })
            }
            iconTrailing={
              <button
                type="button"
                aria-label="Copy store URL slug"
                onClick={handleCopy}
                className={`
                  relative inline-flex items-center justify-center rounded-sm p-1 text-text-tertiary
                  transition-transform duration-150 ease-out hover:text-text-secondary focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand
                  ${didCopy ? "scale-110" : "scale-100"}
                `}
              >
                <Copy01
                  className={`
                    transition-all duration-150 ease-out
                    ${didCopy ? "opacity-0 scale-75" : "opacity-100 scale-100"}
                  `}
                />
                <CheckCircle
                  className={`
                    absolute transition-all duration-150 ease-out
                    ${didCopy ? "opacity-100 scale-100 text-fg-success" : "opacity-0 scale-75"}
                  `}
                />
              </button>
            }
            className="min-w-0 flex-1"
          />
        </div>

        <span className="text-sm text-text-tertiary">
          This is your unique storefront URL.
        </span>
        {handleAvailability.isChecking && (
          <span className="text-sm text-text-tertiary">
            Checking availability...
          </span>
        )}
        {!handleAvailability.isChecking && handleAvailability.isAvailable && (
          <div className="flex items-center gap-xs">
            <CheckCircle size={16} className="text-fg-success" />
            <span className="text-sm text-text-success">
              {handleAvailability.message}
            </span>
          </div>
        )}
        {!handleAvailability.isChecking &&
          !handleAvailability.isAvailable &&
          handleAvailability.message && (
            <span className="text-sm text-text-error">
              {handleAvailability.message}
            </span>
          )}
      </div>

      <div className="flex w-full flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <div className="flex items-center gap-xxs text-sm font-medium text-text-secondary">
            <span>Storefront Template</span>
            <span className="text-text-brand" aria-hidden="true">
              *
            </span>
          </div>
          <span className="text-sm text-text-tertiary">
            Select a design template for your customer-facing storefront.
          </span>
        </div>

        {isLoadingTemplates && (
          <div className="grid w-full grid-cols-3 items-start gap-md">
            {Array.from({ length: 3 }).map((_, index) => (
              <StorefrontTemplateSkeleton key={index} />
            ))}
          </div>
        )}

        {!isLoadingTemplates && isTemplatesError && (
          <div className="flex w-full flex-col items-start gap-md rounded-xl border border-border-secondary bg-bg-secondary px-xl py-lg">
            <p className="text-sm text-text-secondary">
              We couldn&apos;t load storefront templates right now.
            </p>
            <Button
              hierarchy="secondary"
              size="sm"
              iconLeading={<RefreshCw01 />}
              onPress={onRetryTemplates}
            >
              Try again
            </Button>
          </div>
        )}

        {!isLoadingTemplates && !isTemplatesError && templates.length > 0 && (
          <RadioCardGroup
            aria-label="Storefront template"
            value={data.template}
            onChange={(value) => onChange({ template: value })}
            columns={3}
            className="w-full"
          >
            {templates.map((template) => (
              <StorefrontTemplateCard
                key={template.key}
                className={SQUARE_STOREFRONT_TEMPLATE_CARD_CLASS}
                value={template.key}
                title={template.name}
                previewSrc={template.preview_image_url ?? undefined}
                previewAlt={`${template.name} preview`}
                onPreview={() => onPreviewTemplate(template.key)}
              />
            ))}
          </RadioCardGroup>
        )}

        {!isLoadingTemplates && !isTemplatesError && templates.length === 0 && (
          <div className="rounded-xl border border-border-secondary bg-bg-secondary px-xl py-lg text-sm text-text-tertiary">
            No storefront templates are available yet. Please try again later.
          </div>
        )}
      </div>
    </div>
  );
};
