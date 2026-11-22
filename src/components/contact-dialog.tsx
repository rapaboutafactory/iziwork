'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { NetworkAvailability, SocialLinks as SocialButtonLabels } from '@/lib/contracts';
import { SocialLinks } from './social-links';
import { ArrowIcon } from './social-icon';

const ContactDialogContext = createContext<{ id: string; show: (trigger: HTMLButtonElement) => void } | null>(null);

export function ContactTrigger({ label, variant }: { label: string; variant: 'hero' | 'header' }) {
 const contact = useContext(ContactDialogContext);
 if (!contact) throw new Error('ContactTrigger requires ContactDialogProvider');

 return <button type="button" className={variant === 'header' ? 'nav-start' : 'hero-anchor'}
  aria-haspopup="dialog" aria-controls={contact.id} onClick={event => contact.show(event.currentTarget)}>
  {variant === 'hero' && <span className="hero-anchor-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4H6a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h1v4l4-4h4a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3Z"/><path d="M18 9a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-1v3l-3-3h-2"/></svg></span>}
  <span className={variant === 'hero' ? 'hero-anchor-label' : undefined}>{label}</span>
  {variant === 'header' && <ArrowIcon diagonal />}
 </button>;
}

export function ContactDialogProvider({ title, text, closeLabel, token, buttons, preview = false, available, children }: {
 title: string; text: string; closeLabel: string; token: string;
 buttons: SocialButtonLabels; preview?: boolean; available?: NetworkAvailability; children: ReactNode;
}) {
 const id = useId();
 const dialog = useRef<HTMLDialogElement>(null);
 const heading = useRef<HTMLHeadingElement>(null);
 const lastTrigger = useRef<HTMLButtonElement | null>(null);
 const backdropPress = useRef(false);
 const [open, setOpen] = useState(false);

 useEffect(() => {
  if (!open) return;
  const previous = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => { document.body.style.overflow = previous; };
 }, [open]);

 const show = useCallback((trigger: HTMLButtonElement) => {
  if (!dialog.current || dialog.current.open) return;
  lastTrigger.current = trigger;
  backdropPress.current = false;
  dialog.current.showModal();
  setOpen(true);
  heading.current?.focus();
 }, []);

 return <ContactDialogContext.Provider value={{ id, show }}>
  {children}
  <dialog ref={dialog} id={id} className="contact-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`}
   onClose={() => {
    setOpen(false);
    backdropPress.current = false;
    if (lastTrigger.current?.isConnected) lastTrigger.current.focus({ preventScroll: true });
   }}
   onPointerDown={event => { backdropPress.current = event.target === event.currentTarget; }}
   onClick={event => { if (backdropPress.current && event.target === event.currentTarget) dialog.current?.close(); }}>
   <div className="contact-dialog-panel">
    <button type="button" className="contact-dialog-close" aria-label={closeLabel} onClick={() => dialog.current?.close()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
    <span className="contact-dialog-badge" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.9-5.5a9.5 9.5 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 11h8M8 15h5"/></svg></span>
    <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{title}</h2>
    <p id={`${id}-text`}>{text}</p>
    <SocialLinks token={token} buttons={buttons} preview={preview} available={available}/>
   </div>
  </dialog>
 </ContactDialogContext.Provider>;
}
