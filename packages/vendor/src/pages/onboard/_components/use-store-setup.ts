import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_FULFILLMENT_CENTRES,
  DEFAULT_ORDER_STATUSES,
  STORAGE_KEY,
} from "./constants";
import type { StoreSetupState, WizardStep } from "./types";

const defaultState: StoreSetupState = {
  currentStep: 0,
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
    localFulfillment: ["delivery"],
    ecomFulfillment: ["shipping"],
    deliveryArea: "",
    orderStatuses: DEFAULT_ORDER_STATUSES,
  },
  fulfillmentCentres: DEFAULT_FULFILLMENT_CENTRES,
  payment: {
    methods: ["online"],
    paymentGateway: "",
    codMin: "",
    codMax: "",
  },
  storefront: {
    handle: "",
    template: "",
  },
  isComplete: false,
};

function loadState(): StoreSetupState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...defaultState, ...JSON.parse(raw) };
    }
  } catch {
    // ignore corrupt storage
  }
  return defaultState;
}

export function useStoreSetup() {
  const [state, setState] = useState<StoreSetupState>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const updateState = useCallback(
    (patch: Partial<StoreSetupState>) => {
      setState((prev) => ({ ...prev, ...patch }));
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
      currentStep: Math.max(prev.currentStep - 1, 0) as WizardStep,
    }));
  }, []);

  const completeOnboarding = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, isComplete: true, currentStep: 5 as WizardStep };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetOrderStatuses = useCallback(() => {
    setState((prev) => ({
      ...prev,
      commerce: {
        ...prev.commerce,
        orderStatuses: DEFAULT_ORDER_STATUSES.map((s) => ({ ...s })),
      },
    }));
  }, []);

  return {
    state,
    updateState,
    goToStep,
    nextStep,
    prevStep,
    completeOnboarding,
    resetOrderStatuses,
  };
}
