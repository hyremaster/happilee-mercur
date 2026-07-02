import { fetchQuery } from "../lib/client";

export type StoreOnboardingDraft = {
  id: string;
  auth_identity_id: string;
  draft_data: Record<string, unknown> | null;
  onboarding_step: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ListDraftsResponse = {
  drafts: StoreOnboardingDraft[];
  count: number;
  offset: number;
  limit: number;
};

export type DraftResponse = {
  draft: StoreOnboardingDraft;
};

export type DeleteDraftResponse = {
  id: string;
  object: "store_onboarding_draft";
  deleted: boolean;
};

export type ListDraftsQuery = {
  offset?: number;
  limit?: number;
  status?: string | string[];
};

export type CreateDraftPayload = {
  draft_data?: Record<string, unknown>;
  onboarding_step?: number;
};

export type SaveDraftStepPayload = {
  step: number;
  data: Record<string, unknown>;
};

export type SaveBusinessDetailsStepResult = {
  draftId: string;
  draft: StoreOnboardingDraft;
};

export type SubmitDraftResponse = {
  store: unknown;
  seller_id: string;
};

const DRAFTS_BASE = "/vendor/store-onboarding/drafts";

export const listDrafts = async (
  query?: ListDraftsQuery,
): Promise<ListDraftsResponse> => {
  return fetchQuery(DRAFTS_BASE, {
    method: "GET",
    query,
  }) as Promise<ListDraftsResponse>;
};

export const createDraft = async (
  payload?: CreateDraftPayload,
): Promise<DraftResponse> => {
  return fetchQuery(DRAFTS_BASE, {
    method: "POST",
    body: payload ?? {},
  }) as Promise<DraftResponse>;
};

export const getDraft = async (draftId: string): Promise<DraftResponse> => {
  return fetchQuery(`${DRAFTS_BASE}/${draftId}`, {
    method: "GET",
  }) as Promise<DraftResponse>;
};

export const saveDraftStep = async (
  draftId: string,
  payload: SaveDraftStepPayload,
): Promise<DraftResponse> => {
  return fetchQuery(`${DRAFTS_BASE}/${draftId}`, {
    method: "POST",
    body: payload,
  }) as Promise<DraftResponse>;
};

export const deleteDraft = async (
  draftId: string,
): Promise<DeleteDraftResponse> => {
  return fetchQuery(`${DRAFTS_BASE}/${draftId}`, {
    method: "DELETE",
  }) as Promise<DeleteDraftResponse>;
};

export const submitDraft = async (
  draftId: string,
): Promise<SubmitDraftResponse> => {
  return fetchQuery(`${DRAFTS_BASE}/${draftId}/submit`, {
    method: "POST",
    body: {},
  }) as Promise<SubmitDraftResponse>;
};

export const saveBusinessDetailsStep = async (
  draftId: string | null,
  data: Record<string, unknown>,
): Promise<SaveBusinessDetailsStepResult> => {
  let activeDraftId = draftId;

  if (!activeDraftId) {
    const created = await createDraft();
    activeDraftId = created.draft.id;
  }

  const saved = await saveDraftStep(activeDraftId, { step: 1, data });

  return {
    draftId: activeDraftId,
    draft: saved.draft,
  };
};
