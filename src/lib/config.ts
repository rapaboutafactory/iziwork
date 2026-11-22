export function appUrl(){return new URL(process.env.APP_URL || 'http://localhost:3000').origin;}
export function authSecret(){const s=process.env.AUTH_SECRET;if(s && s.length>=32) return s;if(process.env.NODE_ENV==='production') throw new Error('AUTH_SECRET must have at least 32 characters');return 'local-development-only-change-this-secret-before-deploy';}
export function secureCookies(){return appUrl().startsWith('https://');}
// Optional visitor cookies and third-party analytics are off unless explicitly enabled.
export function optionalAnalyticsEnabled(){return process.env.OPTIONAL_ANALYTICS_ENABLED==='true';}
