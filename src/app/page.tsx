import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BookOpen, Medal, BrainCircuit, Building2, GraduationCap, LogIn, ShieldCheck, Sparkles, Users, WalletCards } from "lucide-react";
import "./home.css";
import "./home-photos.css";
import "./home-experience.css";
import { HomeLeadChat } from "@/components/HomeLeadChat";
import { HomeHelpBar } from "@/components/HomeHelpBar";
import { HomeProductPreview } from "@/components/HomeProductPreview";
import { HomeHeader } from "@/components/HomeHeader";

const modules = [
  ["Students & families", "Keep admissions, learner records and family details together.", Users, "/features/students-families"],
  ["Teaching & learning", "Plan classes, lessons, marks, homework and reports in one place.", GraduationCap, "/features/academics"],
  ["Attendance & safety", "Record attendance, follow absences and keep families informed.", ShieldCheck, "/features/attendance-safety"],
  ["Fees & finance", "Track fees, invoices, payments, balances and receipts clearly.", WalletCards, "/features/fees-finance"],
] as const;

export default function HomePage() {
  return (
    <main className="home-shell home-shell-next">
      <div className="home-ambient home-ambient-one" aria-hidden="true" />
      <div className="home-ambient home-ambient-two" aria-hidden="true" />
      <div className="home-wrap">
        <HomeHeader />

        <section className="hero hero-reframed" id="platform">
          <div className="hero-copy-wrap">
            <div className="eyebrow"><Sparkles size={13} aria-hidden="true" /> School management + independent learning</div>
            <h1>Run schools. <span>Power learning.</span></h1>
            <p className="hero-copy">A learning space for curious minds. A connected workspace for schools. Practise a subject, prepare for an exam, or manage the school day—all from SukuuNova.</p>
            <div className="hero-actions"><Link className="primary-cta" href="/learn">Start learning <ArrowRight size={16} aria-hidden="true" /></Link><Link className="secondary-cta" href="/login/school">Open school management <ArrowRight size={16} aria-hidden="true" /></Link></div>
            <div className="hero-proof"><Image className="proof-logo" src="/icon.svg" alt="" width={36} height={36} /><div><strong>One SukuuNova. Two distinct experiences.</strong><span>Learning practice works without a sign-in; school operations keep their secure role-based access.</span></div></div>
          </div>

          <div className="home-learn-stage" aria-label="Find your learning path">
            <div className="home-learn-stage-title"><span>✦ SUKUUNOVA LEARN</span><strong>What are you curious about today?</strong><p>A class, a course, a big exam. Start where you are.</p></div>
            <div className="home-learn-paths">
             <Link href="/learn/explore?lane=school"><BookOpen size={22}/><span><strong>School subjects</strong><small>Foundation practice · later years mapped</small></span><ArrowRight size={17}/></Link>
             <Link href="/learn/explore?lane=exam"><Medal size={22}/><span><strong>Exam preparation</strong><small>BECE · WASSCE · IELTS mapped</small></span><ArrowRight size={17}/></Link>
             <Link href="/learn/explore?lane=university"><GraduationCap size={22}/><span><strong>University courses</strong><small>Course maps · reviewed practice expanding</small></span><ArrowRight size={17}/></Link>
             <Link href="/learn/explore?lane=skills"><Sparkles size={22}/><span><strong>Skills for what’s next</strong><small>Digital · Career · Aptitude</small></span><ArrowRight size={17}/></Link>
            </div><div className="home-learn-stage-note">Choose a topic. Set your pace. Understand each answer.</div>
          </div>
        </section>


        <section className="home-product-doors" aria-label="Choose a SukuuNova product">
          <Link className="home-product-door home-product-door-learn" href="/learn">
            <span className="home-product-door-icon"><BrainCircuit size={24} aria-hidden="true" /></span>
            <span className="section-kicker">SUKUUNOVA LEARN</span>
            <h2>Questions that adapt to what you want to learn.</h2>
            <p>Choose a mapped school, exam or course path and SukuuNova will show what is genuinely practice-ready. Available sessions include marking, explanations and browser-local progress; mapped paths without validated question depth stay clearly unavailable.</p>
            <div className="home-product-door-tags"><span>Practice-ready paths</span><span>Exam Centre maps</span><span>No sign-in</span></div>
            <span className="home-product-door-link">Open the learning system <ArrowRight size={16} /></span>
          </Link>
          <Link className="home-product-door home-product-door-manage" href="/for-schools">
            <span className="home-product-door-icon"><Building2 size={24} aria-hidden="true" /></span>
            <span className="section-kicker">SCHOOL MANAGEMENT</span>
            <h2>Run the people, records and work behind the school day.</h2>
            <p>Manage students, families, teaching, attendance, fees, communication, reporting and role-aware school operations from one secure workspace.</p>
            <div className="home-product-door-tags"><span>Students & families</span><span>Academics</span><span>Finance</span></div>
            <span className="home-product-door-link">Explore school management <ArrowRight size={16} /></span>
          </Link>
        </section>

        <section className="home-confidence-strip" aria-label="SukuuNova product principles">
          <div><span>01</span><strong>One working record</strong><small>Stop rebuilding the same school information in separate places.</small></div>
          <div><span>02</span><strong>Role-aware access</strong><small>People get the tools and information that belong to their work.</small></div>
          <div><span>03</span><strong>Made for daily use</strong><small>Fast paths, clear actions and less hunting through software.</small></div>
        </section>

        <HomeHelpBar />

        <section className="product-story" aria-label="How SukuuNova brings school work together">
          <div className="product-story-head"><div><span className="section-kicker">THE PRODUCT, IN CONTEXT</span><h2>Move through school work without losing the thread.</h2></div><p>Choose a workstream below. The interface changes around the job, while the underlying school record stays connected.</p></div>
          <HomeProductPreview />
        </section>

        <section className="intent-grid" id="how-it-works" aria-label="Who SukuuNova is for">
          <Link className="intent-card intent-school" href="/for-schools"><span className="intent-icon"><Building2 size={20} aria-hidden="true" /></span><span className="section-kicker">SCHOOL LEADERS</span><h2>See what needs attention across the school.</h2><p>Bring people, academics, attendance and finance into one working view.</p><span className="intent-link">For schools <ArrowRight size={15} /></span></Link>
          <Link className="intent-card intent-users" href="/login/school"><span className="intent-icon"><LogIn size={20} aria-hidden="true" /></span><span className="section-kicker">STAFF &amp; FAMILIES</span><h2>Go straight to the work that belongs to you.</h2><p>Each person sees the tools and school records they need, without the clutter.</p><span className="intent-link">Go to school login <ArrowRight size={15} /></span></Link>
          <Link className="intent-card intent-network" href="/about"><span className="intent-icon"><ShieldCheck size={20} aria-hidden="true" /></span><span className="section-kicker">BUILT FOR TRUST</span><h2>Keep the right work with the right people.</h2><p>Clear roles and permissions help teams work confidently around shared school records.</p><span className="intent-link">About SukuuNova <ArrowRight size={15} /></span></Link>
        </section>

        <section className="modules" id="modules"><div className="section-kicker">WHAT YOU CAN RUN</div><div className="section-head"><div><h2>The school day, without the clutter.</h2><p>Start with the part of school you manage. Follow the link to see the work and the tools behind it.</p></div></div><div className="module-grid">{modules.map(([title, copy, Icon, href], index) => <Link className="module-card" href={href} key={title}><span className="module-index">0{index + 1}</span><span className="module-icon"><Icon size={20} aria-hidden="true" /></span><h3>{title}</h3><p>{copy}</p><span className="module-arrow"><ArrowRight size={16} aria-hidden="true" /></span></Link>)}</div></section>

        <section className="closing-cta"><div><span className="section-kicker">READY WHEN YOUR SCHOOL IS</span><h2>Put the school in one place.</h2><p>Give your team one system for the records and work they already manage every day.</p></div><div className="closing-cta-actions"><Link className="primary-cta" href="/for-schools">See SukuuNova for schools <ArrowRight size={16} aria-hidden="true" /></Link><HomeLeadChat /></div></section>
        <footer className="footer"><span>© 2026 SukuuNova</span><span>School work, kept together.</span><span><Link href="/about">About</Link> · <Link href="/contact">Contact</Link> · <Link href="/login/platform">Platform access</Link></span></footer>
      </div>
    </main>
  );
}
