import { ArrowRight, CheckCircle } from "@happilee-app/icons";
import { Spinner } from "@medusajs/icons";
import { toast } from "@medusajs/ui";
import { useCallback, useEffect, useRef, useState } from "react";
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
  isBusinessDetailsComplete,
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
import {
  buildOnboardSearchParams,
  isOnboardReviewRequested,
  shouldRestoreReviewModal,
} from "./_components/onboard-url";
import { useStoreSetup } from "./_components/use-store-setup";
import { WizardShell } from "./_components/wizard-shell";

export const OnboardPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const draftIdParam = searchParams.get("draftId");
  const storeIdParam = searchParams.get("storeId");
  const wantsReview = isOnboardReviewRequested(searchParams);
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
  const [step1ValidationAttempted, setStep1ValidationAttempted] =
    useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(
    !!draftIdParam || !!storeIdParam,
  );
  const [originalStorefrontHandle, setOriginalStorefrontHandle] = useState("");
  const [activeStoreBaseline, setActiveStoreBaseline] =
    useState<ActiveStoreBaseline | null>(null);
  const hydratedDraftIdRef = useRef<string | null>(null);
  const hydratedStoreIdRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const continueInFlightRef = useRef(false);

  stateRef.current = state;

  const resolveDraftId = useCallback(
    () => state.draftId ?? draftIdParam,
    [draftIdParam, state.draftId],
  );

  const syncDraftIdToUrl = useCallback(
    (draftId: string) => {
      hydratedDraftIdRef.current = draftId;
      setSearchParams(
        (prev) => buildOnboardSearchParams(prev, { draftId }),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setReviewOpenInUrl = useCallback(
    (open: boolean) => {
      setSearchParams(
        (prev) => buildOnboardSearchParams(prev, { review: open }),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleReviewOpenChange = useCallback(
    (open: boolean) => {
      setIsReviewOpen(open);
      setReviewOpenInUrl(open);
    },
    [setReviewOpenInUrl],
  );

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
        if (hydratedDraftIdRef.current === draftIdParam) {
          if (!cancelled) {
            setIsLoadingDraft(false);
          }
          return;
        }

        setIsLoadingDraft(true);

        try {
          const { draft } = await getDraft(draftIdParam);

          if (!cancelled) {
            hydrateState(mapDraftToStoreSetupState(draft));
            hydratedDraftIdRef.current = draftIdParam;
            setOriginalStorefrontHandle("");
            setActiveStoreBaseline(null);
            setIsReviewOpen(
              shouldRestoreReviewModal(draft.onboarding_step ?? 0, wantsReview),
            );
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
        if (hydratedStoreIdRef.current === storeIdParam) {
          if (!cancelled) {
            setIsLoadingDraft(false);
          }
          return;
        }

        setIsLoadingDraft(true);

        try {
          const [{ store }, { locations }] = await Promise.all([
            getStore(storeIdParam),
            getStoreLocations(storeIdParam),
          ]);

          if (!cancelled) {
            const nextState = mapStoreDetailToStoreSetupState(store, locations);
            hydrateState(nextState);
            hydratedStoreIdRef.current = storeIdParam;
            setOriginalStorefrontHandle(nextState.storefront.handle);
            setActiveStoreBaseline(createActiveStoreBaseline(nextState));
            setIsReviewOpen(
              shouldRestoreReviewModal(4, wantsReview),
            );
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
      hydratedDraftIdRef.current = null;
      hydratedStoreIdRef.current = null;
      setOriginalStorefrontHandle("");
      setActiveStoreBaseline(null);
      setIsReviewOpen(false);
      setIsLoadingDraft(false);
    };

    void initializeOnboarding();

    return () => {
      cancelled = true;
    };
  }, [
    draftIdParam,
    storeIdParam,
    wantsReview,
    hydrateState,
    navigate,
    resetState,
  ]);

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

  useEffect(() => {
    if (state.currentStep !== 1) {
      setStep1ValidationAttempted(false);
    }
  }, [state.currentStep]);

  useEffect(() => {
    if (
      step1ValidationAttempted &&
      isValidEmailFormat(state.businessDetails.email)
    ) {
      setStep1ValidationAttempted(false);
    }
  }, [step1ValidationAttempted, state.businessDetails.email]);

  const handleContinue = async () => {
    if (continueInFlightRef.current || isSavingStep) {
      return;
    }

    const stepAtStart = stateRef.current.currentStep;
    continueInFlightRef.current = true;

    try {
      if (stepAtStart === 1) {
        const businessDetails = stateRef.current.businessDetails;

        if (!isBusinessDetailsValid(businessDetails)) {
          setStep1ValidationAttempted(true);
          const { storeName, email, taxNumber, pinCode, country } =
            businessDetails;
          toast.error(
            storeName.trim() && !isValidStoreNameFormat(storeName)
              ? STORE_NAME_INVALID_MESSAGE
              : email.trim() && !isValidEmailFormat(email)
                ? EMAIL_INVALID_MESSAGE
                : pinCode.trim() && !isValidPinCodeFormat(pinCode, country)
                  ? PIN_CODE_INVALID_MESSAGE
                  : taxNumber.trim() && !isValidTaxNumberFormat(taxNumber)
                    ? TAX_NUMBER_INVALID_MESSAGE
                    : "Please complete all required business details.",
          );
          return;
        }

        setStep1ValidationAttempted(false);
        setIsSavingStep(true);

        try {
          if (stateRef.current.storeId) {
            if (!activeStoreBaseline) {
              toast.error("Store baseline not loaded. Please reopen this store.");
              return;
            }

            const nextBaseline = await saveActiveStoreStepSparse(
              stateRef.current.storeId,
              1,
              stateRef.current,
              activeStoreBaseline,
            );
            setActiveStoreBaseline(nextBaseline);
            nextStep();
            toast.success("Business details saved");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }

          const stepData = mapBusinessDetailsToStep1Data(businessDetails);
          let draftId = stateRef.current.draftId ?? draftIdParam;

          if (!draftId) {
            const created = await createDraft();
            draftId = created.draft.id;
            updateState({ draftId });
            syncDraftIdToUrl(draftId);
          } else if (draftIdParam !== draftId) {
            syncDraftIdToUrl(draftId);
          }

          await saveDraftStep(draftId, { step: 1, data: stepData });
          nextStep();
          toast.success("Business details saved");
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch {
          toast.error("Failed to save business details. Please try again.");
        } finally {
          setIsSavingStep(false);
        }

        return;
      }

      if (stepAtStart === 2) {
        const commerce = stateRef.current.commerce;

        if (!isCommerceTypeValid(commerce)) {
          toast.error("Please complete all required commerce type details.");
          return;
        }

        const draftId = stateRef.current.draftId ?? draftIdParam;

        if (!draftId && !stateRef.current.storeId) {
          toast.error("Draft not found. Please complete business details first.");
          return;
        }

        setIsSavingStep(true);

        try {
          if (stateRef.current.storeId) {
            if (!activeStoreBaseline) {
              toast.error("Store baseline not loaded. Please reopen this store.");
              return;
            }

            const nextBaseline = await saveActiveStoreStepSparse(
              stateRef.current.storeId,
              2,
              stateRef.current,
              activeStoreBaseline,
            );
            setActiveStoreBaseline(nextBaseline);
            nextStep();
            return;
          }

          const stepData = mapCommerceTypeToStep2Data(commerce);
          await saveDraftStep(draftId!, { step: 2, data: stepData });
          nextStep();
        } catch {
          toast.error("Failed to save commerce type. Please try again.");
        } finally {
          setIsSavingStep(false);
        }

        return;
      }

      if (stepAtStart === 3) {
        const { fulfillmentCentres, payment } = stateRef.current;

        if (!isFulfillmentValid(fulfillmentCentres, payment)) {
          toast.error("Please complete all required fulfillment details.");
          return;
        }

        const draftId = stateRef.current.draftId ?? draftIdParam;

        if (!draftId && !stateRef.current.storeId) {
          toast.error("Draft not found. Please complete the previous steps first.");
          return;
        }

        setIsSavingStep(true);

        try {
          if (stateRef.current.storeId) {
            if (!activeStoreBaseline) {
              toast.error("Store baseline not loaded. Please reopen this store.");
              return;
            }

            const nextBaseline = await saveActiveStoreStepSparse(
              stateRef.current.storeId,
              3,
              stateRef.current,
              activeStoreBaseline,
            );
            setActiveStoreBaseline(nextBaseline);
            nextStep();
            return;
          }

          const stepData = mapFulfillmentDetailsToStep3Data(
            fulfillmentCentres,
            payment,
          );
          await saveDraftStep(draftId!, { step: 3, data: stepData });
          nextStep();
        } catch {
          toast.error("Failed to save fulfillment details. Please try again.");
        } finally {
          setIsSavingStep(false);
        }

        return;
      }

      if (stepAtStart === 4) {
        const { storefront } = stateRef.current;

        if (!storefrontIsValid) {
          toast.error("Please complete all required storefront details.");
          return;
        }

        const draftId = stateRef.current.draftId ?? draftIdParam;

        if (!draftId && !stateRef.current.storeId) {
          toast.error("Draft not found. Please complete the previous steps first.");
          return;
        }

        setIsSavingStep(true);

        try {
          if (stateRef.current.storeId) {
            if (!activeStoreBaseline) {
              toast.error("Store baseline not loaded. Please reopen this store.");
              return;
            }

            const nextBaseline = await saveActiveStoreStepSparse(
              stateRef.current.storeId,
              4,
              stateRef.current,
              activeStoreBaseline,
            );
            setActiveStoreBaseline(nextBaseline);
            setOriginalStorefrontHandle(storefront.handle);
            handleReviewOpenChange(true);
            return;
          }

          const stepData = mapStorefrontToStep4Data(storefront);
          await saveDraftStep(draftId!, { step: 4, data: stepData });
          handleReviewOpenChange(true);
        } catch {
          toast.error("Failed to save storefront details. Please try again.");
        } finally {
          setIsSavingStep(false);
        }

        return;
      }

      nextStep();
    } finally {
      continueInFlightRef.current = false;
    }
  };

  const handleBack = () => {
    if (state.currentStep === 1) {
      navigate("/stores");
      return;
    }
    prevStep();
  };

  const handleEditFromReview = (step: WizardStep) => {
    handleReviewOpenChange(false);
    goToStep(step);
  };

  const handleConfirmLaunch = async () => {
    if (state.storeId) {
      setIsSubmitting(true);

      try {
        handleReviewOpenChange(false);
        toast.success("Store updated successfully");
        navigate("/stores");
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    const draftId = resolveDraftId();

    if (!draftId) {
      toast.error("Draft not found. Please complete all onboarding steps first.");
      return;
    }

    setIsSubmitting(true);

    try {
      await submitDraft(draftId);
      completeOnboarding();
      setJustLaunched(true);
      handleReviewOpenChange(false);
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
            !isBusinessDetailsComplete(state.businessDetails)) ||
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
          <span className="text-sm font-medium text-text-brand">
            {heading.step}
          </span>
          <span className="text-xl font-semibold text-text-primary">
            {heading.title}
          </span>
          <span className="text-sm font-normal text-text-tertiary">
            {heading.description}
          </span>
        </div>

        {state.currentStep === 1 && (
          <BusinessDetailsStep
            data={state.businessDetails}
            showValidationErrors={step1ValidationAttempted}
            onChange={(patch) =>
              updateState((prev) => ({
                businessDetails: { ...prev.businessDetails, ...patch },
              }))
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
        onOpenChange={handleReviewOpenChange}
        onEdit={handleEditFromReview}
        onConfirm={() => void handleConfirmLaunch()}
        isConfirmLoading={isSubmitting}
      />
    </StoreSetupLayout>
  );
};
