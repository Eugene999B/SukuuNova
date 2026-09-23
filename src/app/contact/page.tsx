import Link from "next/link";
import { HomeHeader } from "@/components/HomeHeader";
import { ContactOptions } from "@/components/ContactOptions";
import "../home.css";
import "../home-experience.css";
import "../nova-public.css";
export default function ContactPage(){return <main className="nova-public"><div className="nova-wrap"><HomeHeader/><ContactOptions/><footer className="nova-footer"><Link href="/">Back to SukuuNova</Link><span>© 2026 SukuuNova</span></footer></div></main>;}
