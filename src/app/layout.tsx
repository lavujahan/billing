import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Noto_Sans_Tamil } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

const tamil = Noto_Sans_Tamil({
  variable: "--font-tamil",
  subsets: ["tamil"],
});

export const metadata: Metadata = {
  title: "Business Assistant · வணிக உதவி",
  description: "Tamil-first billing, purchase, expense and collection assistant",
  appleWebApp: { capable: true, title: "Business Assistant", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0F6E66",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ta" className={`${hanken.variable} ${tamil.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
