"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Presence={brandName:string;tagline:string;supportEmail?:string|null;supportPhone?:string|null;whatsappNumber?:string|null;tiktokHandle?:string|null;instagramHandle?:string|null;facebookHandle?:string|null;linkedinHandle?:string|null;youtubeHandle?:string|null;xHandle?:string|null;websiteUrl?:string|null;showSocialLinks?:boolean;showLeadChat?:boolean};

function socialUrl(kind:string,value:string){const handle=value.replace(/^@/,"");if(/^https?:\/\//.test(value))return value;const base:Record<string,string>={tiktok:"https://www.tiktok.com/@",instagram:"https://www.instagram.com/",facebook:"https://www.facebook.com/",linkedin:"https://www.linkedin.com/in/",youtube:"https://www.youtube.com/@",x:"https://x.com/"};return base[kind]+handle;}
export function PublicPresenceStrip(){
 const [p,setP]=useState<Presence|null>(null); useEffect(()=>{void fetch("/api/public/presence").then(r=>r.json()).then(setP).catch(()=>null)},[]); if(!p)return null;
 const socials=[['TikTok',p.tiktokHandle,'tiktok'],['Instagram',p.instagramHandle,'instagram'],['Facebook',p.facebookHandle,'facebook'],['LinkedIn',p.linkedinHandle,'linkedin'],['YouTube',p.youtubeHandle,'youtube'],['X',p.xHandle,'x']].filter((x):x is [string,string,string]=>Boolean(x[1]));
 return <section className="public-presence" aria-label="SukuuNova contact and social links"><div><span className="section-kicker">COME AND SAY HELLO</span><h2>{p.tagline}</h2><p>We build SukuuNova with schools, people and the real work of a school day in mind.</p></div><div className="public-presence-links">{p.supportEmail&&<a href={`mailto:${p.supportEmail}`}>Email us <span>{p.supportEmail}</span></a>}{p.supportPhone&&<a href={`tel:${p.supportPhone}`}>Call us <span>{p.supportPhone}</span></a>}{p.whatsappNumber&&<a target="_blank" rel="noreferrer" href={`https://wa.me/${p.whatsappNumber.replace(/\D/g,"")}`}>WhatsApp <span>{p.whatsappNumber}</span></a>}{p.showLeadChat&&<Link href="/contact#message">Send a message <span>Talk to a human</span></Link>}</div>{p.showSocialLinks&&socials.length>0&&<div className="public-social-row">{socials.map(([label,value,key])=><a key={label} href={socialUrl(key,value)} target="_blank" rel="noreferrer">{label}<span>{value.startsWith('@')?value:`@${value}`}</span></a>)}</div>}</section>;
}
