import { Spinner } from "@medusajs/icons";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../../../hooks/api/members";
import { getSessionExpiredRedirectUrl } from "../../../lib/environment";
import { SearchProvider } from "../../../providers/search-provider";
import { SidebarProvider } from "../../../providers/sidebar-provider";

export const ProtectedRoute = () => {
  const { seller_member, isLoading } = useMe();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="text-ui-fg-interactive animate-spin" />
      </div>
    );
  }

  if (!seller_member) {
    const redirectUrl = getSessionExpiredRedirectUrl();
    if (redirectUrl.startsWith("http")) {
      window.location.href = redirectUrl;
      return (
        <div className="flex min-h-screen items-center justify-center">
          <Spinner className="text-ui-fg-interactive animate-spin" />
        </div>
      );
    }
    return <Navigate to={redirectUrl} state={{ from: location }} replace />;
  }

  return (
    <SidebarProvider>
      <SearchProvider>
        <Outlet />
      </SearchProvider>
    </SidebarProvider>
  );
};
