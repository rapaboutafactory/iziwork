import {directSocialRedirect} from '@/lib/direct-social';
export const dynamic='force-dynamic';
export function GET(request:Request){return directSocialRedirect(request,'telegram');}
export function HEAD(request:Request){return directSocialRedirect(request,'telegram');}
