import type { Metadata } from "next";
import { RobotRescue } from "./RobotRescue";
import "./rescue.css";
export const metadata:Metadata={
 title:"Robot Rescue: Signal Isles | SukuuNova Play",
 description:"A free physics rescue adventure. Plan a flight, judge wind and gravity, and bring six island robots home."
};
export default function PlayPage(){return <RobotRescue/>;}
