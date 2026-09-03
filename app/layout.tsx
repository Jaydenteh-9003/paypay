import type { Metadata, Viewport } from 'next';
import { siteUrl } from '@/lib/site-url';
import './globals.css';
export const metadata: Metadata = {
metadataBase: siteUrl,
alternates: { canonical: '/' },
title: 'Paypay — A little clarity, every day',
description: 'Your personal space for everyday expenses, freelance income, and campus life. Saved on your device.',
openGraph: { title: 'Paypay — A little clarity, every day', description: 'Everyday expenses, freelance income, and campus life. Your money, at a glance.', type: 'website', images: [{ url: '/og.png', width: 1729, height: 910, alt: 'paypay. A little clarity, every day.' }] },
twitter: { card: 'summary_large_image', title: 'Paypay — A little clarity, every day', description: 'A personal finance tracker, saved on your device.', images: ['/og.png'] },
manifest: '/manifest.webmanifest',
appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Paypay' },
icons: { icon: '/favicon.svg', apple: '/icons/apple-touch-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#304d38' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
