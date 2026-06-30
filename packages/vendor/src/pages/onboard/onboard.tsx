import { ArrowRight, CheckCircle } from "@happilee-app/icons";
import { toast } from "@medusajs/ui";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMe } from "../../hooks/api/members";
import { STEP_HEADINGS } from "./_components/constants";
import { AddLocationModal } from "./_components/modals/add-location-modal";
import { ReviewSubmitModal } from "./_components/modals/review-submit-modal";
import { TemplatePreviewModal } from "./_components/modals/template-preview-modal";
import { StoreSetupLayout } from "./_components/store-setup-layout";
import {
  BusinessDetailsStep,
  isBusinessDetailsValid,
  validateBusinessDetails,
} from "./_components/steps/business-details-step";
import {
  CommerceTypeStep,
  isCommerceTypeValid,
} from "./_components/steps/commerce-type-step";
import {
  FulfillmentDetailsStep,
  getCodError,
  isFulfillmentValid,
} from "./_components/steps/fulfillment-details-step";
import {
  isStorefrontValid,
  StorefrontSetupStep,
} from "./_components/steps/storefront-setup-step";
import { SuccessStep } from "./_components/steps/success-step";
import type { WizardStep } from "./_components/types";
import { useStoreSetup } from "./_components/use-store-setup";
import { WizardShell } from "./_components/wizard-shell";

export const OnboardPage = () => {
  const navigate = useNavigate();
  const { seller_member } = useMe({
    retry: false,
    throwOnError: false,
  });
  const {
    state,
    updateState,
    goToStep,
    nextStep,
    prevStep,
    completeOnboarding,
    resetOrderStatuses,
  } = useStoreSetup();

  const [businessErrors, setBusinessErrors] = useState<
    Partial<Record<string, string>>
  >({});
  const [justLaunched, setJustLaunched] = useState(false);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isTemplatePreviewOpen, setIsTemplatePreviewOpen] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  useEffect(() => {
    if (state.isComplete && !justLaunched) {
      if (seller_member) {
        navigate("/", { replace: true });
      } else {
        updateState({ isComplete: false, currentStep: 0 });
      }
    }
  }, [state.isComplete, justLaunched, navigate, seller_member, updateState]);

  const stepIndex = Math.min(state.currentStep, 3) as 0 | 1 | 2 | 3;
  const heading = STEP_HEADINGS[stepIndex];

  const canContinue = useMemo(() => {
    switch (state.currentStep) {
      case 0:
        return isBusinessDetailsValid(state.businessDetails);
      case 1:
        return isCommerceTypeValid(state.commerce);
      case 2:
        return isFulfillmentValid(state.fulfillmentCentres, state.payment);
      case 3:
        return isStorefrontValid(state.storefront);
      default:
        return true;
    }
  }, [state]);

  const handleContinue = () => {
    if (state.currentStep === 0) {
      const errors = validateBusinessDetails(state.businessDetails);
      setBusinessErrors(errors);
      if (Object.keys(errors).length > 0) return;
    }

    if (state.currentStep === 3) {
      setIsReviewOpen(true);
      return;
    }

    nextStep();
  };

  const handleBack = () => {
    if (state.currentStep === 0) {
      navigate("/");
      return;
    }
    prevStep();
  };

  const handleEditFromReview = (step: WizardStep) => {
    setIsReviewOpen(false);
    goToStep(step);
  };

  const handleConfirmLaunch = () => {
    try {
      completeOnboarding();
      setJustLaunched(true);
      setIsReviewOpen(false);
      toast.success("Store launched successfully");
    } catch {
      toast.error("Failed to launch store. Please try again.");
    }
  };

  const handleDeleteCentre = (id: string) => {
    updateState({
      fulfillmentCentres: state.fulfillmentCentres.filter((c) => c.id !== id),
    });
  };

  const handleUpdateStatus = (
    id: string,
    patch: { displayName?: string; active?: boolean },
  ) => {
    updateState({
      commerce: {
        ...state.commerce,
        orderStatuses: state.commerce.orderStatuses.map((s) =>
          s.id === id ? { ...s, ...patch } : s,
        ),
      },
    });
  };

  const handlePreviewTemplate = (templateId: string) => {
    setPreviewTemplateId(templateId);
    setIsTemplatePreviewOpen(true);
  };

  if (state.currentStep === 4 && justLaunched) {
    return (
      <StoreSetupLayout minHeight="min-h-[933px]">
        <SuccessStep />
      </StoreSetupLayout>
    );
  }

  return (
    <StoreSetupLayout>
      <WizardShell
        stepIndex={stepIndex}
        onBack={handleBack}
        onContinue={handleContinue}
        continueLabel={state.currentStep === 3 ? "Review and submit" : "Continue"}
        continueIcon={
          state.currentStep === 3 ? <CheckCircle /> : <ArrowRight />
        }
        isContinueDisabled={!canContinue}
      >
        <div className="flex w-full flex-col">
          <span className="text-sm font-medium leading-5 text-text-brand">
            {heading.step}
          </span>
          <span className="text-xl font-semibold leading-8 text-text-primary">
            {heading.title}
          </span>
          <span className="text-sm font-normal leading-5 text-text-tertiary">
            {heading.description}
          </span>
        </div>

        {state.currentStep === 0 && (
          <BusinessDetailsStep
            data={state.businessDetails}
            onChange={(patch) =>
              updateState({
                businessDetails: { ...state.businessDetails, ...patch },
              })
            }
            errors={businessErrors}
          />
        )}

        {state.currentStep === 1 && (
          <CommerceTypeStep
            data={state.commerce}
            onChange={(patch) =>
              updateState({ commerce: { ...state.commerce, ...patch } })
            }
            onResetStatuses={resetOrderStatuses}
            onUpdateStatus={handleUpdateStatus}
          />
        )}

        {state.currentStep === 2 && (
          <FulfillmentDetailsStep
            centres={state.fulfillmentCentres}
            payment={state.payment}
            onPaymentChange={(patch) =>
              updateState({ payment: { ...state.payment, ...patch } })
            }
            onDeleteCentre={handleDeleteCentre}
            onAddLocation={() => setIsAddLocationOpen(true)}
            codError={getCodError(state.payment)}
          />
        )}

        {state.currentStep === 3 && (
          <StorefrontSetupStep
            data={state.storefront}
            onChange={(patch) =>
              updateState({ storefront: { ...state.storefront, ...patch } })
            }
            onPreviewTemplate={handlePreviewTemplate}
          />
        )}
      </WizardShell>

      <AddLocationModal
        isOpen={isAddLocationOpen}
        onOpenChange={setIsAddLocationOpen}
      />

      <TemplatePreviewModal
        isOpen={isTemplatePreviewOpen}
        templateId={previewTemplateId}
        onOpenChange={setIsTemplatePreviewOpen}
        onChooseTemplate={(templateId) =>
          updateState({ storefront: { ...state.storefront, template: templateId } })
        }
      />

      <ReviewSubmitModal
        isOpen={isReviewOpen}
        state={state}
        onOpenChange={setIsReviewOpen}
        onEdit={handleEditFromReview}
        onConfirm={handleConfirmLaunch}
      />
    </StoreSetupLayout>
  );
};
