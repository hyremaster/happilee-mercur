import { CheckCircle, Copy01 } from "@happilee-app/icons";
import {
  Button,
  InputField,
  RadioCard,
  RadioCardGroup,
} from "@happilee-app/ui";
import * as HappileeUI from "@happilee-app/ui";
import type { ComponentType } from "react";
import { HANDLE_REGEX, STOREFRONT_TEMPLATES, TAKEN_HANDLES, URL_PREFIX } from "../constants";
import type { StorefrontConfig } from "../types";

const StorefrontTemplateCard = (
  HappileeUI as { StorefrontTemplateCard?: ComponentType<{
    value: string;
    title: string;
    onPreview?: () => void;
  }> }
).StorefrontTemplateCard ?? null;

type StorefrontSetupStepProps = {
  data: StorefrontConfig;
  onChange: (patch: Partial<StorefrontConfig>) => void;
  onPreviewTemplate: (templateId: string) => void;
};

export function getHandleStatus(handle: string) {
  if (!handle.trim()) return { valid: false, message: "" };
  if (!HANDLE_REGEX.test(handle)) {
    return {
      valid: false,
      message: "Only lowercase letters, numbers, and hyphens are allowed",
    };
  }
  if (TAKEN_HANDLES.includes(handle.toLowerCase())) {
    return { valid: false, message: "This handle is already taken" };
  }
  return { valid: true, message: "Handle is available" };
}

export function isStorefrontValid(data: StorefrontConfig) {
  const handleStatus = getHandleStatus(data.handle);
  return handleStatus.valid && !!data.template;
}

export const StorefrontSetupStep = ({
  data,
  onChange,
  onPreviewTemplate,
}: StorefrontSetupStepProps) => {
  const handleStatus = getHandleStatus(data.handle);

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
            placeholder="{store_name}"
            size="md"
            unstyled
            value={data.handle}
            onChange={(v) => onChange({ handle: v.toLowerCase() })}
            iconTrailing={<Copy01 />}
            className="min-w-0 flex-1"
          />
        </div>

        <span className="text-sm text-text-tertiary">
          This is your unique storefront URL.
        </span>
        {data.handle &&
          (handleStatus.valid ? (
            <div className="flex items-center gap-xs">
              <CheckCircle size={16} className="text-fg-success" />
              <span className="text-sm text-text-success">{handleStatus.message}</span>
            </div>
          ) : (
            <span className="text-sm text-text-error">{handleStatus.message}</span>
          ))}
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

        <RadioCardGroup
          aria-label="Storefront template"
          value={data.template}
          onChange={(value) => onChange({ template: value })}
          columns={3}
          className="w-full"
        >
          {STOREFRONT_TEMPLATES.map((tpl) =>
            StorefrontTemplateCard ? (
              <StorefrontTemplateCard
                key={tpl.id}
                value={tpl.id}
                title={tpl.label}
                onPreview={() => onPreviewTemplate(tpl.id)}
              />
            ) : (
              <RadioCard
                key={tpl.id}
                value={tpl.id}
                title={tpl.label}
                description="Preview available"
              />
            ),
          )}
        </RadioCardGroup>

        {!StorefrontTemplateCard && data.template && (
          <Button
            hierarchy="ghost"
            size="sm"
            onPress={() => onPreviewTemplate(data.template)}
          >
            Preview selected template
          </Button>
        )}
      </div>
    </div>
  );
};
