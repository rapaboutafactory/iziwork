import type {Metadata} from 'next';
import './globals.css';
import './brand.css';
const title='IziWork — Удаленная работа без опыта';
export const metadata:Metadata={title,description:'Дополнительный доход без опыта и вложений. Свяжитесь с менеджером IziWork на удобной площадке.',openGraph:{title},twitter:{title},robots:{index:true,follow:true}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>;}
