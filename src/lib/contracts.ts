export type Network = 'vk' | 'telegram' | 'max';
export type SocialLinks = Record<Network,string>;
export type NetworkAvailability = Partial<Record<Network,boolean>>;
export interface SiteContent {
  navAbout:string;navStart:string;startLabel:string;howLabel:string;incomeLabel:string;privacyLabel:string;legalLabel:string;cookiesLabel:string;topLabel:string;privacyTitle:string;legalTitle:string;backLabel:string;
  brand: string; eyebrow: string; title: string; subtitle: string; subtitleHighlight:string; intro: string;
  howTitle: string; howIntro: string; steps: {title:string;text:string}[];
  incomeTitle:string; incomeText:string; incomeExamples:{title:string;calculation:string}[]; incomeDisclaimer:string;
  heroCta:string; contactTitle:string; contactText:string; contactCloseLabel:string; ctaTitle:string; ctaText:string; ctaHighlight:string; buttons:SocialLinks;
  organizer:string; contact:string; legalText:string; privacyText:string; metrikaId:string;
}
export interface Campaign {id:string;name:string;category:'offline'|'online'|null;budget:number;status:string;createdAt:string}
export interface Source {
 id:string;name:string;code:string;printCode:string;campaignId:string|null;category:string;platform:string;partner:string;
 city:string;district:string;placement:string;material:string;creative:string;cost:number;launchDate:string;active:boolean;comments:string;
 utmSource:string;utmMedium:string;utmCampaign:string;utmContent:string;utmTerm:string;isTest:boolean;links:SocialLinks;
 createdAt:string;urls?:{main:string;vk:string;telegram:string;max:string};metrics?:Metrics;
}
export interface Settings {links:SocialLinks;linkModes:Record<Network,'plain'|'source'|'click'>;timezone:string;retentionDays:number;metrikaId:string;draft:SiteContent;published:SiteContent;categories:string[];platforms:string[]}
export interface Metrics {incoming:number;visits:number;sessions:number;vk:number;telegram:number;max:number;clicks:number;convertedSessions:number;conversion:number;confirmed:number;cost:number;costPerVisit:number|null;costPerSession:number|null;costPerClick:number|null;costPerLead:number|null}
export interface Report {metrics:Metrics;unattributed:Metrics;confirmedByType:Record<string,number>;daily:{date:string;visits:number;clicks:number;confirmed:number}[];sources:(Source & {metrics:Metrics})[];campaigns:(Campaign & {metrics:Metrics})[];quality:{raw:number;clean:number;excluded:number};timezone:string}
export interface Bootstrap {campaigns:Campaign[];sources:Source[];settings:Settings;report:Report;audit:{id:string;action:string;actor:string;createdAt:string;details:unknown}[];linkHistory:{id:string;sourceId:string|null;network:Network;oldUrl:string;newUrl:string;createdAt:string}[]}
export const defaultContent: SiteContent = {
 navAbout:'О проекте',navStart:'Начать зарабатывать',startLabel:'Узнайте подробности у менеджера',howLabel:'02 / О ПРОЕКТЕ',incomeLabel:'03 / ВОЗМОЖНОСТИ',privacyLabel:'Политика конфиденциальности',legalLabel:'Правовая информация',cookiesLabel:'Настройки cookies',topLabel:'Наверх',privacyTitle:'Политика конфиденциальности',legalTitle:'Информация об организаторе',backLabel:'На главную',
 brand:'IziWork',eyebrow:'Удаленная работа для всех',title:'Зарабатывай онлайн',subtitle:'Дополнительный доход без опыта и вложений.',subtitleHighlight:'без опыта и вложений',
 intro:'Заработок с первого дня: получите инструкции, выполните задание и получите оплату на карту.\nРабота от получаса в день: можно совмещать с основной работой.\nКомпьютер не нужен: достаточно наличие телефона с доступом в интернет.\nРабота для всех: особых навыков не требуется. Без вложений!\nУсловия: только граждане РФ, старше 18 лет!',
 howTitle:'Понятный путь к первым заданиям',howIntro:'Сначала — информация. Затем — ваше решение.',
 steps:[{title:'Познакомьтесь с проектом',text:'Организатор дополнит этот раздел информацией о себе и предлагаемых возможностях.'},{title:'Изучите условия',text:'Содержание заданий, требования и порядок оплаты публикуются организатором на выбранной площадке.'},{title:'Выберите и начните',text:'Перед выполнением задания изучите все условия. Участие и выбор заданий остаются за вами.'}],
 incomeTitle:'Доход складывается из ваших действий',incomeText:'Здесь появятся проверяемые примеры выполненных заданий и расчёты вознаграждения. Организатор добавит их после проверки условий.',incomeExamples:[],incomeDisclaimer:'Размер вознаграждения зависит от условий и количества выполненных заданий. Доход не гарантирован. Вознаграждение за задание не является суммой кредита или займа.',
 heroCta:'Связаться с нами.',contactTitle:'Давайте обсудим работу',contactText:'Выберите удобную площадку и напишите нам. Менеджер расскажет о задачах и ответит на Ваши вопросы.',contactCloseLabel:'Закрыть окно связи',ctaTitle:'Напишите нам',ctaText:'И мы расскажем, как заработать от 3000 ₽ уже сегодня',ctaHighlight:'от 3000 ₽',buttons:{vk:'Перейти во ВКонтакте',telegram:'Перейти в Telegram',max:'Перейти в MAX'},
 organizer:'Организатор: укажите имя или наименование до публикации',contact:'Укажите контакт для связи в настройках',legalText:'Заполните юридические сведения об организаторе, условия участия, возрастные ограничения и порядок обращения до запуска.',
 privacyText:'Укажите оператора персональных данных и контакт для обращений. Сайт регистрирует технические обращения, источник рекламы, время, тип устройства и переходы по ссылкам. Полные IP-адреса в аналитике не сохраняются. Короткоживущие идентификаторы используются для защиты запросов; сохранение аналитической сессии и Яндекс.Метрика включаются только после согласия. По умолчанию аналитические события удаляются через 90 дней. Разместите здесь утверждённую владельцем политику с целями, основаниями обработки, сроками и порядком реализации прав.',metrikaId:''
};
