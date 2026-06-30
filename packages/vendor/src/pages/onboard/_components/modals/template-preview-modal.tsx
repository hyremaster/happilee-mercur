import { ArrowLeft, Check, SearchLg } from "@happilee-app/icons";
import { Button, Modal, UtilityButton } from "@happilee-app/ui";
import { STOREFRONT_TEMPLATES } from "../constants";
import { BrowserFrame, StorefrontPlaceholder } from "../shared/storefront-preview";

type TemplatePreviewModalProps = {
  isOpen: boolean;
  templateId: string | null;
  onOpenChange: (open: boolean) => void;
  onChooseTemplate: (templateId: string) => void;
};

export const TemplatePreviewModal = ({
  isOpen,
  templateId,
  onOpenChange,
  onChooseTemplate,
}: TemplatePreviewModalProps) => {
  const templateLabel =
    STOREFRONT_TEMPLATES.find((t) => t.id === templateId)?.label ?? "Classic Store";

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Template Preview — ${templateLabel}`}
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
              if (templateId) onChooseTemplate(templateId);
              onOpenChange(false);
            }}
          >
            Choose This Template
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xl">
        <div className="flex items-center justify-end">
          <UtilityButton
            icon={<SearchLg />}
            aria-label="Search templates"
            variant="tertiary"
            size="md"
          />
        </div>
        <BrowserFrame>
          <StorefrontPlaceholder />
        </BrowserFrame>
      </div>
    </Modal>
  );
};
