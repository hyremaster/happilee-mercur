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

function normalizeStep(step: unknown): WizardStep {
  const n = typeof step === "number" ? step : 0;
  if (n <= 0) return 0;
  if (n >= 4) return 4;
  return n as WizardStep;
}

function loadState(): StoreSetupState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoreSetupState>;
      return {
        ...defaultState,
        ...parsed,
        currentStep: normalizeStep(parsed.currentStep),
        businessDetails: {
          ...defaultState.businessDetails,
          ...parsed.businessDetails,
        },
        commerce: {
          ...defaultState.commerce,
          ...parsed.commerce,
          orderStatuses:
            parsed.commerce?.orderStatuses?.length
              ? parsed.commerce.orderStatuses
              : DEFAULT_ORDER_STATUSES,
        },
        fulfillmentCentres:
          parsed.fulfillmentCentres?.length
            ? parsed.fulfillmentCentres
            : DEFAULT_FULFILLMENT_CENTRES,
        payment: {
          ...defaultState.payment,
          ...parsed.payment,
        },
        storefront: {
          ...defaultState.storefront,
          ...parsed.storefront,
        },
      };
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
    setState((prev) => {
      const next = { ...prev, isComplete: true, currentStep: 4 as WizardStep };
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
