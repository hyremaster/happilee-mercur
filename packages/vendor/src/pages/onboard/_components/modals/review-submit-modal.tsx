import { ArrowLeft, CheckCircle } from "@happilee-app/icons";
import { Button, Modal } from "@happilee-app/ui";
import { ReviewSubmitContent } from "../steps/review-submit-step";
import type { StoreSetupState, WizardStep } from "../types";

type ReviewSubmitModalProps = {
  isOpen: boolean;
  state: StoreSetupState;
  mode?: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onEdit: (step: WizardStep) => void;
  onConfirm: () => void;
  isConfirmLoading?: boolean;
};

export const ReviewSubmitModal = ({
  isOpen,
  state,
  mode = "create",
  onOpenChange,
  onEdit,
  onConfirm,
  isConfirmLoading = false,
}: ReviewSubmitModalProps) => {
  const isEditMode = mode === "edit";

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={"Review and Submit"}
      subtitle={"Your store is ready to go."}
      size="xl"
      footer={
        <>
          <Button
            hierarchy="secondary"
            size="md"
            iconLeading={<ArrowLeft />}
            isDisabled={isConfirmLoading}
            onPress={() => onOpenChange(false)}
          >
            Back
          </Button>
          <Button
            hierarchy="primary"
            size="md"
            iconTrailing={<CheckCircle />}
            isDisabled={isConfirmLoading}
            onPress={onConfirm}
          >
            {isConfirmLoading
              ? isEditMode
                ? "Saving..."
                : "Launching..."
              : isEditMode
                ? "Save changes"
                : "Confirm & Launch"}
          </Button>
        </>
      }
    >
      <div className="w-full min-w-0 max-w-full">
        <ReviewSubmitContent state={state} onEdit={onEdit} />
      </div>
    </Modal>
  );
};
