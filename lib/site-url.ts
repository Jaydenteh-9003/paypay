// Vercel supplies this stable production domain, including during preview builds.
// An explicit URL still takes precedence for custom domains and other hosts.
export const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'https://paypay-jayde.jaydentehjingsiang.chatgpt.site'),
);
