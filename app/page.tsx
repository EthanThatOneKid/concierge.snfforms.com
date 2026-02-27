import React from 'react';
import { Metadata } from 'next';
import LiveAudio from './components/LiveAudio';
import { companyInfo } from './components/company';

export const metadata: Metadata = {
  title: `AI Voice Concierge | ${companyInfo.name}`,
  description: companyInfo.description,
  icons: {
    icon: '/brand-logo.png',
    shortcut: '/brand-logo.png',
    apple: '/brand-logo.png',
  },
  openGraph: {
    title: `${companyInfo.name} AI Voice Concierge`,
    description:
      'Interact with our AI Voice Concierge to find medical forms and supplies with ease.',
    siteName: companyInfo.name,
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
