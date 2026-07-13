import { ArrowLeft, Check } from "@happilee-app/icons";
import { Button, Modal } from "@happilee-app/ui";
import { useEffect, useState } from "react";
import type { StorefrontTemplate } from "../../../../services/onboardingServices";
import { BrowserFrame } from "../shared/storefront-preview";

type TemplatePreviewModalProps = {
  isOpen: boolean;
  templateKey: string | null;
  templates: StorefrontTemplate[];
  storeHandle?: string;
  onOpenChange: (open: boolean) => void;
  onChooseTemplate: (templateKey: string) => void;
};

export const TemplatePreviewModal = ({
  isOpen,
  templateKey,
  templates,
  storeHandle,
  onOpenChange,
  onChooseTemplate,
}: TemplatePreviewModalProps) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const template = templates.find((item) => item.key === templateKey) ?? null;
  const previewUrl = template?.preview_image_url ?? null;
  const displayHandle = storeHandle?.trim() || "your-store";
  const previewTitle = template?.name ?? "Template preview";

  useEffect(() => {
    setImageLoaded(false);
  }, [previewUrl, isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={previewTitle}
      subtitle={
        template?.description ??
        "This is how your customer-facing storefront could look."
      }
      size="xl"
      footer={
        <>
          <Button
            hierarchy="secondary"
            size="md"
            iconLeading={<ArrowLeft />}
            onPress={() => onOpenChange(false)}
          >
            Back
          </Button>
          <Button
            hierarchy="primary"
            size="md"
            iconLeading={<Check />}
            onPress={() => {
              if (templateKey) onChooseTemplate(templateKey);
              onOpenChange(false);
            }}
          >
            Choose This Template
          </Button>
        </>
      }
    >
      <BrowserFrame storeHandle={displayHandle}>
        {previewUrl ? (
          <div className="relative min-h-[420px] bg-bg-secondary">
            {!imageLoaded && (
              <div className="absolute inset-0 animate-pulse bg-bg-secondary" />
            )}
            <img
              key={previewUrl}
              src={previewUrl}
              alt={`${previewTitle} preview`}
              className={`
                block h-auto w-full transition-opacity duration-300
                ${imageLoaded ? "opacity-100" : "opacity-0"}
              `}
              onLoad={() => setImageLoaded(true)}
            />
          </div>
        ) : (
          <div className="flex min-h-[320px] items-center justify-center bg-bg-secondary px-xl text-center text-sm text-text-tertiary">
            Preview image is not available for this template.
          </div>
        )}
      </BrowserFrame>
    </Modal>
  );
};
