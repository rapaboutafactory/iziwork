import Link from 'next/link';
import {getSettings} from '@/lib/settings';
export const dynamic='force-dynamic';
export default async function Legal(){const s=await getSettings();return <main className="legal-page"><Link href="/">← {s.published.backLabel}</Link><h1>{s.published.legalTitle}</h1><div className="legal-copy">{s.published.organizer}{'\n\n'}{s.published.contact}{'\n\n'}{s.published.legalText}</div></main>;}
