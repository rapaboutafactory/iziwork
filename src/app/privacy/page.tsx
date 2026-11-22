import Link from 'next/link';
import {getSettings} from '@/lib/settings';
import {optionalAnalyticsEnabled} from '@/lib/config';
export const dynamic='force-dynamic';
export default async function Privacy(){const s=await getSettings();return <main className="legal-page"><Link href="/">← {s.published.backLabel}</Link><h1>{s.published.privacyTitle}</h1><div className="legal-copy">{s.published.privacyText}</div>{optionalAnalyticsEnabled()&&<p><a href="/#privacy-settings">{s.published.cookiesLabel}</a></p>}</main>;}
