import { isPosHandoffEnabled } from "@/lib/feature-flags";
import { getAllowedStoreId, getHandoffExpiryMinutes } from "@/lib/pos-handoff";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    enabled: isPosHandoffEnabled(),
    storeId: getAllowedStoreId(),
    expiryMinutes: getHandoffExpiryMinutes()
  });
}
