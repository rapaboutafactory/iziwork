import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getAdmin} from '@/lib/security';
import {AdminApp} from '@/components/admin';
import '../../admin.css';
import '../../admin-refresh.css';
export const dynamic='force-dynamic';
export const metadata={title:'Управление · IziWork',robots:{index:false,follow:false}};
export default async function AdminPage({params}:{params:Promise<{section?:string[]}>}){const user=await getAdmin(new Headers(await headers()));if(!user)redirect('/admin/login');const {section}=await params;return <AdminApp section={section?.[0]||'dashboard'} user={{email:user.email}} csrf={user.csrf}/>;}
