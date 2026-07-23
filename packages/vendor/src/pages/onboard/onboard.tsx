import { ArrowRight, CheckCircle } from "@happilee-app/icons";
import { Spinner } from "@medusajs/icons";
import { toast } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMe } from "../../hooks/api/members";
import {
  useCreateStoreOnboardingLocation,
  useDeleteStoreOnboardingLocation,
  useUpdateStoreOnboardingLocation,
} from "../../hooks/api/store-onboarding-locations";
import {
  createDraft,
  getDraft,
  saveDraftStep,
  submitDraft,
} from "../../services/onboardingServices";
import {
  getStore,
  getStoreLocations,
} from "../../services/storeServices";
import {
  createActiveStoreBaseline,
  saveActiveStoreStepSparse,
  type ActiveStoreBaseline,
} from "../../services/activeStoreSave";
import { STEP_HEADINGS } from "./_components/constants";
import { LocationModal } from "./_components/modals/location-modal";
import { ReviewSubmitModal } from "./_components/modals/review-submit-modal";
import { TemplatePreviewModal } from "./_components/modals/template-preview-modal";
import {
  isBusinessDetailsValid,
  mapApiLocationToCentre,
  mapBusinessDetailsToStep1Data,
  mapCommerceTypeToStep2Data,
  mapDraftToStoreSetupState,
  mapFulfillmentCentreToLocationPayload,
  mapFulfillmentDetailsToStep3Data,
  mapStoreDetailToStoreSetupState,
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
import { EMAIL_INVALID_MESSAGE, isValidEmailFormat } from "./_components/email";
import {
  STORE_NAME_INVALID_MESSAGE,
  isValidStoreNameFormat,
} from "./_components/store-name";
import { TAX_NUMBER_INVALID_MESSAGE, isValidTaxNumberFormat } from "./_components/tax-number";
import { PIN_CODE_INVALID_MESSAGE, isValidPinCodeFormat } from "./_components/pin-code";
import type { FulfillmentCentre, WizardStep } from "./_components/types";
import { useHandleAvailability } from "./_components/use-handle-availability";
import { useDefaultOrderStatuses } from "./_components/use-default-order-statuses";
import { useStorefrontTemplates } from "./_components/use-storefront-templates";
import { useStoreSetup } from "./_components/use-store-setup";
import { WizardShell } from "./_components/wizard-shell";

export const OnboardPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftIdParam = searchParams.get("draftId");
  const storeIdParam = searchParams.get("storeId");
  const isEditingActiveStore = !!storeIdParam;
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

  const {
    defaultOrderStatuses,
    isLoading: isLoadingDefaultStatuses,
    isError: isDefaultStatusesError,
    refetch: refetchDefaultStatuses,
  } = useDefaultOrderStatuses();

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
  const [isLoadingDraft, setIsLoadingDraft] = useState(
    !!draftIdParam || !!storeIdParam,
  );
  const [originalStorefrontHandle, setOriginalStorefrontHandle] = useState("");
  const [activeStoreBaseline, setActiveStoreBaseline] =
    useState<ActiveStoreBaseline | null>(null);

  const activeStoreId = state.storeId ?? "";
  const { mutateAsync: createStoreLocation, isPending: isCreatingLocation } =
    useCreateStoreOnboardingLocation(activeStoreId);
  const { mutateAsync: updateStoreLocation, isPending: isUpdatingLocation } =
    useUpdateStoreOnboardingLocation(activeStoreId);
  const { mutateAsync: deleteStoreLocation, isPending: isDeletingLocation } =
    useDeleteStoreOnboardingLocation(activeStoreId);
  const isSavingLocation =
    isCreatingLocation || isUpdatingLocation || isDeletingLocation;

  useEffect(() => {
    let cancelled = false;

    const initializeOnboarding = async () => {
      if (draftIdParam && storeIdParam) {
        toast.error("Cannot edit a draft and an active store at the same time.");
        navigate("/stores", { replace: true });
        return;
      }

      if (draftIdParam) {
        setIsLoadingDraft(true);

        try {
          const { draft } = await getDraft(draftIdParam);

          if (!cancelled) {
            hydrateState(mapDraftToStoreSetupState(draft));
            setOriginalStorefrontHandle("");
            setActiveStoreBaseline(null);
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

      if (storeIdParam) {
        setIsLoadingDraft(true);

        try {
          const [{ store }, { locations }] = await Promise.all([
            getStore(storeIdParam),
            getStoreLocations(storeIdParam),
          ]);

          if (!cancelled) {
            const nextState = mapStoreDetailToStoreSetupState(store, locations);
            hydrateState(nextState);
            setOriginalStorefrontHandle(nextState.storefront.handle);
            setActiveStoreBaseline(createActiveStoreBaseline(nextState));
          }
        } catch {
          if (!cancelled) {
            toast.error("Failed to load store details. Please try again.");
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
      setOriginalStorefrontHandle("");
      setActiveStoreBaseline(null);
      setIsLoadingDraft(false);
    };

    void initializeOnboarding();

    return () => {
      cancelled = true;
    };
  }, [draftIdParam, storeIdParam, hydrateState, navigate, resetState]);

  useEffect(() => {
    if (isLoadingDraft || isLoadingDefaultStatuses) {
      return;
    }

    if (defaultOrderStatuses.length === 0) {
      return;
    }

    if (state.commerce.orderStatuses.length > 0) {
      return;
    }

    const nextOrderStatuses = defaultOrderStatuses.map((status) => ({
      ...status,
    }));

    updateState((prev) => ({
      commerce: {
        ...prev.commerce,
        orderStatuses: nextOrderStatuses,
      },
    }));

    if (state.storeId) {
      setActiveStoreBaseline((baseline) =>
        baseline
          ? {
              ...baseline,
              commerce: {
                ...baseline.commerce,
                orderStatuses: nextOrderStatuses.map((status) => ({ ...status })),
              },
            }
          : baseline,
      );
    }
  }, [
    isLoadingDraft,
    isLoadingDefaultStatuses,
    defaultOrderStatuses,
    state.commerce.orderStatuses.length,
    state.storeId,
    updateState,
  ]);

  useEffect(() => {
    if (state.isComplete && !justLaunched) {
      if (seller_member) {
        navigate("/", { replace: true });
      } else {
        updateState({ isComplete: false, currentStep: 1 });
      }
    }
  }, [state.isComplete, justLaunched, navigate, seller_member, updateState]);

  // ProgressSteps / STEP_HEADINGS are 0-indexed arrays; wizard steps are 1–4.
  const stepIndex = Math.min(Math.max(state.currentStep - 1, 0), 3) as
    | 0
    | 1
    | 2
    | 3;
  const heading = STEP_HEADINGS[stepIndex];
  const handleAvailability = useHandleAvailability(
    state.currentStep === 4 ? state.storefront.handle : "",
    isEditingActiveStore ? originalStorefrontHandle : undefined,
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
    if (state.currentStep === 1) {
      if (!isBusinessDetailsValid(state.businessDetails)) {
        const { storeName, email, taxNumber, pinCode, country } =
          state.businessDetails;
        toast.error(
          storeName.trim() && !isValidStoreNameFormat(storeName)
            ? STORE_NAME_INVALID_MESSAGE
            : email.trim() && !isValidEmailFormat(email)
              ? EMAIL_INVALID_MESSAGE
              : pinCode.trim() && !isValidPinCodeFormat(pinCode, country)
                ? PIN_CODE_INVALID_MESSAGE
                : taxNumber.trim() && !isValidTaxNumberFormat(taxNumber)
                  ? TAX_NUMBER_INVALID_MESSAGE
                  : "Please complete all required business details."
        );
        return;
      }

      setIsSavingStep(true);

      try {
        if (state.storeId) {
          if (!activeStoreBaseline) {
            toast.error("Store baseline not loaded. Please reopen this store.");
            return;
          }

          const nextBaseline = await saveActiveStoreStepSparse(
            state.storeId,
            1,
            state,
            activeStoreBaseline,
          );
          setActiveStoreBaseline(nextBaseline);
          nextStep();
          return;
        }

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

    if (state.currentStep === 2) {
      if (!isCommerceTypeValid(state.commerce)) {
        toast.error("Please complete all required commerce type details.");
        return;
      }

      if (!state.draftId && !state.storeId) {
        toast.error("Draft not found. Please complete business details first.");
        return;
      }

      setIsSavingStep(true);

      try {
        if (state.storeId) {
          if (!activeStoreBaseline) {
            toast.error("Store baseline not loaded. Please reopen this store.");
            return;
          }

          const nextBaseline = await saveActiveStoreStepSparse(
            state.storeId,
            2,
            state,
            activeStoreBaseline,
          );
          setActiveStoreBaseline(nextBaseline);
          nextStep();
          return;
        }

        const stepData = mapCommerceTypeToStep2Data(state.commerce);
        await saveDraftStep(state.draftId!, { step: 2, data: stepData });
        nextStep();
      } catch {
        toast.error("Failed to save commerce type. Please try again.");
      } finally {
        setIsSavingStep(false);
      }

      return;
    }

    if (state.currentStep === 3) {
      if (!isFulfillmentValid(state.fulfillmentCentres, state.payment)) {
        toast.error("Please complete all required fulfillment details.");
        return;
      }

      if (!state.draftId && !state.storeId) {
        toast.error("Draft not found. Please complete the previous steps first.");
        return;
      }

      setIsSavingStep(true);

      try {
        if (state.storeId) {
          if (!activeStoreBaseline) {
            toast.error("Store baseline not loaded. Please reopen this store.");
            return;
          }

          const nextBaseline = await saveActiveStoreStepSparse(
            state.storeId,
            3,
            state,
            activeStoreBaseline,
          );
          setActiveStoreBaseline(nextBaseline);
          nextStep();
          return;
        }

        const stepData = mapFulfillmentDetailsToStep3Data(
          state.fulfillmentCentres,
          state.payment,
        );
        await saveDraftStep(state.draftId!, { step: 3, data: stepData });
        nextStep();
      } catch {
        toast.error("Failed to save fulfillment details. Please try again.");
      } finally {
        setIsSavingStep(false);
      }

      return;
    }

    if (state.currentStep === 4) {
      if (!storefrontIsValid) {
        toast.error("Please complete all required storefront details.");
        return;
      }

      if (!state.draftId && !state.storeId) {
        toast.error("Draft not found. Please complete the previous steps first.");
        return;
      }

      setIsSavingStep(true);

      try {
        if (state.storeId) {
          if (!activeStoreBaseline) {
            toast.error("Store baseline not loaded. Please reopen this store.");
            return;
          }

          const nextBaseline = await saveActiveStoreStepSparse(
            state.storeId,
            4,
            state,
            activeStoreBaseline,
          );
          setActiveStoreBaseline(nextBaseline);
          setOriginalStorefrontHandle(state.storefront.handle);
          setIsReviewOpen(true);
          return;
        }

        const stepData = mapStorefrontToStep4Data(state.storefront);
        await saveDraftStep(state.draftId!, { step: 4, data: stepData });
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
    if (state.currentStep === 1) {
      navigate("/stores");
      return;
    }
    prevStep();
  };

  const handleEditFromReview = (step: WizardStep) => {
    setIsReviewOpen(false);
    goToStep(step);
  };

  const handleConfirmLaunch = async () => {
    if (state.storeId) {
      setIsSubmitting(true);

      try {
        setIsReviewOpen(false);
        toast.success("Store updated successfully");
        navigate("/stores");
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

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

  const handleDeleteCentre = async (id: string) => {
    if (state.storeId) {
      try {
        await deleteStoreLocation(id);
        updateState({
          fulfillmentCentres: state.fulfillmentCentres.filter((c) => c.id !== id),
          initialLocationIds: state.initialLocationIds.filter(
            (locationId) => locationId !== id,
          ),
        });
        toast.success("Location deleted");
      } catch {
        toast.error("Failed to delete location. Please try again.");
      }
      return;
    }

    updateState({
      fulfillmentCentres: state.fulfillmentCentres.filter((c) => c.id !== id),
    });
  };

  const replaceFulfillmentCentre = (
    centres: FulfillmentCentre[],
    centre: FulfillmentCentre,
  ) => {
    const index = centres.findIndex((entry) => entry.id === centre.id);

    if (index === -1) {
      return [...centres, centre];
    }

    const next = [...centres];
    next[index] = centre;
    return next;
  };

  const handleSaveLocation = async (
    centre: FulfillmentCentre,
    mode: "add" | "edit",
  ) => {
    if (state.storeId) {
      const payload = mapFulfillmentCentreToLocationPayload(centre);

      try {
        if (mode === "add") {
          const { location } = await createStoreLocation(payload);
          const saved = mapApiLocationToCentre(location);

          updateState((prev) => ({
            fulfillmentCentres: [...prev.fulfillmentCentres, saved],
            initialLocationIds: [...prev.initialLocationIds, saved.id],
          }));
          toast.success("Location added");
        } else {
          await updateStoreLocation({
            locationId: centre.id,
            payload,
          });

          updateState((prev) => ({
            fulfillmentCentres: replaceFulfillmentCentre(
              prev.fulfillmentCentres,
              centre,
            ),
          }));
          toast.success("Location updated");
        }

        setLocationModal(null);
      } catch {
        toast.error("Failed to save location. Please try again.");
        throw new Error("Failed to save location");
      }

      return;
    }

    updateState((prev) => ({
      fulfillmentCentres:
        mode === "add"
          ? [...prev.fulfillmentCentres, centre]
          : replaceFulfillmentCentre(prev.fulfillmentCentres, centre),
    }));
    setLocationModal(null);
    toast.success(mode === "add" ? "Location added" : "Location updated");
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

  if (state.currentStep === 5 && justLaunched) {
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
        continueLabel={
          state.currentStep === 4
            ? isEditingActiveStore
              ? "Review changes"
              : "Review and submit"
            : "Continue"
        }
        continueIcon={
          state.currentStep === 4 ? <CheckCircle /> : <ArrowRight />
        }
        isContinueDisabled={
          (state.currentStep === 1 &&
            !isBusinessDetailsValid(state.businessDetails)) ||
          (state.currentStep === 2 &&
            (!isCommerceTypeValid(state.commerce) ||
              isLoadingDefaultStatuses ||
              isDefaultStatusesError)) ||
          (state.currentStep === 3 &&
            !isFulfillmentValid(state.fulfillmentCentres, state.payment)) ||
          (state.currentStep === 4 && !storefrontIsValid)
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

        {state.currentStep === 1 && (
          <BusinessDetailsStep
            data={state.businessDetails}
            onChange={(patch) =>
              updateState({
                businessDetails: { ...state.businessDetails, ...patch },
              })
            }
          />
        )}

        {state.currentStep === 2 && (
          <CommerceTypeStep
            data={state.commerce}
            onChange={(patch) =>
              updateState((prev) => ({
                commerce: { ...prev.commerce, ...patch },
              }))
            }
            onResetStatuses={() => resetOrderStatuses(defaultOrderStatuses)}
            onUpdateStatus={handleUpdateStatus}
            isLoadingStatuses={isLoadingDefaultStatuses}
            isStatusesError={isDefaultStatusesError}
            onRetryStatuses={() => {
              void refetchDefaultStatuses();
            }}
            isResetDisabled={
              isLoadingDefaultStatuses ||
              isDefaultStatusesError ||
              defaultOrderStatuses.length === 0
            }
          />
        )}

        {state.currentStep === 3 && (
          <FulfillmentDetailsStep
            centres={state.fulfillmentCentres}
            payment={state.payment}
            onPaymentChange={(patch) =>
              updateState({ payment: { ...state.payment, ...patch } })
            }
            onDeleteCentre={(id) => void handleDeleteCentre(id)}
            onAddLocation={() => setLocationModal({ mode: "add" })}
            onEditCentre={(centre) => {
              const current =
                state.fulfillmentCentres.find((entry) => entry.id === centre.id) ??
                centre;
              setLocationModal({ mode: "edit", centre: current });
            }}
          />
        )}

        {state.currentStep === 4 && (
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
          onSave={(centre) => handleSaveLocation(centre, locationModal.mode)}
          isSaving={isSavingLocation}
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
        mode={isEditingActiveStore ? "edit" : "create"}
        onOpenChange={setIsReviewOpen}
        onEdit={handleEditFromReview}
        onConfirm={() => void handleConfirmLaunch()}
        isConfirmLoading={isSubmitting}
      />
    </StoreSetupLayout>
  );
};
