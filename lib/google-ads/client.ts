import { GoogleAdsApi, type Customer } from 'google-ads-api';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

let cachedCustomer: Customer | null = null;

export function getCustomer(): Customer {
  if (cachedCustomer) return cachedCustomer;

  const client = new GoogleAdsApi({
    client_id: requireEnv('GOOGLE_ADS_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_ADS_CLIENT_SECRET'),
    developer_token: requireEnv('GOOGLE_ADS_DEVELOPER_TOKEN'),
  });

  cachedCustomer = client.Customer({
    customer_id: requireEnv('GOOGLE_ADS_CUSTOMER_ID'),
    refresh_token: requireEnv('GOOGLE_ADS_REFRESH_TOKEN'),
  });

  return cachedCustomer;
}
