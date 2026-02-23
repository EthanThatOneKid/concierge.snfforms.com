import React from 'react';
import { Metadata } from 'next';
import LiveAudio from './components/LiveAudio';

export const metadata: Metadata = {
  title: 'AI Voice Concierge | SNF Printing',
  description:
    'Precision printing and easy access to medical forms and supplies for the healthcare industry.',
  icons: {
    icon: '/brand-logo.png',
    shortcut: '/brand-logo.png',
    apple: '/brand-logo.png',
  },
  openGraph: {
    title: 'SNF Printing AI Voice Concierge',
    description:
      'Interact with our AI Voice Concierge to find medical forms and supplies with ease.',
    siteName: 'SNF Printing',
    locale: 'en_US',
    type: 'website',
  },
};

export default function Page() {
  return (
    <main style={{ margin: 0, padding: 0 }}>
      <LiveAudio />
    </main>
  );
}
