import type { Network, NetworkAvailability, SocialLinks as SocialButtonLabels } from '@/lib/contracts';
import { ArrowIcon, SocialIcon } from './social-icon';

const networks: Network[] = ['vk', 'telegram', 'max'];
const names: Record<Network, string> = { vk: 'ВКонтакте', telegram: 'Telegram', max: 'MAX' };

export function SocialLinks({ token, buttons, preview = false, available = {} }: { token: string; buttons: SocialButtonLabels; preview?: boolean; available?: NetworkAvailability }) {
 return <div className="social-grid">
  {networks.map(network => {
   const enabled = available[network] !== false;
   const inner = <><span className={`social-mark social-${network}`}><SocialIcon platform={network} size={30} /></span><span className="social-card-copy"><span className="social-card-name">{names[network]}</span><span className="social-card-action">{enabled ? buttons[network] : 'Скоро'}</span></span>{enabled && <ArrowIcon diagonal className="social-card-arrow" />}</>;
   return preview || !enabled ? <span key={network} className="social-card" aria-disabled="true">{inner}</span> : <a key={network} className="social-card" href={`/go/${network}?token=${encodeURIComponent(token)}&newtab=1`} target="_blank" data-social={network} rel="nofollow noopener noreferrer">{inner}</a>;
  })}
 </div>;
}
