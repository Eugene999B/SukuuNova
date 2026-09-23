import { SUKUUNOVA_CONTACT } from "@/lib/sukuunova-contact";
import { HomeHelpBar } from "./HomeHelpBar";

export function ContactOptions() {
 return <section className="nova-contact" id="contact" aria-labelledby="contact-heading">
  <div><span className="nova-eyebrow">WE'RE HERE TO HELP</span><h2 id="contact-heading">Let’s talk.</h2><p>Need help learning, setting up your school, or finding your way around? Send a message, WhatsApp us, or give us a call.</p></div>
  <div className="nova-contact-grid">{SUKUUNOVA_CONTACT.phones.map((phone,index)=><div key={phone.number}><h3>{index===0?"Call or WhatsApp":"Another way to reach us"}</h3><strong>{phone.label}</strong><div className="nova-actions"><a href={"tel:+"+phone.number}>Call</a><a href={"https://wa.me/"+phone.number} target="_blank" rel="noreferrer">WhatsApp ↗</a></div></div>)}
  <div><h3>Write to us</h3><a href={"mailto:"+SUKUUNOVA_CONTACT.email}>{SUKUUNOVA_CONTACT.email}</a><p>Find us as <strong>SukuuNova</strong> on Facebook and TikTok.</p></div></div>
  <HomeHelpBar />
 </section>;
}
