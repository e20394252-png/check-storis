import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Регистрация на мероприятие",
  description: "Зарегистрируйся на мероприятие через Telegram — загрузи скриншот репоста",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-theme="light" data-palette="sand">
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('cs-theme');
            if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
            var p = localStorage.getItem('cs-palette');
            if (p === 'sand' || p === 'indigo' || p === 'emerald' || p === 'mono') {
              document.documentElement.setAttribute('data-palette', p);
            } else {
              document.documentElement.setAttribute('data-palette', 'sand');
            }
          } catch(e) {}
        `}} />
      </head>
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
