import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import SchoolSettingsWorkspace from "./SchoolSettingsWorkspace";
import "./settings.css";

export default async function SchoolSettingsPage(){
 const session=await requireSchoolSession();
 return <AppShell universe="school" title="School Settings" subtitle="Configure the school, academic rules and the timeline that powers every term-aware workflow." active="School Settings" schoolName={session.name} schoolCode=""><SettingsLoader sessionName={session.name}/></AppShell>;
}

async function SettingsLoader({sessionName}:{sessionName:string}){
 const origin=process.env.NEXT_PUBLIC_APP_URL||"http://localhost:3000";
 const cookie=(await import("next/headers")).cookies;
 const cookieHeader=(await cookie()).toString();
 const response=await fetch(`${origin}/api/school/settings`,{headers:{cookie:cookieHeader},cache:"no-store"});
 const data=await response.json();
 if(!response.ok) throw new Error(data.error??"Unable to load school settings.");
 return <SchoolSettingsWorkspace initial={data} dataSession={{name:sessionName}}/>;
}
