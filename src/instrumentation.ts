export async function register(){if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.NODE_ENV==='production'){
 const secret=process.env.AUTH_SECRET||'';if(secret.length<32||/^(replace|local-development|test-)/i.test(secret))throw new Error('Set a unique AUTH_SECRET of at least 32 characters');
 const postback=process.env.POSTBACK_SECRET||'';if(postback.length<32||/^(replace|test-)/i.test(postback)||postback===secret)throw new Error('Set a separate random POSTBACK_SECRET of at least 32 characters');
 const url=new URL(process.env.APP_URL||'http://localhost:3000');if(url.protocol!=='https:'&&process.env.ALLOW_PGLITE_PRODUCTION!=='true')throw new Error('Production APP_URL must use HTTPS');
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
}}
