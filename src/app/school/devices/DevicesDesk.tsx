"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Camera, CheckCircle2, Clock3, Fingerprint, MonitorUp, QrCode, RadioTower, ScanFace, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import { ATTENDANCE_DEVICE_PROFILES, attendanceDeviceProfile } from "@/lib/attendance-device-catalog";
import "./attendance-control.css";

type AttendanceWindow = { opensAt: string; closesAt: string; exitOpensAt: string; exitClosesAt: string };
type Policy = {
  configured: boolean;
  timezone: string;
  expectedResumptionTime: string;
  attendanceGraceMinutes: number;
  version: 1;
  staff: AttendanceWindow;
  students: AttendanceWindow;
  qr: { enabled: boolean; rotationSeconds: number; requireFace: boolean; presenceMode: "network_or_location" | "location" | "network" };
  devices: { enabled: boolean; heartbeatOfflineSeconds: number };
};
type Device = { id:string; deviceSerial:string; kind:"face"|"fingerprint"|"card"; label:string; status:string; lastSeenAt?:string|null; createdAt:string; profileId?:string; modelName?:string|null; connectivity:"online"|"offline"|"never_connected"|"revoked" };
type Identity = { id:string; deviceKind:string; externalId:string; studentId:string|null; staffId:string|null; createdAt:string };
type Student = { id:string; name:string; admissionNo:string; photoUrl?:string|null; faceEnrolledAt?:string|null; primaryGuardian?:{id:string;name:string}|null };
type Staff = { id:string; name:string; email?:string|null; faceEnrolledAt?:string|null };
type View = "overview"|"rules"|"qr"|"devices"|"biometrics"|"manual";
type ConnectionReceipt = { deviceSecret:string; warning?:string; connection:{schoolCode:string;deviceSerial:string;kind:string;profileId:string;connectionMode:string;heartbeatUrl:string;attendanceUrl:string} };
type ApiBody = Record<string, unknown> & { message?: string; error?: string };

const views: Array<{id:View;label:string;icon:typeof Settings2}> = [
  { id:"overview", label:"Overview", icon:Activity },
  { id:"rules", label:"Rules & times", icon:Clock3 },
  { id:"qr", label:"Live QR", icon:QrCode },
  { id:"devices", label:"Device fleet", icon:RadioTower },
  { id:"biometrics", label:"Biometrics", icon:Fingerprint },
  { id:"manual", label:"Manual register", icon:UsersRound },
];

async function readBody(response: Response): Promise<ApiBody> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try { return await response.json() as ApiBody; } catch { return {}; }
  }
  const text = await response.text();
  if (response.status === 401 || response.status === 403 || /sign[ -]?in|login/i.test(text)) return { message: "Your school session is no longer authorised. Sign in again and reopen Attendance Control." };
  return { message: response.ok ? undefined : "The attendance service returned an unexpected response. Retry this action." };
}

export default function DevicesDesk({ schoolName, schoolCode }: { schoolName:string; schoolCode:string }) {
  const [view,setView]=useState<View>("overview");
  const [policy,setPolicy]=useState<Policy|null>(null);
  const [devices,setDevices]=useState<Device[]>([]);
  const [identities,setIdentities]=useState<Identity[]>([]);
  const [students,setStudents]=useState<Student[]>([]);
  const [staff,setStaff]=useState<Staff[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [receipt,setReceipt]=useState<ConnectionReceipt|null>(null);

  const [profileId,setProfileId]=useState("sukuunova-direct");
  const selectedProfile=useMemo(()=>attendanceDeviceProfile(profileId),[profileId]);
  const [kind,setKind]=useState<"face"|"fingerprint"|"card">("fingerprint");
  const [serial,setSerial]=useState("");
  const [label,setLabel]=useState("Main Gate");
  const [modelName,setModelName]=useState("");

  const [identityKind,setIdentityKind]=useState<"fingerprint"|"card">("fingerprint");
  const [targetType,setTargetType]=useState<"student"|"staff">("student");
  const [targetId,setTargetId]=useState("");
  const [externalId,setExternalId]=useState("");
  const [studentFaceId,setStudentFaceId]=useState("");
  const [staffFaceId,setStaffFaceId]=useState("");
  const [staffFaceImage,setStaffFaceImage]=useState("");

  const load=useCallback(async()=>{
    setError("");
    try{
      const [deviceResponse,identityResponse]=await Promise.all([
        fetch("/api/school/devices",{cache:"no-store"}),
        fetch("/api/school/devices/identities",{cache:"no-store"}),
      ]);
      const deviceBody=await readBody(deviceResponse);
      const identityBody=await readBody(identityResponse);
      if(!deviceResponse.ok) throw new Error(deviceBody.message??deviceBody.error??"Could not load attendance devices.");
      if(!identityResponse.ok) throw new Error(identityBody.message??identityBody.error??"Could not load biometric identities.");
      const nextPolicy=deviceBody.policy as Policy|undefined;
      const nextDevices=(deviceBody.devices as Device[]|undefined)??[];
      const nextIdentities=(identityBody.identities as Identity[]|undefined)??[];
      const nextStudents=(identityBody.students as Student[]|undefined)??[];
      const nextStaff=(identityBody.staff as Staff[]|undefined)??[];
      setPolicy(nextPolicy??null);
      setDevices(nextDevices);
      setIdentities(nextIdentities);
      setStudents(nextStudents);
      setStaff(nextStaff);
      setTargetId((current)=>current||(nextStudents[0]?.id??nextStaff[0]?.id??""));
      setStudentFaceId((current)=>current||(nextStudents[0]?.id??""));
      setStaffFaceId((current)=>current||(nextStaff[0]?.id??""));
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not load Attendance Control.");}
  },[]);

  useEffect(()=>{void load();},[load]);

  const online=devices.filter((device)=>device.connectivity==="online").length;
  const faceReady=students.filter((person)=>person.faceEnrolledAt).length+staff.filter((person)=>person.faceEnrolledAt).length;
  const mappedPeople=new Set(identities.map((identity)=>identity.studentId??identity.staffId).filter(Boolean)).size;
  const people=targetType==="student"?students:staff;
  const selectedStudent=students.find((student)=>student.id===studentFaceId);

  async function savePolicy(){
    if(!policy) return;
    setBusy(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/school/attendance/policy",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({expectedResumptionTime:policy.expectedResumptionTime,attendanceGraceMinutes:policy.attendanceGraceMinutes,policy:{version:1,staff:policy.staff,students:policy.students,qr:policy.qr,devices:policy.devices}})});
      const body=await readBody(response);
      if(!response.ok) throw new Error(body.message??body.error??"Could not save attendance rules.");
      setPolicy(body.policy as Policy);setMessage("Attendance rules saved. Entry and departure verification now follow the configured windows.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not save attendance rules.");}finally{setBusy(false);}
  }

  async function registerDevice(){
    setBusy(true);setMessage("");setError("");setReceipt(null);
    try{
      const response=await fetch("/api/school/devices",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceSerial:serial,kind,label,profileId,modelName:modelName||undefined})});
      const body=await readBody(response);
      if(!response.ok) throw new Error(body.message??body.error??"Could not register device.");
      if(!body.deviceSecret||!body.connection) throw new Error("The device registration receipt was incomplete. Retry registration before configuring the terminal.");
      setReceipt({deviceSecret:String(body.deviceSecret),warning:typeof body.warning==="string"?body.warning:undefined,connection:body.connection as ConnectionReceipt["connection"]});
      setSerial("");setModelName("");setMessage("Device registered. Complete the one-time connection receipt below; after that it can work unattended while online.");
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not register device.");}finally{setBusy(false);}
  }

  async function deviceAction(id:string,action:"revoke"|"rotate_secret"|"reactivate_with_new_secret"){
    if(action==="revoke"&&!window.confirm("Revoke this terminal? New attendance events from it will be rejected immediately.")) return;
    setBusy(true);setMessage("");setError("");setReceipt(null);
    try{
      const response=await fetch("/api/school/devices",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,action})});
      const body=await readBody(response);
      if(!response.ok) throw new Error(body.message??body.error??"Could not update device.");
      if(body.deviceSecret){
        const target=devices.find((device)=>device.id===id);
        setReceipt({deviceSecret:String(body.deviceSecret),warning:typeof body.warning==="string"?body.warning:undefined,connection:{schoolCode,deviceSerial:target?.deviceSerial??"",kind:target?.kind??"fingerprint",profileId:target?.profileId??"sukuunova-direct",connectionMode:attendanceDeviceProfile(target?.profileId).connectionMode,heartbeatUrl:`${window.location.origin}/api/devices/heartbeat`,attendanceUrl:`${window.location.origin}/api/devices/attendance`}});
      }
      setMessage(action==="revoke"?"Device revoked.":"A new device secret is ready. Replace the old secret in the terminal or gateway now.");
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not update device.");}finally{setBusy(false);}
  }

  async function saveIdentity(){
    if(!targetId||!externalId.trim()) return;
    setBusy(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/school/devices/identities",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceKind:identityKind,externalId,targetType,targetId})});
      const body=await readBody(response);
      if(!response.ok) throw new Error(body.message??body.error??"Could not map biometric identity.");
      setExternalId("");setMessage("Terminal identity mapped successfully. The physical biometric template remains on the device.");await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not map biometric identity.");}finally{setBusy(false);}
  }

  async function removeIdentity(id:string){
    setBusy(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/school/devices/identities",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id})});
      const body=await readBody(response);
      if(!response.ok) throw new Error(body.message??body.error??"Could not remove mapping.");
      setMessage("Identity mapping removed. Remove the matching enrollment from the physical terminal too if required by the vendor.");await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not remove mapping.");}finally{setBusy(false);}
  }

  async function readStaffFaceFile(file:File|null){
    if(!file){setStaffFaceImage("");return;}
    if(file.size>2_000_000){setError("Use a clear staff face image under 2 MB.");return;}
    const value=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result??""));reader.onerror=()=>reject(new Error("Could not read face image."));reader.readAsDataURL(file);});
    setStaffFaceImage(value);setError("");
  }

  async function enrollStaffFace(){
    if(!staffFaceId||!staffFaceImage) return;
    setBusy(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/phase2/face",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"enrollStaff",staffId:staffFaceId,image:staffFaceImage})});
      const body=await readBody(response);
      if(!response.ok) throw new Error(body.message??body.error??"Could not enroll staff face.");
      setStaffFaceImage("");setMessage("Staff face enrollment completed securely. The raw enrollment image is not stored as the biometric identity.");await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not enroll staff face.");}finally{setBusy(false);}
  }

  return <div className="attendance-control">
    <section className="attendance-control-hero">
      <div><span className="attendance-control-kicker">Attendance Control</span><h2>One attendance system for arriving and leaving.</h2><p>Configure entry and departure times once, then let class registers, rotating QR, face terminals and fingerprint/card devices feed the same trusted attendance history.</p></div>
      <div className="attendance-control-school"><small>School</small><strong>{schoolName}</strong><span>{schoolCode}</span></div>
    </section>

    <nav className="attendance-control-nav" aria-label="Attendance control sections">{views.map((item)=>{const Icon=item.icon;return <button key={item.id} type="button" onClick={()=>setView(item.id)} className={view===item.id?"active":""}><Icon size={16}/><span>{item.label}</span></button>;})}</nav>
    {message?<div className="attendance-control-message success" role="status"><CheckCircle2 size={16}/><span>{message}</span></div>:null}
    {error?<div className="attendance-control-message error" role="alert"><ShieldCheck size={16}/><span>{error}</span></div>:null}

    {view==="overview"?<>
      <div className="attendance-control-metrics">
        <Metric icon={RadioTower} label="Devices online" value={`${online}/${devices.filter((device)=>device.status==="active").length}`} meta="Authenticated heartbeat or recent signed scan"/>
        <Metric icon={ScanFace} label="Face ready" value={String(faceReady)} meta="Enrolled students and staff"/>
        <Metric icon={Fingerprint} label="Mapped identities" value={String(mappedPeople)} meta="Fingerprint/card terminal IDs linked to people"/>
        <Metric icon={Clock3} label="Late after" value={policy?`${policy.expectedResumptionTime} + ${policy.attendanceGraceMinutes}m`:"—"} meta={policy?.configured?"Entry and departure windows active":"Save Rules & times to activate windows"}/>
      </div>
      <section className="attendance-control-paths">
        <ControlCard icon={QrCode} title="Low-cost live QR" body="Use any school screen for staff arrival and departure. Codes rotate automatically; school presence and optional face proof prevent account sharing." action={<Link href="/school/attendance/display" target="_blank">Launch QR station</Link>}/>
        <ControlCard icon={RadioTower} title="Always-on hardware" body="Connect face, fingerprint or card terminals once. After setup, signed scans and heartbeats flow automatically while the device or gateway is online." action={<button type="button" onClick={()=>setView("devices")}>Configure devices</button>}/>
        <ControlCard icon={Fingerprint} title="Biometric readiness" body="See exactly which students and staff are enrolled for face, fingerprint or card verification." action={<Link href="/school/devices/biometrics">View readiness roster</Link>}/>
        <ControlCard icon={UsersRound} title="Class teacher register" body="Teachers record the class quickly from a roster. It remains the authorised fallback and uses the same attendance history." action={<Link href="/school/attendance/register">Open class register</Link>}/>
      </section>
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Recommended setup order</span><h3>Go live without guessing</h3></div></div><div className="attendance-steps"><Step n="1" title="Set arrival & departure times" body="Define when automated IN and OUT verification is accepted for staff and learners."/><Step n="2" title="Choose verification" body="Live QR, hardware devices, manual class register—or a combination."/><Step n="3" title="Enroll identities" body="Use learner profile portraits for student face identity and map terminal fingerprint/card IDs."/><Step n="4" title="Test entry and exit" body="Confirm check-in, lateness, check-out, device online state and attendance history before daily use."/></div></section>
    </>:null}

    {view==="rules"&&policy?<section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Rules & times</span><h3>Define exactly when automated entry and exit are accepted</h3><p>QR and biometric/card scans follow these windows. Authorised manual corrections remain available outside them, and attendance-blocking school calendar dates override normal times.</p></div><span className={`attendance-policy-state ${policy.configured?"on":"off"}`}>{policy.configured?"Policy active":"Not activated yet"}</span></div>
      <div className="attendance-rule-grid">
        <fieldset><legend>Staff arrival</legend><label>Arrival scanning opens<input type="time" value={policy.staff.opensAt} onChange={(event)=>setPolicy({...policy,staff:{...policy.staff,opensAt:event.target.value}})}/></label><label>Expected resumption<input type="time" value={policy.expectedResumptionTime} onChange={(event)=>setPolicy({...policy,expectedResumptionTime:event.target.value})}/></label><label>Grace period (minutes)<input type="number" min={0} max={180} value={policy.attendanceGraceMinutes} onChange={(event)=>setPolicy({...policy,attendanceGraceMinutes:Number(event.target.value)})}/></label><label>Arrival scanning closes<input type="time" value={policy.staff.closesAt} onChange={(event)=>setPolicy({...policy,staff:{...policy.staff,closesAt:event.target.value}})}/></label></fieldset>
        <fieldset><legend>Staff departure</legend><label>Departure scanning opens<input type="time" value={policy.staff.exitOpensAt} onChange={(event)=>setPolicy({...policy,staff:{...policy.staff,exitOpensAt:event.target.value}})}/></label><label>Departure scanning closes<input type="time" value={policy.staff.exitClosesAt} onChange={(event)=>setPolicy({...policy,staff:{...policy.staff,exitClosesAt:event.target.value}})}/></label><div className="attendance-rule-note">A staff member must have a valid check-in before a check-out is accepted. A completed day cannot be reopened automatically.</div></fieldset>
        <fieldset><legend>Student arrival</legend><label>Arrival scanning opens<input type="time" value={policy.students.opensAt} onChange={(event)=>setPolicy({...policy,students:{...policy.students,opensAt:event.target.value}})}/></label><label>Arrival scanning closes<input type="time" value={policy.students.closesAt} onChange={(event)=>setPolicy({...policy,students:{...policy.students,closesAt:event.target.value}})}/></label><div className="attendance-rule-note">Student lateness uses the school&apos;s expected resumption time plus grace period.</div></fieldset>
        <fieldset><legend>Student departure</legend><label>Departure scanning opens<input type="time" value={policy.students.exitOpensAt} onChange={(event)=>setPolicy({...policy,students:{...policy.students,exitOpensAt:event.target.value}})}/></label><label>Departure scanning closes<input type="time" value={policy.students.exitClosesAt} onChange={(event)=>setPolicy({...policy,students:{...policy.students,exitClosesAt:event.target.value}})}/></label><div className="attendance-rule-note">Connected face/fingerprint/card terminals can send OUT events for learners. Primary guardians continue to receive configured attendance alerts.</div></fieldset>
        <fieldset><legend>Rotating QR security</legend><Toggle checked={policy.qr.enabled} onChange={(value)=>setPolicy({...policy,qr:{...policy.qr,enabled:value}})} title="Enable live QR station" body="One rotating station supports staff check-in and check-out."/><label>Code rotation (seconds)<input type="number" min={30} max={120} value={policy.qr.rotationSeconds} onChange={(event)=>setPolicy({...policy,qr:{...policy.qr,rotationSeconds:Number(event.target.value)}})}/></label><Toggle checked={policy.qr.requireFace} onChange={(value)=>setPolicy({...policy,qr:{...policy.qr,requireFace:value}})} title="Require face after QR scan" body="The face must match the same signed-in staff account."/><label>School-presence proof<select value={policy.qr.presenceMode} onChange={(event)=>setPolicy({...policy,qr:{...policy.qr,presenceMode:event.target.value as Policy["qr"]["presenceMode"]}})}><option value="network_or_location">School network OR location</option><option value="network">School network only</option><option value="location">Location only</option></select></label></fieldset>
        <fieldset><legend>Hardware health</legend><Toggle checked={policy.devices.enabled} onChange={(value)=>setPolicy({...policy,devices:{...policy.devices,enabled:value}})} title="Accept connected devices" body="When off, device attendance and heartbeats are rejected."/><label>Mark device offline after (seconds)<input type="number" min={60} max={900} value={policy.devices.heartbeatOfflineSeconds} onChange={(event)=>setPolicy({...policy,devices:{...policy.devices,heartbeatOfflineSeconds:Number(event.target.value)}})}/></label><div className="attendance-rule-note">Timezone: <strong>{policy.timezone}</strong>. Saturdays, Sundays and attendance-blocking school holidays remain outside normal school-day attendance reporting.</div></fieldset>
      </div><div className="attendance-control-actions"><button className="primary" type="button" disabled={busy} onClick={()=>void savePolicy()}>{busy?"Saving…":"Save & activate attendance rules"}</button></div>
    </section>:null}

    {view==="qr"?<section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Live QR station</span><h3>One rotating code for staff arrival and departure</h3><p>The station stays live throughout the school day. Each staff scanner chooses Arriving or Leaving; the server then applies the correct time window and attendance state.</p></div><QrCode size={28}/></div><div className="attendance-qr-layout"><div className="attendance-qr-preview"><QrCode size={92}/><strong>{policy?.qr.rotationSeconds??60}-second rotating code</strong><span>{policy?.qr.requireFace?"QR + school presence + face proof":"QR + school presence"}</span><Link className="attendance-launch" href="/school/attendance/display" target="_blank"><MonitorUp size={16}/>Launch full-screen QR station</Link></div><div className="attendance-security-list"><h4>Anti-cheat controls</h4><p><ShieldCheck size={16}/><span><strong>Signed-in identity</strong>The scanner belongs to the staff member&apos;s authenticated account.</span></p><p><Clock3 size={16}/><span><strong>Direction-aware windows</strong>Arrival and departure use separate school-configured times.</span></p><p><RadioTower size={16}/><span><strong>School presence</strong>{policy?.qr.presenceMode==="network"?"Must be on the school network.":policy?.qr.presenceMode==="location"?"Must pass school-location verification.":"Must pass school network or location verification."}</span></p><p><ScanFace size={16}/><span><strong>Optional face proof</strong>{policy?.qr.requireFace?"Enabled. The captured face must match the same staff account.":"Disabled. Enable it in Rules & times after staff faces are enrolled."}</span></p></div></div></section>:null}

    {view==="devices"?<>
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Connection wizard</span><h3>Register a face, fingerprint or card terminal</h3><p>Choose a connection profile first. Direct-capable devices call SukuuNova themselves; other supported vendor families use a local gateway. After one-time configuration, daily scanning is unattended.</p></div></div><div className="device-profile-grid">{ATTENDANCE_DEVICE_PROFILES.map((profile)=><button type="button" key={profile.id} className={profileId===profile.id?"selected":""} onClick={()=>{setProfileId(profile.id);if(!profile.kinds.includes(kind))setKind(profile.kinds[0]);}}><strong>{profile.name}</strong><small>{profile.connectionMode==="direct"?"Direct HTTPS":"Local gateway"}</small><p>{profile.summary}</p></button>)}</div><div className="attendance-device-form"><label>Attendance method<select value={kind} onChange={(event)=>setKind(event.target.value as typeof kind)}>{selectedProfile.kinds.map((value)=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label><label>Terminal serial / ID<input value={serial} onChange={(event)=>setSerial(event.target.value)} placeholder="e.g. GATE-01"/></label><label>Vendor model (optional)<input value={modelName} onChange={(event)=>setModelName(event.target.value)} placeholder="Model printed on device"/></label><label>Location label<input value={label} onChange={(event)=>setLabel(event.target.value)} placeholder="Main Gate"/></label></div><div className="attendance-profile-steps">{selectedProfile.setup.map((step,index)=><div key={step}><b>{index+1}</b><span>{step}</span></div>)}</div><div className="attendance-control-actions"><button className="primary" type="button" disabled={busy||!serial.trim()||!label.trim()} onClick={()=>void registerDevice()}>{busy?"Registering…":"Register terminal"}</button></div></section>
      {receipt?<ConnectionReceipt receipt={receipt}/>:null}
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Device fleet</span><h3>Connected attendance terminals</h3><p>“Online” means SukuuNova has received a signed heartbeat or attendance event inside the configured health window.</p></div><span className="attendance-online-count">{online} online</span></div><div className="attendance-device-list">{devices.map((device)=><div className="attendance-device-row" key={device.id}><div className={`device-health ${device.connectivity}`}/><div><strong>{device.label}</strong><small>{device.modelName?`${device.modelName} · `:""}{device.deviceSerial}</small></div><span>{device.kind}</span><span className={`device-state ${device.connectivity}`}>{device.connectivity.replaceAll("_"," ")}</span><small>{device.lastSeenAt?`Last seen ${new Date(device.lastSeenAt).toLocaleString()}`:"Never connected"}</small><div className="device-row-actions">{device.status==="active"?<><button type="button" disabled={busy} onClick={()=>void deviceAction(device.id,"rotate_secret")}>Rotate secret</button><button type="button" disabled={busy} onClick={()=>void deviceAction(device.id,"revoke")}>Revoke</button></>:<button type="button" disabled={busy} onClick={()=>void deviceAction(device.id,"reactivate_with_new_secret")}>Reconnect</button>}</div></div>)}{!devices.length?<div className="attendance-empty">No terminals registered yet. Use the connection wizard above or use the Live QR option with no dedicated hardware.</div>:null}</div></section>
    </>:null}

    {view==="biometrics"?<>
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Biometric readiness</span><h3>Know exactly who the system can recognize</h3><p>Open the readiness roster to see Face, Fingerprint and Card status for every enrolled identity.</p></div><Link className="attendance-launch" href="/school/devices/biometrics">View readiness roster</Link></div></section>
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Fingerprint & card identities</span><h3>Connect the terminal enrollment ID to the correct person</h3><p>Enroll the fingerprint/card on the physical terminal first. SukuuNova stores the vendor external identifier, never the raw fingerprint template.</p></div><Fingerprint size={26}/></div><div className="attendance-device-form"><label>Method<select value={identityKind} onChange={(event)=>setIdentityKind(event.target.value as typeof identityKind)}><option value="fingerprint">Fingerprint</option><option value="card">Card / RFID</option></select></label><label>Person type<select value={targetType} onChange={(event)=>{const next=event.target.value as typeof targetType;setTargetType(next);setTargetId((next==="student"?students:staff)[0]?.id??"");}}><option value="student">Student</option><option value="staff">Staff</option></select></label><label>Person<select value={targetId} onChange={(event)=>setTargetId(event.target.value)}>{people.map((person)=><option value={person.id} key={person.id}>{person.name}{"admissionNo" in person?` · ${person.admissionNo}`:""}</option>)}</select></label><label>Terminal user / enrollment ID<input value={externalId} onChange={(event)=>setExternalId(event.target.value)} placeholder="ID emitted by terminal"/></label></div><div className="attendance-control-actions"><button className="primary" type="button" disabled={busy||!targetId||!externalId.trim()} onClick={()=>void saveIdentity()}>Save identity mapping</button></div><div className="identity-list">{identities.slice(0,30).map((identity)=>{const person=identity.studentId?students.find((row)=>row.id===identity.studentId):staff.find((row)=>row.id===identity.staffId);return <div key={identity.id}><span>{identity.deviceKind}</span><strong>{identity.externalId}</strong><small>{person?.name??"Unknown person"}</small><button type="button" disabled={busy} onClick={()=>void removeIdentity(identity.id)}>Remove</button></div>;})}</div></section>
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Student face identity</span><h3>Use the learner&apos;s official profile portrait</h3><p>Student face enrollment no longer accepts a second image here. Open the learner&apos;s biometric identity page so the quality-checked profile portrait remains the single source.</p></div><ScanFace size={26}/></div><div className="attendance-device-form"><label>Learner<select value={studentFaceId} onChange={(event)=>setStudentFaceId(event.target.value)}>{students.map((student)=><option key={student.id} value={student.id}>{student.name} · {student.admissionNo}</option>)}</select></label><div className="biometric-readiness"><ScanFace size={18}/><span>{selectedStudent?.faceEnrolledAt?"Face already enrolled":selectedStudent?.photoUrl?"Profile portrait ready for enrollment":"Professional profile portrait required"}</span></div></div><div className="attendance-control-actions">{selectedStudent?<Link className="attendance-launch" href={`/school/students/${selectedStudent.id}/biometrics`}>Open learner biometric identity</Link>:null}</div></section>
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Staff face identity</span><h3>Enroll a staff face for QR proof and face terminals</h3><p>Use a clear front-facing staff image. The provider reference is stored securely; the raw enrollment image is not retained as the biometric identity.</p></div><Camera size={26}/></div><div className="attendance-device-form"><label>Staff member<select value={staffFaceId} onChange={(event)=>setStaffFaceId(event.target.value)}>{staff.map((person)=><option key={person.id} value={person.id}>{person.name}{person.email?` · ${person.email}`:""}</option>)}</select></label><label className="face-file">Clear staff face photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(event)=>void readStaffFaceFile(event.target.files?.[0]??null)}/><small>Use one clear, front-facing image under 2 MB.</small></label><div className="biometric-readiness"><ScanFace size={18}/><span>{staff.find((person)=>person.id===staffFaceId)?.faceEnrolledAt?"Face already enrolled · saving replaces the enrollment":"No face enrollment yet"}</span></div></div>{staffFaceImage?<div className="face-preview"><img src={staffFaceImage} alt="Staff face capture preview"/><span>Preview only. Submit when the face is clear.</span></div>:null}<div className="attendance-control-actions"><button className="primary" type="button" disabled={busy||!staffFaceId||!staffFaceImage} onClick={()=>void enrollStaffFace()}>{busy?"Enrolling…":"Enroll staff face securely"}</button></div></section>
    </>:null}

    {view==="manual"?<section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Manual class register</span><h3>Fast attendance when a class teacher is taking the register</h3><p>Manual attendance is the authorised classroom workflow for present, late, absent and excused decisions and remains available when automated entry or exit verification has closed.</p></div><UsersRound size={28}/></div><div className="manual-attendance-options"><div><strong>Class register</strong><p>Choose class and date, start with everyone present, then change only exceptions.</p><Link href="/school/attendance/register">Open class register</Link></div><div><strong>Attendance overview</strong><p>Review present, late, absent and missing decisions across your permitted classes.</p><Link href="/school/attendance">Open attendance overview</Link></div><div><strong>Exceptions</strong><p>Resolve corrections and unusual attendance states through the governed review workflow.</p><Link href="/school/attendance/exceptions">Review exceptions</Link></div></div></section>:null}
  </div>;
}

function Metric({icon:Icon,label,value,meta}:{icon:typeof Settings2;label:string;value:string;meta:string}){return <div className="attendance-metric"><span><Icon size={17}/></span><small>{label}</small><strong>{value}</strong><p>{meta}</p></div>}
function ControlCard({icon:Icon,title,body,action}:{icon:typeof Settings2;title:string;body:string;action:React.ReactNode}){return <article><span><Icon size={19}/></span><h3>{title}</h3><p>{body}</p><div>{action}</div></article>}
function Step({n,title,body}:{n:string;title:string;body:string}){return <div><b>{n}</b><span><strong>{title}</strong><small>{body}</small></span></div>}
function Toggle({checked,onChange,title,body}:{checked:boolean;onChange:(value:boolean)=>void;title:string;body:string}){return <label className="attendance-toggle"><input type="checkbox" checked={checked} onChange={(event)=>onChange(event.target.checked)}/><span><strong>{title}</strong><small>{body}</small></span></label>}
function ConnectionReceipt({receipt}:{receipt:ConnectionReceipt}){const copy=(value:string)=>navigator.clipboard?.writeText(value);return <section className="attendance-control-panel connection-receipt"><div className="attendance-control-heading"><div><span>One-time connection receipt</span><h3>Connect the terminal now</h3><p>The raw device secret is shown only in this response. Store it only in the terminal/gateway configuration. After this one-time setup, the terminal can work unattended while powered and online.</p></div><ShieldCheck size={26}/></div><div className="connection-grid"><ReceiptField label="School code" value={receipt.connection.schoolCode} onCopy={copy}/><ReceiptField label="Device serial" value={receipt.connection.deviceSerial} onCopy={copy}/><ReceiptField label="Device secret" value={receipt.deviceSecret} onCopy={copy}/><ReceiptField label="Heartbeat endpoint" value={receipt.connection.heartbeatUrl} onCopy={copy}/><ReceiptField label="Attendance endpoint" value={receipt.connection.attendanceUrl} onCopy={copy}/></div>{receipt.warning?<div className="connection-warning">{receipt.warning}</div>:null}<div className="connection-warning">When the gateway or direct terminal starts, it should send signed heartbeats periodically. The fleet changes from “never connected” to “online” as soon as SukuuNova receives one.</div></section>}
function ReceiptField({label,value,onCopy}:{label:string;value:string;onCopy:(value:string)=>void}){return <div><small>{label}</small><code>{value}</code><button type="button" onClick={()=>onCopy(value)}>Copy</button></div>}
