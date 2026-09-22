import { describe, expect, test } from "bun:test";

import {
  buildOnboardSearchParams,
  isOnboardReviewRequested,
  shouldRestoreReviewModal,
} from "../onboard-url";

describe("onboard-url", () => {
  test("detects review query param", () => {
    expect(
      isOnboardReviewRequested(new URLSearchParams("draftId=abc&review=1")),
    ).toBe(true);
    expect(
      isOnboardReviewRequested(new URLSearchParams("draftId=abc")),
    ).toBe(false);
  });

  test("restores review modal only when step 4 is saved", () => {
    expect(shouldRestoreReviewModal(4, true)).toBe(true);
    expect(shouldRestoreReviewModal(3, true)).toBe(false);
    expect(shouldRestoreReviewModal(4, false)).toBe(false);
  });

  test("builds draft resume search params", () => {
    const next = buildOnboardSearchParams(
      new URLSearchParams("review=1"),
      { draftId: "sodraft_123" },
    );

    expect(next.get("draftId")).toBe("sodraft_123");
    expect(next.get("review")).toBeNull();
    expect(next.get("storeId")).toBeNull();
  });

  test("toggles review search param", () => {
    const withReview = buildOnboardSearchParams(
      new URLSearchParams("draftId=abc"),
      { review: true },
    );
    expect(withReview.get("review")).toBe("1");

    const withoutReview = buildOnboardSearchParams(withReview, {
      review: false,
    });
    expect(withoutReview.get("review")).toBeNull();
  });
});
