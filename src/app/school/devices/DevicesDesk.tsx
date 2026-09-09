"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Clock3,
  Fingerprint,
  KeyRound,
  MonitorSmartphone,
  QrCode,
  Radio,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UsersRound,
  Wifi,
  WifiOff
} from "lucide-react";
import { CameraCapture } from "@/components/CameraCapture";
import "./attendance-control.css";

type Tab = "overview" | "rules" | "devices" | "identity" | "activity";
type AttendanceConfig = {
  operatingDays: number[];
  methods: { manualStudent:boolean; qrStaff:boolean; faceDevice:boolean; fingerprintDevice:boolean; cardDevice:boolean };
  staff: { verificationOpenTime:string; verificationCloseTime:string; checkoutCloseTime:string; qrRequireFace:boolean; qrRequirePresence:boolean };
  student: { verificationOpenTime:string; verificationCloseTime:string; checkoutCloseTime:string; manualRegisterCloseTime:string };
  qr: { rotationSeconds:number; challengeTtlSeconds:number; maxDistanceMeters:number };
  devices: { onlineWindowSeconds:number; maxBufferedAgeMinutes:number };
};
type ControlData = {
  config: AttendanceConfig;
  settings: { expectedResumptionTime:string; attendanceGraceMinutes:number; faceMatchThreshold:number; timezone:string };
  readiness: { activeDevices:number; mappedHardwareIdentities:number; faceEnrollments:number; pendingFaceReviews:number };
  recentEvents: Array<{ id:string; type:string; method:string; timestamp:string; attendanceDate:string; isLate:boolean|null; confidenceScore:number|null; device?:{id:string;label:string;deviceSerial:string}|null; student?:{id:string;name:string;admissionNo:string;class?:{name:string;level:string|null}|null}|null; staff?:{id:string;name:string}|null }>;
};
type CatalogItem = { id:string; vendor:string; model:string; label:string; description:string; kind:"face"|"fingerprint"|"card"; capabilities:Array<"face"|"fingerprint"|"card">; connectionMode:string; readiness:"native"|"bridge_required"; notes:string };
type Device = { id:string; deviceSerial:string; kind:string; label:string; status:string; lastSeenAt:string|null; createdAt:string; online:boolean; profile?:{vendor:string;model:string;connectionMode:string;capabilities:unknown;locationLabel:string|null;lastHeartbeatAt:string|null;firmwareVersion:string|null;bridgeVersion:string|null;statusMessage:string|null}|null };
type DeviceData = { devices:Device[]; catalog:CatalogItem[]; onlineWindowSeconds:number };
type HardwareIdentity = { id:string; deviceKind:string; externalId:string; studentId:string|null; staffId:string|null; createdAt:string };
type Person = { id:string; name:string; admissionNo?:string; email?:string|null };
type IdentityData = { identities:HardwareIdentity[]; students:Person[]; staff:Person[] };
type EnrollmentStudent = Person & { class?:{name:string;level:string|null}|null; guardians:Array<{isPrimary:boolean;guardian:{id:string;name:string;phone:string|null}}> };
type EnrollmentData = { staff:Array<Person & {status:string}>; students:EnrollmentStudent[]; faceEnrollments:Array<{id:string;studentId:string|null;staffId:string|null;enrolledAt:string;consentByGuardianId:string|null}> };
type Deployment = { secret:string; serial:string; kind:string; catalog:CatalogItem; label:string };

const tabs: Array<{id:Tab;label:string;icon:typeof Settings2}> = [
  { id:"overview", label:"Overview", icon:Activity },
  { id:"rules", label:"Rules & time", icon:Clock3 },
  { id:"devices", label:"Physical terminals", icon:Fingerprint },
  { id:"identity", label:"Identity enrollment", icon:UserCheck },
  { id:"activity", label:"Live activity", icon:Radio }
];
const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function DevicesDesk({ schoolCode }: { schoolCode:string }) {
  const [tab,setTab]=useState<Tab>("overview");
  const [control,setControl]=useState<ControlData|null>(null);
  const [deviceData,setDeviceData]=useState<DeviceData>({devices:[],catalog:[],onlineWindowSeconds:180});
  const [identityData,setIdentityData]=useState<IdentityData>({identities:[],students:[],staff:[]});
  const [enrollmentData,setEnrollmentData]=useState<EnrollmentData>({staff:[],students:[],faceEnrollments:[]});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [deployment,setDeployment]=useState<Deployment|null>(null);

  const load=useCallback(async()=>{
    setError("");
    try{
      const [a,b,c,d]=await Promise.all([
        fetch("/api/school/attendance/control",{cache:"no-store"}),
        fetch("/api/school/devices",{cache:"no-store"}),
        fetch("/api/school/devices/identities",{cache:"no-store"}),
        fetch("/api/school/attendance/enrollment-context",{cache:"no-store"})
      ]);
      const [ca,db,ib,eb]=await Promise.all([a.json(),b.json(),c.json(),d.json()]);
      if(!a.ok)throw new Error(ca.message??ca.error??"Could not load attendance control.");
      if(!b.ok)throw new Error(db.message??db.error??"Could not load attendance devices.");
      if(!c.ok)throw new Error(ib.message??ib.error??"Could not load device identities.");
      if(!d.ok)throw new Error(eb.message??eb.error??"Could not load biometric enrollment context.");
      setControl(ca as ControlData);setDeviceData(db as DeviceData);setIdentityData(ib as IdentityData);setEnrollmentData(eb as EnrollmentData);
    }catch(e){setError(e instanceof Error?e.message:"Could not load Attendance Control Center.");}
  },[]);
  useEffect(()=>{void load();},[load]);

  const online=deviceData.devices.filter(d=>d.status==="active"&&d.online).length;
  const active=deviceData.devices.filter(d=>d.status==="active").length;
  const readiness=useMemo(()=>{
    if(!control)return 0;
    let score=20;
    if(control.settings.expectedResumptionTime)score+=20;
    if(control.config.methods.qrStaff)score+=20;
    if(active)score+=20;
    if(control.readiness.mappedHardwareIdentities||control.readiness.faceEnrollments)score+=20;
    return Math.min(100,score);
  },[control,active]);

  async function saveRules(){
    if(!control)return;setBusy(true);setMessage("");setError("");
    try{const r=await fetch("/api/school/attendance/control",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({config:control.config,expectedResumptionTime:control.settings.expectedResumptionTime,attendanceGraceMinutes:control.settings.attendanceGraceMinutes,faceMatchThreshold:control.settings.faceMatchThreshold})});const b=await r.json();if(!r.ok)throw new Error(b.message??b.error??"Could not save attendance rules.");setMessage("Attendance rules saved. QR, biometric devices and late classification now use this configuration.");await load();}catch(e){setError(e instanceof Error?e.message:"Could not save attendance rules.");}finally{setBusy(false);}
  }

  return <div className="attendance-control">
    <section className="attendance-control-hero">
      <div><span className="attendance-kicker">ATTENDANCE CONTROL CENTER</span><h2>One attendance system. Manual, QR, face and fingerprint.</h2><p>Configure when verification is allowed, connect physical terminals, enroll identities and monitor every attendance method in one place.</p></div>
      <div className="attendance-readiness"><span>System readiness</span><strong>{readiness}%</strong><small>{online}/{active} active terminals online</small></div>
    </section>

    {(message||error)?<div className={`attendance-notice ${error?"is-error":""}`} role="status"><strong>{error?"Needs attention":"Saved"}</strong><span>{error||message}</span></div>:null}

    <nav className="attendance-tabs" aria-label="Attendance control sections">{tabs.map(({id,label,icon:Icon})=><button type="button" key={id} onClick={()=>setTab(id)} className={tab===id?"is-active":""}><Icon size={16}/><span>{label}</span></button>)}</nav>

    {!control?<section className="attendance-panel"><strong>Loading attendance configuration…</strong></section>:null}
    {control&&tab==="overview"?<Overview control={control} devices={deviceData.devices} schoolCode={schoolCode} onOpen={setTab}/>:null}
    {control&&tab==="rules"?<Rules control={control} setControl={setControl} busy={busy} save={saveRules}/>:null}
    {control&&tab==="devices"?<Devices devices={deviceData.devices} catalog={deviceData.catalog} schoolCode={schoolCode} busy={busy} setBusy={setBusy} setMessage={setMessage} setError={setError} setDeployment={setDeployment} reload={load} deployment={deployment}/>:null}
    {control&&tab==="identity"?<Identity identityData={identityData} enrollmentData={enrollmentData} busy={busy} setBusy={setBusy} setMessage={setMessage} setError={setError} reload={load}/>:null}
    {control&&tab==="activity"?<ActivityFeed events={control.recentEvents} pending={control.readiness.pendingFaceReviews}/>:null}
  </div>;
}

function Overview({control,devices,schoolCode,onOpen}:{control:ControlData;devices:Device[];schoolCode:string;onOpen:(tab:Tab)=>void}){
  const online=devices.filter(d=>d.status==="active"&&d.online).length;
  return <div className="attendance-stack">
    <section className="attendance-metric-grid">
      <Metric icon={Clock3} label="Late after" value={`${control.settings.expectedResumptionTime} + ${control.settings.attendanceGraceMinutes} min`} detail={`Timezone ${control.settings.timezone}`}/>
      <Metric icon={Wifi} label="Terminals online" value={`${online}/${devices.filter(d=>d.status==="active").length}`} detail="Heartbeat or attendance event seen recently"/>
      <Metric icon={BadgeCheck} label="Enrolled identities" value={String(control.readiness.mappedHardwareIdentities+control.readiness.faceEnrollments)} detail={`${control.readiness.faceEnrollments} face · ${control.readiness.mappedHardwareIdentities} fingerprint/card`}/>
      <Metric icon={QrCode} label="Live QR" value={`${control.config.qr.rotationSeconds}s`} detail={control.config.staff.qrRequireFace?"QR + school presence + face":"QR + school presence"}/>
    </section>
    <section className="attendance-panel"><div className="attendance-section-head"><div><span>Choose how the school verifies attendance</span><h3>Three connected operating modes</h3></div></div><div className="attendance-mode-grid">
      <button type="button" onClick={()=>onOpen("devices")}><span className="attendance-mode-icon"><Fingerprint size={22}/></span><strong>Physical biometric terminals</strong><small>Face or fingerprint devices stay on at the gate. Verified scans become attendance automatically.</small><b>Configure terminals →</b></button>
      <Link href="/school/attendance/display" target="_blank"><span className="attendance-mode-icon"><QrCode size={22}/></span><strong>Live QR attendance station</strong><small>Low-cost option: put the rotating QR on a school screen; staff scan and verify their face.</small><b>Launch display ↗</b></Link>
      <Link href="/school/attendance"><span className="attendance-mode-icon"><UsersRound size={22}/></span><strong>Manual class register</strong><small>Class teachers and authorised leadership can mark the roster. Verified device rows remain connected.</small><b>Open attendance →</b></Link>
    </div></section>
    <section className="attendance-panel attendance-flow"><div className="attendance-section-head"><div><span>Connected workflow</span><h3>What happens after a scan</h3></div></div><div className="attendance-flow-row"><Flow n="1" title="Identity verified" text="Fingerprint ID, face match or signed-in QR user."/><Flow n="2" title="School rules checked" text="School day, open/close window, freshness and anti-replay."/><Flow n="3" title="Time classified" text="Present or late using the configured resumption time and grace period."/><Flow n="4" title="One attendance record" text="The same event feeds registers, alerts, reports and analytics."/></div></section>
    <section className="attendance-panel"><div className="attendance-section-head"><div><span>Deployment identity</span><h3>School connection code</h3></div></div><div className="attendance-code"><code>{schoolCode}</code><span>Used by authorised terminal/gateway requests together with the terminal serial and its one-time secret.</span></div></section>
  </div>;
}

function Rules({control,setControl,busy,save}:{control:ControlData;setControl:React.Dispatch<React.SetStateAction<ControlData|null>>;busy:boolean;save:()=>Promise<void>}){
  const patchConfig=(update:(config:AttendanceConfig)=>AttendanceConfig)=>setControl({...control,config:update(control.config)});
  const patchSettings=(patch:Partial<ControlData["settings"]>)=>setControl({...control,settings:{...control.settings,...patch}});
  return <div className="attendance-stack">
    <section className="attendance-panel"><div className="attendance-section-head"><div><span>School clock</span><h3>Present, late and closed</h3><p>These values are used by QR and terminals automatically. Manual corrections remain permission-controlled.</p></div></div><div className="attendance-form-grid">
      <Field label="Expected resumption" type="time" value={control.settings.expectedResumptionTime} onChange={v=>patchSettings({expectedResumptionTime:v})}/>
      <Field label="Late grace (minutes)" type="number" value={String(control.settings.attendanceGraceMinutes)} onChange={v=>patchSettings({attendanceGraceMinutes:Number(v)})}/>
      <Field label="Staff verification opens" type="time" value={control.config.staff.verificationOpenTime} onChange={v=>patchConfig(c=>({...c,staff:{...c.staff,verificationOpenTime:v}}))}/>
      <Field label="Staff check-in closes" type="time" value={control.config.staff.verificationCloseTime} onChange={v=>patchConfig(c=>({...c,staff:{...c.staff,verificationCloseTime:v}}))}/>
      <Field label="Student scan opens" type="time" value={control.config.student.verificationOpenTime} onChange={v=>patchConfig(c=>({...c,student:{...c.student,verificationOpenTime:v}}))}/>
      <Field label="Student check-in closes" type="time" value={control.config.student.verificationCloseTime} onChange={v=>patchConfig(c=>({...c,student:{...c.student,verificationCloseTime:v}}))}/>
      <Field label="Student checkout closes" type="time" value={control.config.student.checkoutCloseTime} onChange={v=>patchConfig(c=>({...c,student:{...c.student,checkoutCloseTime:v}}))}/>
      <Field label="Staff checkout closes" type="time" value={control.config.staff.checkoutCloseTime} onChange={v=>patchConfig(c=>({...c,staff:{...c.staff,checkoutCloseTime:v}}))}/>
    </div><div className="attendance-days"><strong>Operating days</strong><div>{dayNames.map((name,index)=><button type="button" key={name} className={control.config.operatingDays.includes(index)?"is-active":""} onClick={()=>patchConfig(c=>({...c,operatingDays:c.operatingDays.includes(index)?c.operatingDays.filter(d=>d!==index):[...c.operatingDays,index].sort()}))}>{name}</button>)}</div><small>Calendar holidays that affect attendance are still excluded automatically.</small></div></section>
    <section className="attendance-panel"><div className="attendance-section-head"><div><span>Live QR station</span><h3>Anti-cheat verification</h3></div></div><div className="attendance-form-grid"><Field label="QR rotation (seconds)" type="number" value={String(control.config.qr.rotationSeconds)} onChange={v=>patchConfig(c=>({...c,qr:{...c.qr,rotationSeconds:Number(v)}}))}/><Field label="QR location radius (m)" type="number" value={String(control.config.qr.maxDistanceMeters)} onChange={v=>patchConfig(c=>({...c,qr:{...c.qr,maxDistanceMeters:Number(v)}}))}/><Field label="Face match threshold (%)" type="number" value={String(control.settings.faceMatchThreshold)} onChange={v=>patchSettings({faceMatchThreshold:Number(v)})}/></div><div className="attendance-toggle-grid"><Toggle title="Require staff face after QR" detail="After the QR is scanned, the front camera must match the signed-in staff member." checked={control.config.staff.qrRequireFace} onChange={v=>patchConfig(c=>({...c,staff:{...c.staff,qrRequireFace:v}}))}/><Toggle title="Require school presence" detail="Use trusted school network and/or location verification before accepting the QR scan." checked={control.config.staff.qrRequirePresence} onChange={v=>patchConfig(c=>({...c,staff:{...c.staff,qrRequirePresence:v}}))}/></div></section>
    <section className="attendance-panel"><div className="attendance-section-head"><div><span>Allowed methods</span><h3>Turn attendance channels on or off</h3></div></div><div className="attendance-toggle-grid"><Toggle title="Manual student register" detail="Class teachers and authorised leadership can mark attendance from a class roster." checked={control.config.methods.manualStudent} onChange={v=>patchConfig(c=>({...c,methods:{...c.methods,manualStudent:v}}))}/><Toggle title="Staff rotating QR" detail="Allow the live school QR station for staff self check-in." checked={control.config.methods.qrStaff} onChange={v=>patchConfig(c=>({...c,methods:{...c.methods,qrStaff:v}}))}/><Toggle title="Face terminals" detail="Accept authenticated face-terminal attendance events." checked={control.config.methods.faceDevice} onChange={v=>patchConfig(c=>({...c,methods:{...c.methods,faceDevice:v}}))}/><Toggle title="Fingerprint terminals" detail="Accept authenticated fingerprint-terminal attendance events." checked={control.config.methods.fingerprintDevice} onChange={v=>patchConfig(c=>({...c,methods:{...c.methods,fingerprintDevice:v}}))}/><Toggle title="Card / RFID terminals" detail="Allow card/RFID attendance if the school deploys it." checked={control.config.methods.cardDevice} onChange={v=>patchConfig(c=>({...c,methods:{...c.methods,cardDevice:v}}))}/></div></section>
    <section className="attendance-panel"><div className="attendance-section-head"><div><span>Terminal health</span><h3>Online and buffered-event rules</h3></div></div><div className="attendance-form-grid"><Field label="Consider offline after (seconds)" type="number" value={String(control.config.devices.onlineWindowSeconds)} onChange={v=>patchConfig(c=>({...c,devices:{...c.devices,onlineWindowSeconds:Number(v)}}))}/><Field label="Maximum buffered scan age (minutes)" type="number" value={String(control.config.devices.maxBufferedAgeMinutes)} onChange={v=>patchConfig(c=>({...c,devices:{...c.devices,maxBufferedAgeMinutes:Number(v)}}))}/></div><div className="attendance-save"><span>After the configured scan window closes, new QR/biometric check-ins are rejected until the next school day.</span><button type="button" onClick={()=>void save()} disabled={busy}><Save size={15}/>{busy?"Saving…":"Save attendance rules"}</button></div></section>
  </div>;
}

function Devices({devices,catalog,schoolCode,busy,setBusy,setMessage,setError,setDeployment,reload,deployment}:{devices:Device[];catalog:CatalogItem[];schoolCode:string;busy:boolean;setBusy:(v:boolean)=>void;setMessage:(v:string)=>void;setError:(v:string)=>void;setDeployment:(v:Deployment|null)=>void;reload:()=>Promise<void>;deployment:Deployment|null}){
  const [catalogId,setCatalogId]=useState(catalog[0]?.id??"");const selected=catalog.find(c=>c.id===catalogId)??catalog[0];
  const [kind,setKind]=useState<"face"|"fingerprint"|"card">(selected?.kind??"fingerprint");const [serial,setSerial]=useState("");const [label,setLabel]=useState("Main Gate");const [location,setLocation]=useState("Main Gate");
  useEffect(()=>{if(selected&&!selected.capabilities.includes(kind))setKind(selected.kind);},[selected,kind]);
  async function register(){if(!selected)return;setBusy(true);setError("");setMessage("");try{const r=await fetch("/api/school/devices",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({catalogId:selected.id,deviceSerial:serial,kind,label,locationLabel:location})});const b=await r.json();if(!r.ok)throw new Error(b.message??b.error??"Could not register device.");setDeployment({secret:b.deviceSecret,serial:b.device.deviceSerial,kind:b.device.kind,catalog:selected,label:b.device.label});setMessage("Terminal registered. Copy the deployment secret now; it will not be shown again.");setSerial("");await reload();}catch(e){setError(e instanceof Error?e.message:"Could not register device.");}finally{setBusy(false);}}
  async function action(id:string,action:"revoke"|"rotateSecret"){if(action==="revoke"&&!window.confirm("Revoke this terminal? New attendance events from it will stop immediately."))return;setBusy(true);setError("");try{const r=await fetch("/api/school/devices",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,action})});const b=await r.json();if(!r.ok)throw new Error(b.message??b.error??"Device action failed.");if(action==="rotateSecret"&&b.deviceSecret){const device=devices.find(d=>d.id===id);const item=catalog.find(c=>c.vendor===device?.profile?.vendor&&c.model===device?.profile?.model)??catalog[0];if(device&&item)setDeployment({secret:b.deviceSecret,serial:device.deviceSerial,kind:device.kind,catalog:item,label:device.label});setMessage("Terminal secret rotated. Update the terminal or bridge immediately with the new secret.");}else setMessage("Terminal revoked.");await reload();}catch(e){setError(e instanceof Error?e.message:"Device action failed.");}finally{setBusy(false);}}
  return <div className="attendance-stack">
    <section className="attendance-panel"><div className="attendance-section-head"><div><span>Add terminal</span><h3>Choose what you actually purchased</h3><p>SukuuNova uses one secure attendance event contract. Branded hardware may require a small vendor bridge because protocols differ by model and firmware.</p></div></div><div className="attendance-device-builder"><div className="attendance-catalog">{catalog.map(item=><button type="button" key={item.id} onClick={()=>{setCatalogId(item.id);setKind(item.kind)}} className={catalogId===item.id?"is-active":""}><strong>{item.label}</strong><small>{item.description}</small><span>{item.readiness==="native"?"Native HTTPS":"Bridge required"}</span></button>)}</div><div className="attendance-device-form">{selected?<div className="attendance-device-note"><strong>{selected.vendor} · {selected.model}</strong><span>{selected.notes}</span></div>:null}<label>Attendance mode<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>{selected?.capabilities.map(cap=><option key={cap} value={cap}>{cap}</option>)}</select></label><label>Terminal serial / ID<input value={serial} onChange={e=>setSerial(e.target.value)} placeholder="e.g. GATE-01"/></label><label>Display name<input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Main Gate"/></label><label>Physical location<input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Main Gate entrance"/></label><button type="button" className="attendance-primary" disabled={busy||!serial.trim()||!label.trim()||!selected} onClick={()=>void register()}><Fingerprint size={16}/>{busy?"Registering…":"Register terminal"}</button></div></div></section>
    {deployment?<DeploymentCard deployment={deployment} schoolCode={schoolCode} close={()=>setDeployment(null)}/>:null}
    <section className="attendance-panel"><div className="attendance-section-head"><div><span>Terminal fleet</span><h3>Connected attendance devices</h3></div><b>{devices.filter(d=>d.status==="active"&&d.online).length} online</b></div><div className="attendance-device-list">{devices.map(device=><article key={device.id} className="attendance-device-card"><div className="attendance-device-status"><span className={device.status!=="active"?"is-revoked":device.online?"is-online":"is-offline"}>{device.status!=="active"?<ShieldCheck size={15}/>:device.online?<Wifi size={15}/>:<WifiOff size={15}/>} {device.status!=="active"?"Revoked":device.online?"Online":"Offline"}</span><small>{device.profile?.statusMessage??"No recent terminal message"}</small></div><div><strong>{device.label}</strong><p>{device.profile?.vendor??"Generic"} · {device.profile?.model??device.kind}</p><small>{device.deviceSerial} · {device.profile?.locationLabel??"Location not set"}</small></div><div className="attendance-device-meta"><span>Method <b>{device.kind}</b></span><span>Last event <b>{device.lastSeenAt?new Date(device.lastSeenAt).toLocaleString():"Never"}</b></span><span>Heartbeat <b>{device.profile?.lastHeartbeatAt?new Date(device.profile.lastHeartbeatAt).toLocaleString():"Never"}</b></span>{device.profile?.firmwareVersion?<span>Firmware <b>{device.profile.firmwareVersion}</b></span>:null}</div><div className="attendance-device-actions">{device.status==="active"?<><button type="button" disabled={busy} onClick={()=>void action(device.id,"rotateSecret")}><KeyRound size={14}/>Rotate secret</button><button type="button" disabled={busy} onClick={()=>void action(device.id,"revoke")}>Revoke</button></>:<span>Terminal cannot submit events.</span>}</div></article>)}{!devices.length?<div className="attendance-empty"><Fingerprint size={25}/><strong>No physical terminals yet</strong><span>Use the builder above, or run the live QR station without buying a biometric terminal.</span></div>:null}</div></section>
  </div>;
}

function DeploymentCard({deployment,schoolCode,close}:{deployment:Deployment;schoolCode:string;close:()=>void}){return <section className="attendance-panel attendance-deployment"><div className="attendance-section-head"><div><span>One-time deployment package</span><h3>Copy this into the terminal gateway/bridge now</h3><p>The secret is shown only in this browser state. Closing it does not reveal it again.</p></div><button type="button" onClick={close}>Close</button></div><div className="attendance-deployment-grid"><Info label="School code" value={schoolCode}/><Info label="Terminal serial" value={deployment.serial}/><Info label="Mode" value={deployment.kind}/><Info label="Attendance endpoint" value="/api/devices/attendance"/><Info label="Heartbeat endpoint" value="/api/devices/heartbeat"/><Info label="Connection" value={deployment.catalog.readiness==="native"?"Native HTTPS push":"Vendor bridge required"}/></div><div className="attendance-secret"><span>Terminal secret</span><code>{deployment.secret}</code><small>Use this raw secret only on the authorised terminal/bridge. SukuuNova stores only its verification hash.</small></div></section>}

function Identity({identityData,enrollmentData,busy,setBusy,setMessage,setError,reload}:{identityData:IdentityData;enrollmentData:EnrollmentData;busy:boolean;setBusy:(v:boolean)=>void;setMessage:(v:string)=>void;setError:(v:string)=>void;reload:()=>Promise<void>}){
  const [kind,setKind]=useState<"fingerprint"|"card">("fingerprint");const [externalId,setExternalId]=useState("");const [targetType,setTargetType]=useState<"student"|"staff">("student");const people=targetType==="student"?identityData.students:identityData.staff;const [targetId,setTargetId]=useState(people[0]?.id??"");
  const [faceType,setFaceType]=useState<"staff"|"student">("staff");const facePeople=faceType==="staff"?enrollmentData.staff:enrollmentData.students;const [faceTarget,setFaceTarget]=useState(facePeople[0]?.id??"");const selectedStudent=enrollmentData.students.find(s=>s.id===faceTarget);const [guardianId,setGuardianId]=useState(selectedStudent?.guardians[0]?.guardian.id??"");
  useEffect(()=>{const p=targetType==="student"?identityData.students:identityData.staff;if(!p.some(x=>x.id===targetId))setTargetId(p[0]?.id??"");},[targetType,identityData,targetId]);
  useEffect(()=>{const p=faceType==="staff"?enrollmentData.staff:enrollmentData.students;if(!p.some(x=>x.id===faceTarget))setFaceTarget(p[0]?.id??"");},[faceType,enrollmentData,faceTarget]);
  useEffect(()=>{if(faceType==="student"){const s=enrollmentData.students.find(x=>x.id===faceTarget);if(!s?.guardians.some(g=>g.guardian.id===guardianId))setGuardianId(s?.guardians[0]?.guardian.id??"");}},[faceType,faceTarget,enrollmentData,guardianId]);
  async function saveHardware(){setBusy(true);setError("");try{const r=await fetch("/api/school/devices/identities",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceKind:kind,externalId,targetType,targetId})});const b=await r.json();if(!r.ok)throw new Error(b.message??b.error??"Could not save terminal identity.");setExternalId("");setMessage("Terminal identity mapped. Future verified scans for that ID can now resolve to this person.");await reload();}catch(e){setError(e instanceof Error?e.message:"Could not save terminal identity.");}finally{setBusy(false);}}
  async function enroll(image:string){if(!faceTarget)return;setBusy(true);setError("");try{const body=faceType==="staff"?{action:"enrollStaff",staffId:faceTarget,image}:{action:"enrollStudent",studentId:faceTarget,consentByGuardianId:guardianId,image};const r=await fetch("/api/phase2/face",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw new Error(b.message??b.error??"Could not enroll face.");setMessage("Face enrollment completed. The raw camera image is not retained by SukuuNova.");await reload();}catch(e){setError(e instanceof Error?e.message:"Could not enroll face.");}finally{setBusy(false);}}
  const enrolled=(type:"staff"|"student",id:string)=>enrollmentData.faceEnrollments.some(e=>type==="staff"?e.staffId===id:e.studentId===id);
  return <div className="attendance-stack"><section className="attendance-panel"><div className="attendance-section-head"><div><span>Fingerprint / card mapping</span><h3>Connect the terminal’s user ID to a SukuuNova person</h3><p>Raw fingerprint templates remain on the biometric device/vendor system. SukuuNova stores only the external identity mapping.</p></div></div><div className="attendance-form-grid"><label className="attendance-field">Terminal method<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="fingerprint">Fingerprint</option><option value="card">Card / RFID</option></select></label><label className="attendance-field">Terminal user ID<input value={externalId} onChange={e=>setExternalId(e.target.value)} placeholder="Vendor external ID"/></label><label className="attendance-field">Person type<select value={targetType} onChange={e=>setTargetType(e.target.value as typeof targetType)}><option value="student">Student</option><option value="staff">Staff</option></select></label><label className="attendance-field">Person<select value={targetId} onChange={e=>setTargetId(e.target.value)}>{people.map(p=><option key={p.id} value={p.id}>{p.name}{p.admissionNo?` · ${p.admissionNo}`:""}</option>)}</select></label></div><div className="attendance-save"><span>{identityData.identities.length} hardware identities currently mapped.</span><button type="button" disabled={busy||!externalId.trim()||!targetId} onClick={()=>void saveHardware()}><Fingerprint size={15}/>Save identity mapping</button></div><div className="attendance-identity-list">{identityData.identities.slice(0,12).map(i=>{const p=i.studentId?identityData.students.find(x=>x.id===i.studentId):identityData.staff.find(x=>x.id===i.staffId);return <div key={i.id}><span>{i.deviceKind}</span><strong>{i.externalId}</strong><b>{p?.name??"Unknown person"}</b></div>})}</div></section>
    <section className="attendance-panel"><div className="attendance-section-head"><div><span>Face enrollment</span><h3>Enroll the person used by face terminals and QR face verification</h3><p>Staff QR verification requires the signed-in staff member to have a face enrollment. Student enrollment requires consent from a guardian linked to that learner.</p></div></div><div className="attendance-face-grid"><div className="attendance-face-form"><label>Person type<select value={faceType} onChange={e=>setFaceType(e.target.value as typeof faceType)}><option value="staff">Staff</option><option value="student">Student</option></select></label><label>Person<select value={faceTarget} onChange={e=>setFaceTarget(e.target.value)}>{facePeople.map(p=><option key={p.id} value={p.id}>{p.name}{"admissionNo" in p&&p.admissionNo?` · ${p.admissionNo}`:""}{enrolled(faceType,p.id)?" · enrolled":""}</option>)}</select></label>{faceType==="student"?<label>Guardian consent<select value={guardianId} onChange={e=>setGuardianId(e.target.value)}><option value="">Choose linked guardian</option>{selectedStudent?.guardians.map(g=><option key={g.guardian.id} value={g.guardian.id}>{g.guardian.name}{g.isPrimary?" · primary":""}</option>)}</select></label>:null}<div className="attendance-device-note"><strong>{faceTarget&&enrolled(faceType,faceTarget)?"Already enrolled":"Not yet enrolled"}</strong><span>Capturing again securely replaces the existing face reference for the same person.</span></div></div><div className="attendance-camera"><CameraCapture onCapture={image=>void enroll(image)}/>{busy?<span>Processing enrollment…</span>:null}</div></div></section></div>;
}

function ActivityFeed({events,pending}:{events:ControlData["recentEvents"];pending:number}){return <div className="attendance-stack"><section className="attendance-panel"><div className="attendance-section-head"><div><span>Live verification feed</span><h3>Recent attendance activity</h3><p>Manual, QR, face, fingerprint and card events appear in one stream.</p></div><b>{pending} face review{pending===1?"":"s"} pending</b></div><div className="attendance-activity-list">{events.map(e=>{const person=e.student?.name??e.staff?.name??"Unknown person";return <div key={e.id}><span className={`attendance-event-icon method-${e.method}`}>{e.method==="qr"?<QrCode size={15}/>:e.method==="face"?<Camera size={15}/>:e.method==="fingerprint"?<Fingerprint size={15}/>:<CheckCircle2 size={15}/>}</span><div><strong>{person}</strong><small>{e.student?.class?`${e.student.class.level?`${e.student.class.level} · `:""}${e.student.class.name} · `:""}{e.method}{e.device?` · ${e.device.label}`:""}</small></div><b>{e.type==="in"?(e.isLate?"Late":"Present"):e.type}</b><time>{new Date(e.timestamp).toLocaleString()}</time></div>)}{!events.length?<div className="attendance-empty"><Activity size={25}/><strong>No attendance activity yet</strong><span>Verified scans and manual registers will appear here.</span></div>:null}</div></section></div>}

function Metric({icon:Icon,label,value,detail}:{icon:typeof Settings2;label:string;value:string;detail:string}){return <article className="attendance-metric"><span><Icon size={18}/></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>}
function Flow({n,title,text}:{n:string;title:string;text:string}){return <div><span>{n}</span><strong>{title}</strong><small>{text}</small></div>}
function Field({label,type,value,onChange}:{label:string;type:string;value:string;onChange:(v:string)=>void}){return <label className="attendance-field">{label}<input type={type} value={value} onChange={e=>onChange(e.target.value)}/></label>}
function Toggle({title,detail,checked,onChange}:{title:string;detail:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="attendance-toggle"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span><strong>{title}</strong><small>{detail}</small></span></label>}
function Info({label,value}:{label:string;value:string}){return <div><span>{label}</span><code>{value}</code></div>}
