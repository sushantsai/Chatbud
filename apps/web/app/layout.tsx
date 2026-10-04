import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Chatbud · Care for everyday life',description:'Find mental-health and nutrition professionals, manage care, and explore wellness products.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
