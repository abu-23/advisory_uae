/**
 * "Verified" means our team checked the licence on the official portal.
 * It expires at the licence expiry or 12 months after the check, whichever is first.
 * The database view `company_verification` applies the same rule.
 */

export type VerificationInput = {
  status: "VERIFIED" | "REJECTED" | "REVOKED";
  checkedAt: Date;
  licenceExpiresAt: Date;
};

export const VERIFICATION_VALID_MONTHS = 12;

export function verificationExpiresAt(v: Pick<VerificationInput, "checkedAt" | "licenceExpiresAt">): Date {
  const twelveMonths = new Date(v.checkedAt);
  twelveMonths.setUTCMonth(twelveMonths.getUTCMonth() + VERIFICATION_VALID_MONTHS);
  return twelveMonths < v.licenceExpiresAt ? twelveMonths : v.licenceExpiresAt;
}

/** Pass the latest record only. No record means Unverified. */
export function isVerified(latest: VerificationInput | null | undefined, now: Date = new Date()): boolean {
  if (!latest || latest.status !== "VERIFIED") return false;
  return now < verificationExpiresAt(latest);
}
