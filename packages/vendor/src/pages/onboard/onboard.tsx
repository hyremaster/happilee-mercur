import { CheckCircle } from "@happilee-app/icons";
import { toast } from "@medusajs/ui";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMe } from "../../hooks/api/members";
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
import { ReviewSubmitStep } from "./_components/steps/review-submit-step";
import {
  isStorefrontValid,
  StorefrontSetupStep,
} from "./_components/steps/storefront-setup-step";
import { SuccessStep } from "./_components/steps/success-step";
import { STEP_HEADINGS } from "./_components/constants";
import { useStoreSetup } from "./_components/use-store-setup";
import { WizardShell } from "./_components/wizard-shell";
import type { WizardStep } from "./_components/types";

export const OnboardPage = () => {
  const navigate = useNavigate();
  const { seller_member } = useMe();
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

  useEffect(() => {
    if (state.isComplete && !justLaunched && seller_member) {
      navigate("/", { replace: true });
    }
  }, [state.isComplete, justLaunched, navigate, seller_member]);

  const stepIndex = Math.min(state.currentStep, 3) as 0 | 1 | 2 | 3;

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
      goToStep(4);
      return;
    }

    if (state.currentStep === 4) {
      try {
        completeOnboarding();
        setJustLaunched(true);
        toast.success("Store launched successfully");
      } catch {
        toast.error("Failed to launch store. Please try again.");
      }
      return;
    }

    nextStep();
    toast.success("Progress saved");
  };

  const handleBack = () => {
    if (state.currentStep === 0) {
      navigate("/");
      return;
    }
    if (state.currentStep === 4) {
      goToStep(3);
      return;
    }
    prevStep();
  };

  const handleEdit = (step: WizardStep) => {
    goToStep(step);
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

  if ((state.currentStep === 5 || state.isComplete) && justLaunched) {
    return (
      <StoreSetupLayout>
        <SuccessStep />
      </StoreSetupLayout>
    );
  }

  const isReviewStep = state.currentStep === 4;
  const heading = isReviewStep
    ? {
        step: "Review",
        title: "Review & Submit",
        description: "Review your store configuration before launching.",
      }
    : STEP_HEADINGS[stepIndex];

  return (
    <StoreSetupLayout>
      <WizardShell
        currentStep={state.currentStep}
        stepIndex={stepIndex}
        heading={heading}
        onBack={handleBack}
        onContinue={handleContinue}
        continueLabel={
          state.currentStep === 3
            ? "Review and submit"
            : state.currentStep === 4
              ? "Launch Store"
              : "Continue"
        }
        continueIcon={
          state.currentStep === 3 || state.currentStep === 4 ? (
            <CheckCircle />
          ) : undefined
        }
        isContinueDisabled={!canContinue}
        showBack
      >
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
            codError={getCodError(state.payment)}
          />
        )}

        {state.currentStep === 3 && (
          <StorefrontSetupStep
            data={state.storefront}
            onChange={(patch) =>
              updateState({ storefront: { ...state.storefront, ...patch } })
            }
          />
        )}

        {state.currentStep === 4 && (
          <ReviewSubmitStep state={state} onEdit={handleEdit} />
        )}
      </WizardShell>
    </StoreSetupLayout>
  );
};
