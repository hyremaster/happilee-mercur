export const ONBOARD_REVIEW_PARAM = "review";

export const isOnboardReviewRequested = (
  searchParams: URLSearchParams,
): boolean => searchParams.get(ONBOARD_REVIEW_PARAM) === "1";

export const shouldRestoreReviewModal = (
  onboardingStep: number,
  wantsReview: boolean,
): boolean => wantsReview && onboardingStep >= 4;

export const buildOnboardSearchParams = (
  prev: URLSearchParams,
  patch: {
    draftId?: string;
    review?: boolean | null;
  },
): URLSearchParams => {
  const next = new URLSearchParams(prev);

  if (patch.draftId !== undefined) {
    next.set("draftId", patch.draftId);
    next.delete("storeId");
    next.delete(ONBOARD_REVIEW_PARAM);
  }

  if (patch.review === true) {
    next.set(ONBOARD_REVIEW_PARAM, "1");
  } else if (patch.review === false) {
    next.delete(ONBOARD_REVIEW_PARAM);
  }

  return next;
};
