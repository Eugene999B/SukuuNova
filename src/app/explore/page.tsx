import type { Metadata } from "next";
import { HomeHeader } from "@/components/HomeHeader";
import { DiscoveryStudio } from "./DiscoveryStudio";
import "../home.css";
import "../home-experience.css";
import "../nova-public.css";
import "./studio.css";
export const metadata:Metadata={title:"Discovery Studio | SukuuNova",description:"Free hands-on challenges. Run a market, plan clean energy and investigate evidence."};
export default function ExplorePage(){return <main className="nova-public"><div className="nova-wrap"><HomeHeader/><DiscoveryStudio/></div></main>;}
