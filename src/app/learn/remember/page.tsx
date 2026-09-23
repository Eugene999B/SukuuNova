import type {Metadata} from "next";
import {Remember} from "./Remember";
import "../../explore/studio.css";
export const metadata:Metadata={title:"Remember | SukuuNova Learn",description:"Short spaced reviews of what you have practised."};
export default function RememberPage(){return <Remember/>;}
