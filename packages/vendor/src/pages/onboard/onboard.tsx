import { ArrowRight, CheckCircle } from "@happilee-app/icons";
import { Spinner } from "@medusajs/icons";
import { toast } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMe } from "../../hooks/api/members";
import {
  createDraft,
  getDraft,
  saveDraftStep,
  submitDraft,
} from "../../services/onboardingServices";
import { STEP_HEADINGS } from "./_components/constants";
import { LocationModal } from "./_components/modals/location-modal";
import { ReviewSubmitModal } from "./_components/modals/review-submit-modal";
import { TemplatePreviewModal } from "./_components/modals/template-preview-modal";
import {
  isBusinessDetailsValid,
  mapBusinessDetailsToStep1Data,
  mapCommerceTypeToStep2Data,
  mapDraftToStoreSetupState,
  mapFulfillmentDetailsToStep3Data,
  mapStorefrontToStep4Data,
} from "./_components/onboarding-mappers";
import { StoreSetupLayout } from "./_components/store-setup-layout";
import { BusinessDetailsStep } from "./_components/steps/business-details-step";
import {
  CommerceTypeStep,
  isCommerceTypeValid,
} from "./_components/steps/commerce-type-step";
import {
  FulfillmentDetailsStep,
  isFulfillmentValid,
} from "./_components/steps/fulfillment-details-step";
import { StorefrontSetupStep, isStorefrontValid } from "./_components/steps/storefront-setup-step";
import { SuccessStep } from "./_components/steps/success-step";
import type { FulfillmentCentre, WizardStep } from "./_components/types";
import { useHandleAvailability } from "./_components/use-handle-availability";
import { useStorefrontTemplates } from "./_components/use-storefront-templates";
import { useStoreSetup } from "./_components/use-store-setup";
import { WizardShell } from "./_components/wizard-shell";

export const OnboardPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftIdParam = searchParams.get("draftId");
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
    resetState,
    hydrateState,
  } = useStoreSetup();

  const [justLaunched, setJustLaunched] = useState(false);
  const [locationModal, setLocationModal] = useState<
    | { mode: "add" }
    | { mode: "edit"; centre: FulfillmentCentre }
    | null
  >(null);
  const [isTemplatePreviewOpen, setIsTemplatePreviewOpen] = useState(false);
  const [previewTemplateKey, setPreviewTemplateKey] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(!!draftIdParam);

  useEffect(() => {
    localStorage.removeItem("happilee-store-setup");
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initializeOnboarding = async () => {
      if (draftIdParam) {
        setIsLoadingDraft(true);

        try {
          const { draft } = await getDraft(draftIdParam);

          if (!cancelled) {
            hydrateState(mapDraftToStoreSetupState(draft));
          }
        } catch {
          if (!cancelled) {
            toast.error("Failed to load store draft. Please try again.");
            navigate("/stores", { replace: true });
          }
        } finally {
          if (!cancelled) {
            setIsLoadingDraft(false);
          }
        }

        return;
      }

      resetState();
      setIsLoadingDraft(false);
    };

    void initializeOnboarding();

    return () => {
      cancelled = true;
    };
  }, [draftIdParam, hydrateState, navigate, resetState]);

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
  const handleAvailability = useHandleAvailability(
    state.currentStep === 3 ? state.storefront.handle : "",
  );
  const {
    templates: storefrontTemplates,
    isLoading: isLoadingStorefrontTemplates,
    isError: isStorefrontTemplatesError,
    refetch: refetchStorefrontTemplates,
  } = useStorefrontTemplates();
  const storefrontIsValid = isStorefrontValid(
    state.storefront,
    handleAvailability.isAvailable,
  );

  const handleContinue = async () => {
    if (state.currentStep === 0) {
      if (!isBusinessDetailsValid(state.businessDetails)) {
        toast.error("Please complete all required business details.");
        return;
      }

      setIsSavingStep(true);

      try {
        const stepData = mapBusinessDetailsToStep1Data(state.businessDetails);
        let draftId = state.draftId;

        if (!draftId) {
          const created = await createDraft();
          draftId = created.draft.id;
          updateState({ draftId });
        }

        await saveDraftStep(draftId, { step: 1, data: stepData });
        nextStep();
      } catch {
        toast.error("Failed to save business details. Please try again.");
      } finally {
        setIsSavingStep(false);
      }

      return;
    }

    if (state.currentStep === 1) {
      if (!isCommerceTypeValid(state.commerce)) {
        toast.error("Please complete all required commerce type details.");
        return;
      }

      if (!state.draftId) {
        toast.error("Draft not found. Please complete business details first.");
        return;
      }

      setIsSavingStep(true);

      try {
        const stepData = mapCommerceTypeToStep2Data(state.commerce);
        await saveDraftStep(state.draftId, { step: 2, data: stepData });
        nextStep();
      } catch {
        toast.error("Failed to save commerce type. Please try again.");
      } finally {
        setIsSavingStep(false);
      }

      return;
    }

    if (state.currentStep === 2) {
      if (!isFulfillmentValid(state.fulfillmentCentres, state.payment)) {
        toast.error("Please complete all required fulfillment details.");
        return;
      }

      if (!state.draftId) {
        toast.error("Draft not found. Please complete the previous steps first.");
        return;
      }

      setIsSavingStep(true);

      try {
        const stepData = mapFulfillmentDetailsToStep3Data(
          state.fulfillmentCentres,
          state.payment,
        );
        await saveDraftStep(state.draftId, { step: 3, data: stepData });
        nextStep();
      } catch {
        toast.error("Failed to save fulfillment details. Please try again.");
      } finally {
        setIsSavingStep(false);
      }

      return;
    }

    if (state.currentStep === 3) {
      if (!storefrontIsValid) {
        toast.error("Please complete all required storefront details.");
        return;
      }

      if (!state.draftId) {
        toast.error("Draft not found. Please complete the previous steps first.");
        return;
      }

      setIsSavingStep(true);

      try {
        const stepData = mapStorefrontToStep4Data(state.storefront);
        await saveDraftStep(state.draftId, { step: 4, data: stepData });
        setIsReviewOpen(true);
      } catch {
        toast.error("Failed to save storefront details. Please try again.");
      } finally {
        setIsSavingStep(false);
      }

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

  const handleConfirmLaunch = async () => {
    if (!state.draftId) {
      toast.error("Draft not found. Please complete all onboarding steps first.");
      return;
    }

    setIsSubmitting(true);

    try {
      await submitDraft(state.draftId);
      completeOnboarding();
      setJustLaunched(true);
      setIsReviewOpen(false);
      toast.success("Store launched successfully");
    } catch {
      toast.error("Failed to launch store. Please try again.");
    } finally {
      setIsSubmitting(false);
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

  const handlePreviewTemplate = (templateKey: string) => {
    setPreviewTemplateKey(templateKey);
    setIsTemplatePreviewOpen(true);
  };

  if (state.currentStep === 4 && justLaunched) {
    return (
      <StoreSetupLayout minHeight="min-h-[933px]">
        <SuccessStep />
      </StoreSetupLayout>
    );
  }

  if (isLoadingDraft) {
    return (
      <StoreSetupLayout>
        <div className="flex w-full items-center justify-center py-4xl">
          <Spinner className="animate-spin text-text-tertiary" />
        </div>
      </StoreSetupLayout>
    );
  }

  return (
    <StoreSetupLayout>
      <WizardShell
        stepIndex={stepIndex}
        onBack={handleBack}
        onContinue={() => void handleContinue()}
        continueLabel={state.currentStep === 3 ? "Review and submit" : "Continue"}
        continueIcon={
          state.currentStep === 3 ? <CheckCircle /> : <ArrowRight />
        }
        isContinueDisabled={
          (state.currentStep === 0 &&
            !isBusinessDetailsValid(state.businessDetails)) ||
          (state.currentStep === 1 && !isCommerceTypeValid(state.commerce)) ||
          (state.currentStep === 2 &&
            !isFulfillmentValid(state.fulfillmentCentres, state.payment)) ||
          (state.currentStep === 3 && !storefrontIsValid)
        }
        isContinueLoading={isSavingStep}
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
            onAddLocation={() => setLocationModal({ mode: "add" })}
            onEditCentre={(centre) => setLocationModal({ mode: "edit", centre })}
          />
        )}

        {state.currentStep === 3 && (
          <StorefrontSetupStep
            data={state.storefront}
            handleAvailability={handleAvailability}
            templates={storefrontTemplates}
            isLoadingTemplates={isLoadingStorefrontTemplates}
            isTemplatesError={isStorefrontTemplatesError}
            onRetryTemplates={() => void refetchStorefrontTemplates()}
            onChange={(patch) =>
              updateState({ storefront: { ...state.storefront, ...patch } })
            }
            onPreviewTemplate={handlePreviewTemplate}
          />
        )}
      </WizardShell>

      {locationModal && (
        <LocationModal
          key={
            locationModal.mode === "edit"
              ? `edit-${locationModal.centre.id}`
              : "add"
          }
          isOpen
          mode={locationModal.mode}
          centre={
            locationModal.mode === "edit" ? locationModal.centre : undefined
          }
          onOpenChange={(open) => {
            if (!open) setLocationModal(null);
          }}
          onSave={(centre) => {
            updateState((prev) => ({
              fulfillmentCentres:
                locationModal.mode === "add"
                  ? [...prev.fulfillmentCentres, centre]
                  : prev.fulfillmentCentres.map((c) =>
                      c.id === centre.id ? centre : c,
                    ),
            }));
          }}
        />
      )}

      <TemplatePreviewModal
        isOpen={isTemplatePreviewOpen}
        templateKey={previewTemplateKey}
        templates={storefrontTemplates}
        storeHandle={state.storefront.handle}
        onOpenChange={setIsTemplatePreviewOpen}
        onChooseTemplate={(templateKey) =>
          updateState({ storefront: { ...state.storefront, template: templateKey } })
        }
      />

      <ReviewSubmitModal
        isOpen={isReviewOpen}
        state={state}
        onOpenChange={setIsReviewOpen}
        onEdit={handleEditFromReview}
        onConfirm={() => void handleConfirmLaunch()}
        isConfirmLoading={isSubmitting}
      />
    </StoreSetupLayout>
  );
};
