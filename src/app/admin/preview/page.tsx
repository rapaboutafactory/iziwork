import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getAdmin} from '@/lib/security';
import {getSettings} from '@/lib/settings';
import {Landing} from '@/components/landing';
import '../../landing.css';
import '../../hero-features.css';
import '../../contact-dialog.css';
import '../../bank-art.css';
export const dynamic='force-dynamic';
export const metadata={title:'Предпросмотр · IziWork',robots:{index:false,follow:false}};
export default async function Preview(){if(!await getAdmin(new Headers(await headers())))redirect('/admin/login');const s=await getSettings();return <Landing content={s.draft} token="" preview/>;}
