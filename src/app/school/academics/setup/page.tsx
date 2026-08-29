import { AppShell } from "@/components/AppShell";
import { AcademicSetupConsole } from "@/components/AcademicSetupConsole";
import "./academic-setup.css";

export default function AcademicSetupPage(){
  return <AppShell universe="school" title="Academic Setup" subtitle="Configure the school calendar, teaching hours, bell schedule, grading rules and report-card behaviour from one academic control centre." active="Academic Setup"><AcademicSetupConsole /></AppShell>;
}
