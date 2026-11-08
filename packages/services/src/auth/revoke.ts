import type { Types } from "@edge/db";
import { revokeDevices } from "../crm/devices";
import { revokeMcpGrants } from "../mcp/connections";

/**
 * Ends every credential that outlives a browser session: CRM phones and Claude connections. Called when someone's
 * password changes or is reset and when their account is disabled (joins a surrounding transaction). Add new kinds here.
 */
export async function revokeUserAccess(userId: string | Types.ObjectId, reason: string) {
  await revokeDevices(userId, reason);
  await revokeMcpGrants(userId, reason);
}
