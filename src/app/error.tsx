'use client';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <main className="system-page"><div className="system-card"><h1>Не удалось открыть страницу</h1><p>Попробуйте ещё раз через несколько секунд. Если ошибка повторяется, сообщите организатору.</p><button onClick={reset}>Повторить</button></div></main>;}
