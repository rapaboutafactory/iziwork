import {NextResponse,type NextRequest} from 'next/server';
import {optionalAnalyticsEnabled,secureCookies} from './lib/config';
export function proxy(request:NextRequest){const headers=new Headers(request.headers);headers.set('x-motiv-request',crypto.randomUUID());headers.set('x-original-method',request.method);const response=NextResponse.next({request:{headers}});
 if(!optionalAnalyticsEnabled())for(const name of ['motiv_consent','motiv_session'])if(request.cookies.has(name))response.cookies.set(name,'',{path:'/',maxAge:0,sameSite:'lax',secure:secureCookies(),httpOnly:name==='motiv_session'});
 return response;
}
export const config={matcher:['/']};
