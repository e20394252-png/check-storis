import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Регистрация на мероприятие",
  description: "Зарегистрируйся на мероприятие через Telegram — загрузи скриншот репоста",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-theme="light">
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('cs-theme');
            if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
          } catch(e) {}
        `}} />
      </head>
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
