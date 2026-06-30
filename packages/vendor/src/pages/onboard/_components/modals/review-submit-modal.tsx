import { ArrowLeft, CheckCircle } from "@happilee-app/icons";
import { Button, Modal } from "@happilee-app/ui";
import { ReviewSubmitContent } from "../steps/review-submit-step";
import type { StoreSetupState, WizardStep } from "../types";

type ReviewSubmitModalProps = {
  isOpen: boolean;
  state: StoreSetupState;
  onOpenChange: (open: boolean) => void;
  onEdit: (step: WizardStep) => void;
  onConfirm: () => void;
};

export const ReviewSubmitModal = ({
  isOpen,
  state,
  onOpenChange,
  onEdit,
  onConfirm,
}: ReviewSubmitModalProps) => {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Review and Submit"
      subtitle="Your store is ready to go."
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
            iconTrailing={<CheckCircle />}
            onPress={onConfirm}
          >
            Confirm &amp; Launch
          </Button>
        </>
      }
    >
      <ReviewSubmitContent state={state} onEdit={onEdit} />
    </Modal>
  );
};
