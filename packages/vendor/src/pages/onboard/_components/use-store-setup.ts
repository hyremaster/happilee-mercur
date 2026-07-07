import { useCallback, useState } from "react";
import { DEFAULT_ORDER_STATUSES } from "./constants";
import type { StoreSetupState, WizardStep } from "./types";

export function getDefaultStoreSetupState(): StoreSetupState {
  return {
    currentStep: 0,
    draftId: null,
    storeId: null,
    initialLocationIds: [],
    businessDetails: {
      industry: "restaurant",
      storeName: "",
      businessLegalName: "",
      email: "",
      phone: "",
      address: "",
      country: "",
      state: "",
      city: "",
      pinCode: "",
      taxNumber: "",
    },
    commerce: {
      commerceType: "",
      localFulfillment: [],
      ecomFulfillment: [],
      deliveryArea: "",
      deliveryAreaName: "",
      orderStatuses: DEFAULT_ORDER_STATUSES.map((status) => ({ ...status })),
    },
    fulfillmentCentres: [],
    payment: {
      methods: [],
      paymentGateway: "",
      codMin: "",
      codMax: "",
    },
    storefront: {
      handle: "",
      template: "classic",
    },
    isComplete: false,
  };
}

export function useStoreSetup() {
  const [state, setState] = useState<StoreSetupState>(getDefaultStoreSetupState);

  const resetState = useCallback(() => {
    setState(getDefaultStoreSetupState());
  }, []);

  const hydrateState = useCallback((next: StoreSetupState) => {
    setState(next);
  }, []);

  const updateState = useCallback(
    (
      patch:
        | Partial<StoreSetupState>
        | ((prev: StoreSetupState) => Partial<StoreSetupState>),
    ) => {
      setState((prev) => ({
        ...prev,
        ...(typeof patch === "function" ? patch(prev) : patch),
      }));
    },
    [],
  );

  const goToStep = useCallback((step: WizardStep) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, 4) as WizardStep,
    }));
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 0) as WizardStep,
    }));
  }, []);

  const completeOnboarding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isComplete: true,
      currentStep: 4 as WizardStep,
    }));
  }, []);

  const resetOrderStatuses = useCallback(() => {
    setState((prev) => ({
      ...prev,
      commerce: {
        ...prev.commerce,
        orderStatuses: DEFAULT_ORDER_STATUSES.map((status) => ({ ...status })),
      },
    }));
  }, []);

  return {
    state,
    updateState,
    resetState,
    hydrateState,
    goToStep,
    nextStep,
    prevStep,
    completeOnboarding,
    resetOrderStatuses,
  };
}
