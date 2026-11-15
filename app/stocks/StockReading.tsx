import { stockReadingLinks } from "@/lib/stock-reading";
import styles from "./stock-reading.module.css";

export function StockReading({ holdingName }: Readonly<{ holdingName?: string }>) {
  const links = stockReadingLinks(holdingName);
  if (!links.length) return null;
  return <section className={styles.reading} aria-label="Stock reading">
    <div><p className={styles.eyebrow}>KEEP UP WITH YOUR HOLDING</p><h2>Reading &amp; news</h2><p>Find news and updates about {holdingName}.</p></div>
    <div className={styles.sources}>{links.map(link => <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer"><span><strong>{link.name}</strong><small>{link.description}</small></span><span aria-hidden="true">↗</span></a>)}</div>
    <p className={styles.note}>Opens an external site and shares the company name with that site. Your balance and account details stay in Drip.</p>
  </section>;
}
