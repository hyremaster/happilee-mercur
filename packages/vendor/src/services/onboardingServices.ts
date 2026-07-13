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

export type CheckHandleResponse = {
  available: boolean;
  handle: string;
  reason?: string;
};

export type StorefrontTemplate = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  preview_image_url: string | null;
  is_active: boolean;
  rank: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ListStorefrontTemplatesResponse = {
  storefront_templates: StorefrontTemplate[];
};

export const checkHandleAvailability = async (
  handle: string,
): Promise<CheckHandleResponse> => {
  return fetchQuery("/vendor/store-onboarding/check-handle", {
    method: "GET",
    query: { handle },
  }) as Promise<CheckHandleResponse>;
};

export const listStorefrontTemplates = async (): Promise<ListStorefrontTemplatesResponse> => {
  return fetchQuery("/vendor/storefront-templates", {
    method: "GET",
  }) as Promise<ListStorefrontTemplatesResponse>;
};

export type AreaSenseArea = {
  area_sense_id: string;
  area_name: string;
  metadata?: Record<string, unknown> | null;
};

export type ListAreaSenseAreasResponse = {
  areas: AreaSenseArea[];
};

export type ListAreaSenseAreasQuery = {
  search?: string;
};

export const listAreaSenseAreas = async (
  query?: ListAreaSenseAreasQuery,
): Promise<ListAreaSenseAreasResponse> => {
  return fetchQuery("/vendor/store-onboarding/area-sense/areas", {
    method: "GET",
    query,
  }) as Promise<ListAreaSenseAreasResponse>;
};

export type DefaultOrderStatus = {
  status: string;
  display_name: string;
  color?: string | null;
  is_active?: boolean;
  is_required?: boolean;
  rank?: number;
};

export type ListDefaultOrderStatusesResponse = {
  order_statuses: DefaultOrderStatus[];
};

export const listDefaultOrderStatuses =
  async (): Promise<ListDefaultOrderStatusesResponse> => {
    return fetchQuery("/vendor/store-onboarding/default-statuses", {
      method: "GET",
    }) as Promise<ListDefaultOrderStatusesResponse>;
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
