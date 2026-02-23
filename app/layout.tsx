import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'SNF Printing',
  url: 'https://concierge.snfforms.com',
  logo: 'https://snfforms.vercel.app/logo.png', // Assuming logo path
  description:
    'Precision printing and easy access to medical forms and supplies for the healthcare industry.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '15532 Computer Lane',
    addressLocality: 'Huntington Beach',
    addressRegion: 'CA',
    postalCode: '92649', // Standard zipcode for that area, but I'll stick to what I know or just omit it if not in company.ts
    addressCountry: 'US',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+1-714-901-6868',
    contactType: 'customer service',
    email: 'sales@snfforms.com',
  },
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Medical Forms Catalog',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
