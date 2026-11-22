import {directSocialRedirect} from '@/lib/direct-social';
export const dynamic='force-dynamic';
export function GET(request:Request){return directSocialRedirect(request,'max');}
export function HEAD(request:Request){return directSocialRedirect(request,'max');}
