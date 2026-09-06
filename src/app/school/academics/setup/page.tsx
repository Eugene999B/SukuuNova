import { AppShell } from "@/components/AppShell";
import { AcademicSetupConsole } from "@/components/AcademicSetupConsole";
import "./academic-setup.css";

export default function AcademicSetupPage(){
  return <AppShell universe="school" title="Academic Setup" subtitle="Calendar, hours, grading and report behaviour." active="Academic Setup"><AcademicSetupConsole /></AppShell>;
}
