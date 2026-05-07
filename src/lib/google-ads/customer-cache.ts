import type { Customer } from "google-ads-api";

let cachedCustomer: Customer | null = null;
let cachedForRefreshToken: string | null = null;

export function getCachedGoogleAdsCustomer(refreshToken: string): Customer | null {
  if (cachedForRefreshToken === refreshToken) return cachedCustomer;
  return null;
}

export function setCachedGoogleAdsCustomer(customer: Customer, refreshToken: string): void {
  cachedCustomer = customer;
  cachedForRefreshToken = refreshToken;
}

/** Clear memoized GoogleAdsApi Customer so the next build picks up a new refresh token. */
export function resetGoogleAdsCustomerCache(): void {
  cachedCustomer = null;
  cachedForRefreshToken = null;
}
