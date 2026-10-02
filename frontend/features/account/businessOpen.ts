/// New business accounts stay closed until the business model is designed.
/// The backend enforces the same switch (BUSINESS_ACCOUNTS_OPEN).
export const BUSINESS_ACCOUNTS_OPEN = process.env.NEXT_PUBLIC_BUSINESS_ACCOUNTS_OPEN === '1';
