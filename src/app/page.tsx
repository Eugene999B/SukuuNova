import Link from "next/link";
import { ArrowRight, BookOpen, Building2, Compass, MessageCircle } from "lucide-react";
import { HomeHeader } from "@/components/HomeHeader";
import "./home.css";
import "./home-experience.css";
import "./nova-public.css";
import "./gateway.css";

export const metadata = {
  title: "SukuuNova | Learn, discover and manage your school",
  description: "Choose your next step: practise a subject, try a discovery challenge, manage your school or talk to SukuuNova.",
};

const destinations = [
  { title: "Learn & practise", detail: "Subjects, courses and exam practice.", href: "/learn", icon: BookOpen, tone: "learn" },
  { title: "Discover & create", detail: "Free challenges and your own projects.", href: "/explore", icon: Compass, tone: "discover" },
  { title: "For your school", detail: "Explore tools for your school day.", href: "/for-schools", icon: Building2, tone: "school" },
  { title: "Talk to us", detail: "Message, WhatsApp, call or email.", href: "/contact", icon: MessageCircle, tone: "contact" },
] as const;

export default function HomePage() {
  return (
    <div className="nova-public nova-gateway">
      <div className="nova-wrap gateway-shell">
        <HomeHeader />
        <main id="home-content" className="gateway-main">
          <div className="gateway-intro">
            <span className="nova-eyebrow">WELCOME TO SUKUUNOVA</span>
            <h1>What brings you here today?</h1>
            <p>Pick a place to start. We’ll take it from there.</p>
          </div>
          <nav className="gateway-choices" aria-label="Choose your next step">
            {destinations.map(({ title, detail, href, icon: Icon, tone }) => (
              <Link key={href} href={href} className={`gateway-choice gateway-choice-${tone}`}>
                <span className="gateway-icon"><Icon size={25} aria-hidden="true" /></span>
                <span className="gateway-choice-copy"><strong>{title}</strong><span>{detail}</span></span>
                <ArrowRight className="gateway-arrow" size={20} aria-hidden="true" />
              </Link>
            ))}
          </nav>
          <p className="gateway-signin">Already part of a school? <Link href="/login/school">Sign in <ArrowRight size={16} aria-hidden="true" /></Link></p>
        </main>
        <footer className="gateway-footer">
          <span>© 2026 SukuuNova</span>
          <nav aria-label="More from SukuuNova">
            <Link href="/learn/remember">Remember</Link>
            <Link href="/about">About us</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
