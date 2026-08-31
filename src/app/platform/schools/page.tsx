import Link from "next/link";
import PlatformAdminWorkspace from "@/components/PlatformAdminWorkspace";
export default function SchoolsPage(){return <><div style={{maxWidth:1480,margin:"0 auto",padding:"0 0 14px"}}><Link href="/platform/schools/new" className="app-action"><strong>＋ Create school</strong>Onboard a new school account</Link></div><PlatformAdminWorkspace section="schools"/></>;}
