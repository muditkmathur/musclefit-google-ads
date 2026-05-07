import { type Customer, GoogleAdsApi } from "google-ads-api";

import { getCachedGoogleAdsCustomer, resetGoogleAdsCustomerCache, setCachedGoogleAdsCustomer } from "./customer-cache";
import { resolveGoogleAdsRefreshToken } from "./refresh-token";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getCustomerId(): string {
  return requireEnv("GOOGLE_ADS_CUSTOMER_ID");
}

export { resetGoogleAdsCustomerCache };

export async function getCustomer(): Promise<Customer> {
  const refreshToken = await resolveGoogleAdsRefreshToken();
  const hit = getCachedGoogleAdsCustomer(refreshToken);
  if (hit) return hit;

  const client = new GoogleAdsApi({
    client_id: requireEnv("GOOGLE_ADS_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_ADS_CLIENT_SECRET"),
    developer_token: requireEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
  });

  const customer = client.Customer({
    customer_id: requireEnv("GOOGLE_ADS_CUSTOMER_ID"),
    refresh_token: refreshToken,
  });

  setCachedGoogleAdsCustomer(customer, refreshToken);

  return customer;
}
