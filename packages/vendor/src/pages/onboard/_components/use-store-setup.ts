import { useCallback, useState } from "react";
import type { OrderStatusConfig, StoreSetupState, WizardStep } from "./types";

export function getDefaultStoreSetupState(): StoreSetupState {
  return {
    currentStep: 1,
    draftId: null,
    storeId: null,
    initialLocationIds: [],
    businessDetails: {
      industry: "",
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
      orderStatuses: [],
    },
    fulfillmentCentres: [],
    payment: {
      methods: [],
      onlinePaymentMethods: [],
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
      currentStep: Math.min(prev.currentStep + 1, 5) as WizardStep,
    }));
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 1) as WizardStep,
    }));
  }, []);

  const completeOnboarding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isComplete: true,
      currentStep: 5 as WizardStep,
    }));
  }, []);

  const resetOrderStatuses = useCallback((defaults: OrderStatusConfig[]) => {
    setState((prev) => ({
      ...prev,
      commerce: {
        ...prev.commerce,
        orderStatuses: defaults.map((status) => ({ ...status })),
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
