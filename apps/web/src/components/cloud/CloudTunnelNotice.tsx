import { Link } from "@tanstack/react-router";
import { usePrimaryCloudLinkState } from "../../cloud/primaryCloudLinkState";

export function CloudTunnelNotice() {
  const { data } = usePrimaryCloudLinkState();
  if (!data?.managedTunnelActive || data.tunnelHealth?.status !== "unavailable") return null;
  return (
    <div
      role="status"
      className="mx-2 my-1 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs"
    >
      T3 Connect’s tunnel is unavailable. Other devices may not be able to connect.{" "}
      <Link to="/settings/connections" className="underline">
        Check connection settings
      </Link>
    </div>
  );
}
