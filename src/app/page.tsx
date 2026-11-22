import {headers} from 'next/headers';
import {Landing} from '@/components/landing';
import {getSettings} from '@/lib/settings';
import {trackLanding,sourceById} from '@/lib/tracking';
import {networks} from '@/lib/validation';
import './landing.css';
import './hero-features.css';
import './contact-dialog.css';
import './bank-art.css';
export const dynamic='force-dynamic';
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;const query=new URLSearchParams();for(const [k,v]of Object.entries(params))if(typeof v==='string')query.set(k,v);
 const [s,visit]=await Promise.all([getSettings(),trackLanding(new Headers(await headers()),query)]);
 const source=await sourceById(visit.sourceId);
 const available=Object.fromEntries(networks.map(network=>[network,!!(source?.links[network]||s.links[network])]));
 return <Landing content={{...s.published,metrikaId:s.metrikaId}} token={visit.token} available={available}/>;
}
