import { useEffect, useState } from "react";
import { checkHandleAvailability } from "../../../services/onboardingServices";
import { getHandleFormatStatus } from "./handle-utils";

const DEBOUNCE_MS = 400;

export type HandleAvailabilityState = {
  isChecking: boolean;
  isAvailable: boolean;
  message: string;
};

export function useHandleAvailability(handle: string): HandleAvailabilityState {
  const formatStatus = getHandleFormatStatus(handle);
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [apiMessage, setApiMessage] = useState("");

  useEffect(() => {
    if (!formatStatus.valid) {
      setIsChecking(false);
      setIsAvailable(false);
      setApiMessage("");
      return;
    }

    let cancelled = false;
    setIsChecking(true);
    setIsAvailable(false);
    setApiMessage("");

    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const result = await checkHandleAvailability(handle.trim());

          if (cancelled) {
            return;
          }

          setIsAvailable(result.available);
          setApiMessage(
            result.available ? "Handle is available" : "This handle is already taken",
          );
        } catch {
          if (!cancelled) {
            setIsAvailable(false);
            setApiMessage("Unable to check handle availability. Please try again.");
          }
        } finally {
          if (!cancelled) {
            setIsChecking(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [handle, formatStatus.valid]);

  if (!handle.trim()) {
    return { isChecking: false, isAvailable: false, message: "" };
  }

  if (!formatStatus.valid) {
    return {
      isChecking: false,
      isAvailable: false,
      message: formatStatus.message,
    };
  }

  if (isChecking) {
    return { isChecking: true, isAvailable: false, message: "" };
  }

  return {
    isChecking: false,
    isAvailable,
    message: apiMessage,
  };
}
