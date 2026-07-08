import type { StoreOnboardingRow } from "../../../services/storeServices";

export type StoreTableRow = {
  id: string;
  isDraft: boolean;
  name: string;
  handle: string;
  initials: string;
  status: string;
  statusColor: "success" | "warning" | "error";
  industry: string;
  commerceType: string;
};

const formatLabel = (value: string | null | undefined) => {
  if (!value) {
    return "—";
  }

  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
};

const getStoreHandle = (store: StoreOnboardingRow) => {
  const handle = store.owner_handle ?? store.handle;

  if (!handle) {
    return "—";
  }

  return handle.startsWith("@") ? handle : `@${handle}`;
};

const getStoreInitials = (name: string | null) => {
  if (!name?.trim()) {
    return "—";
  }

  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
};

const getStatusDisplay = (
  status: string,
): Pick<StoreTableRow, "status" | "statusColor"> => {
  switch (status) {
    case "open":
      return { status: "Active", statusColor: "success" };
    case "draft":
      return { status: "Draft", statusColor: "warning" };
    default:
      return { status: formatLabel(status), statusColor: "warning" };
  }
};

export const mapStoreToTableRow = (store: StoreOnboardingRow): StoreTableRow => {
  const { status, statusColor } = getStatusDisplay(store.status);

  return {
    id: store.id,
    isDraft: store.is_draft,
    name: store.name?.trim() || "Untitled store",
    handle: getStoreHandle(store),
    initials: getStoreInitials(store.name),
    status,
    statusColor,
    industry: formatLabel(store.industry),
    commerceType: formatLabel(store.commerce_type),
  };
};
