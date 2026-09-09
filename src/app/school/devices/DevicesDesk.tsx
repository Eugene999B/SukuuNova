"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Camera, CheckCircle2, Clock3, Fingerprint, MonitorUp, QrCode, RadioTower, ScanFace, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import { ATTENDANCE_DEVICE_PROFILES, attendanceDeviceProfile } from "@/lib/attendance-device-catalog";
import "./attendance-control.css";

type Policy = {
  configured: boolean;
  timezone: string;
  expectedResumptionTime: string;
  attendanceGraceMinutes: number;
  version: 1;
  staff: { opensAt: string; closesAt: string };
  students: { opensAt: string; closesAt: string };
  qr: { enabled: boolean; rotationSeconds: number; requireFace: boolean; presenceMode: "network_or_location" | "location" | "network" };
  devices: { enabled: boolean; heartbeatOfflineSeconds: number };
};
type Device = { id:string; deviceSerial:string; kind:"face"|"fingerprint"|"card"; label:string; status:string; lastSeenAt?:string|null; createdAt:string; profileId?:string; modelName?:string|null; connectivity:"online"|"offline"|"never_connected"|"revoked" };
type Identity = { id:string; deviceKind:string; externalId:string; studentId:string|null; staffId:string|null; createdAt:string };
type Student = { id:string; name:string; admissionNo:string; photoUrl?:string|null; faceEnrolledAt?:string|null; primaryGuardian?:{id:string;name:string}|null };
type Staff = { id:string; name:string; email?:string|null; faceEnrolledAt?:string|null };
type View = "overview"|"rules"|"qr"|"devices"|"biometrics"|"manual";
type ConnectionReceipt = { deviceSecret:string; warning?:string; connection:{schoolCode:string;deviceSerial:string;kind:string;profileId:string;connectionMode:string;heartbeatUrl:string;attendanceUrl:string} };

const views: Array<{id:View;label:string;icon:typeof Settings2}> = [
  { id:"overview", label:"Overview", icon:Activity },
  { id:"rules", label:"Rules & times", icon:Clock3 },
  { id:"qr", label:"Live QR", icon:QrCode },
  { id:"devices", label:"Device fleet", icon:RadioTower },
  { id:"biometrics", label:"Biometrics", icon:Fingerprint },
  { id:"manual", label:"Manual register", icon:UsersRound },
];

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
  const [faceTargetType,setFaceTargetType]=useState<"student"|"staff">("staff");
  const [faceTargetId,setFaceTargetId]=useState("");
  const [faceImage,setFaceImage]=useState("");

  const load=useCallback(async()=>{
    setError("");
    try{
      const [deviceResponse,identityResponse]=await Promise.all([
        fetch("/api/school/devices",{cache:"no-store"}),
        fetch("/api/school/devices/identities",{cache:"no-store"}),
      ]);
      const deviceBody=await deviceResponse.json();
      const identityBody=await identityResponse.json();
      if(!deviceResponse.ok) throw new Error(deviceBody.message??deviceBody.error??"Could not load attendance devices.");
      if(!identityResponse.ok) throw new Error(identityBody.message??identityBody.error??"Could not load biometric identities.");
      setPolicy(deviceBody.policy);
      setDevices(deviceBody.devices??[]);
      setIdentities(identityBody.identities??[]);
      setStudents(identityBody.students??[]);
      setStaff(identityBody.staff??[]);
      setTargetId((current)=>current||(identityBody.students?.[0]?.id??""));
      setFaceTargetId((current)=>current||(identityBody.staff?.[0]?.id??""));
    }catch(e){setError(e instanceof Error?e.message:"Could not load Attendance Control.");}
  },[]);

  useEffect(()=>{void load();},[load]);

  const online=devices.filter((device)=>device.connectivity==="online").length;
  const faceReady=staff.filter((person)=>person.faceEnrolledAt).length;
  const mappedPeople=new Set(identities.map((identity)=>identity.studentId??identity.staffId).filter(Boolean)).size;

  async function savePolicy(){
    if(!policy) return;
    setBusy(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/school/attendance/policy",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
        expectedResumptionTime:policy.expectedResumptionTime,
        attendanceGraceMinutes:policy.attendanceGraceMinutes,
        policy:{version:1,staff:policy.staff,students:policy.students,qr:policy.qr,devices:policy.devices},
      })});
      const body=await response.json();
      if(!response.ok) throw new Error(body.message??body.error??"Could not save attendance rules.");
      setPolicy(body.policy);setMessage("Attendance rules saved. Automated verification now follows these times and security rules.");
    }catch(e){setError(e instanceof Error?e.message:"Could not save attendance rules.");}finally{setBusy(false);}
  }

  async function registerDevice(){
    setBusy(true);setMessage("");setError("");setReceipt(null);
    try{
      const response=await fetch("/api/school/devices",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceSerial:serial,kind,label,profileId,modelName:modelName||undefined})});
      const body=await response.json();
      if(!response.ok) throw new Error(body.message??body.error??"Could not register device.");
      setReceipt({deviceSecret:body.deviceSecret,warning:body.warning,connection:body.connection});
      setSerial("");setModelName("");setMessage("Device registered. Complete the connection receipt below before leaving this page.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not register device.");}finally{setBusy(false);}
  }

  async function deviceAction(id:string,action:"revoke"|"rotate_secret"|"reactivate_with_new_secret"){
    if(action==="revoke"&&!window.confirm("Revoke this terminal? New attendance events from it will be rejected immediately.")) return;
    setBusy(true);setMessage("");setError("");setReceipt(null);
    try{
      const response=await fetch("/api/school/devices",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,action})});
      const body=await response.json();
      if(!response.ok) throw new Error(body.message??body.error??"Could not update device.");
      if(body.deviceSecret){
        const target=devices.find((device)=>device.id===id);
        setReceipt({deviceSecret:body.deviceSecret,warning:body.warning,connection:{schoolCode,deviceSerial:target?.deviceSerial??"",kind:target?.kind??"fingerprint",profileId:target?.profileId??"sukuunova-direct",connectionMode:attendanceDeviceProfile(target?.profileId).connectionMode,heartbeatUrl:`${window.location.origin}/api/devices/heartbeat`,attendanceUrl:`${window.location.origin}/api/devices/attendance`}});
      }
      setMessage(action==="revoke"?"Device revoked.":"A new device secret is ready. Replace the old secret in the terminal/gateway now.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not update device.");}finally{setBusy(false);}
  }

  async function saveIdentity(){
    if(!targetId||!externalId.trim()) return;
    setBusy(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/school/devices/identities",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceKind:identityKind,externalId,targetType,targetId})});
      const body=await response.json();
      if(!response.ok) throw new Error(body.message??body.error??"Could not map biometric identity.");
      setExternalId("");setMessage("Terminal identity mapped successfully.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not map biometric identity.");}finally{setBusy(false);}
  }

  async function removeIdentity(id:string){
    setBusy(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/school/devices/identities",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id})});
      const body=await response.json();
      if(!response.ok) throw new Error(body.message??body.error??"Could not remove mapping.");
      setMessage("Identity mapping removed.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not remove mapping.");}finally{setBusy(false);}
  }

  async function readFaceFile(file:File|null){
    if(!file){setFaceImage("");return;}
    if(file.size>2_000_000){setError("Use a clear face image under 2 MB.");return;}
    const value=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result??""));reader.onerror=()=>reject(new Error("Could not read face image."));reader.readAsDataURL(file);});
    setFaceImage(value);setError("");
  }

  async function enrollFace(){
    if(!faceTargetId||!faceImage) return;
    setBusy(true);setMessage("");setError("");
    try{
      const selectedStudent=students.find((student)=>student.id===faceTargetId);
      const payload=faceTargetType==="staff"
        ? {action:"enrollStaff",staffId:faceTargetId,image:faceImage}
        : {action:"enrollStudent",studentId:faceTargetId,consentByGuardianId:selectedStudent?.primaryGuardian?.id,image:faceImage};
      if(faceTargetType==="student"&&!selectedStudent?.primaryGuardian?.id) throw new Error("Student face enrollment requires a linked primary guardian for consent.");
      const response=await fetch("/api/phase2/face",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const body=await response.json();
      if(!response.ok) throw new Error(body.message??body.error??"Could not enroll face.");
      setFaceImage("");setMessage("Face enrollment completed securely. The raw image is not stored as the biometric identity.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not enroll face.");}finally{setBusy(false);}
  }

  const people=targetType==="student"?students:staff;
  const facePeople=faceTargetType==="student"?students:staff;

  return <div className="attendance-control">
    <section className="attendance-control-hero">
      <div><span className="attendance-control-kicker">Attendance Control</span><h2>One attendance system. Any verification method.</h2><p>Configure the school day once, then let class registers, rotating QR, face terminals and fingerprint/card devices feed the same trusted attendance history.</p></div>
      <div className="attendance-control-school"><small>School</small><strong>{schoolName}</strong><span>{schoolCode}</span></div>
    </section>

    <nav className="attendance-control-nav" aria-label="Attendance control sections">{views.map((item)=>{const Icon=item.icon;return <button key={item.id} type="button" onClick={()=>setView(item.id)} className={view===item.id?"active":""}><Icon size={16}/><span>{item.label}</span></button>;})}</nav>

    {message?<div className="attendance-control-message success" role="status"><CheckCircle2 size={16}/><span>{message}</span></div>:null}
    {error?<div className="attendance-control-message error" role="alert"><ShieldCheck size={16}/><span>{error}</span></div>:null}

    {view==="overview"?<>
      <div className="attendance-control-metrics">
        <Metric icon={RadioTower} label="Devices online" value={`${online}/${devices.filter((d)=>d.status==="active").length}`} meta="Based on authenticated heartbeat or scan activity"/>
        <Metric icon={ScanFace} label="Staff face-ready" value={`${faceReady}/${staff.length}`} meta="Required only when QR face proof is enabled"/>
        <Metric icon={Fingerprint} label="Mapped identities" value={String(mappedPeople)} meta="Fingerprint/card terminal IDs linked to people"/>
        <Metric icon={Clock3} label="Late after" value={policy?`${policy.expectedResumptionTime} + ${policy.attendanceGraceMinutes}m`:"—"} meta={policy?.configured?"Configured verification windows active":"Save Rules & times to activate closing windows"}/>
      </div>
      <section className="attendance-control-paths">
        <ControlCard icon={QrCode} title="Low-cost live QR" body="Use any school screen. A new code appears automatically, staff prove school presence, and optional face proof prevents account sharing." action={<Link href="/school/attendance/display" target="_blank">Launch QR station</Link>}/>
        <ControlCard icon={RadioTower} title="Always-on hardware" body="Connect face, fingerprint or card terminals. Registered hardware sends signed events and heartbeats without an administrator standing beside it." action={<button type="button" onClick={()=>setView("devices")}>Configure devices</button>}/>
        <ControlCard icon={UsersRound} title="Class teacher register" body="Teachers record the class quickly from a roster. It remains the authorised fallback and uses the same attendance history." action={<Link href="/school/attendance/register">Open class register</Link>}/>
      </section>
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Recommended setup order</span><h3>Go live without guessing</h3></div></div><div className="attendance-steps"><Step n="1" title="Set times" body="Opening time, expected arrival, grace period and automatic closing time."/><Step n="2" title="Choose verification" body="Live QR, hardware devices, manual class register—or a combination."/><Step n="3" title="Enroll identities" body="Map fingerprint/card IDs and enroll faces only where the school has the right consent."/><Step n="4" title="Test one scan" body="Confirm the event, late state, device online state and attendance overview before daily use."/></div></section>
    </>:null}

    {view==="rules"&&policy?<section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Rules & times</span><h3>Define exactly when automated attendance is accepted</h3><p>Manual authorised corrections remain possible after the automated window closes. QR and biometric/card IN scans are rejected after closing time once this policy is saved.</p></div><span className={`attendance-policy-state ${policy.configured?"on":"off"}`}>{policy.configured?"Policy active":"Not activated yet"}</span></div>
      <div className="attendance-rule-grid">
        <fieldset><legend>Staff arrival</legend><label>Verification opens<input type="time" value={policy.staff.opensAt} onChange={(e)=>setPolicy({...policy,staff:{...policy.staff,opensAt:e.target.value}})}/></label><label>Expected resumption<input type="time" value={policy.expectedResumptionTime} onChange={(e)=>setPolicy({...policy,expectedResumptionTime:e.target.value})}/></label><label>Grace period (minutes)<input type="number" min={0} max={180} value={policy.attendanceGraceMinutes} onChange={(e)=>setPolicy({...policy,attendanceGraceMinutes:Number(e.target.value)})}/></label><label>Automated verification closes<input type="time" value={policy.staff.closesAt} onChange={(e)=>setPolicy({...policy,staff:{...policy.staff,closesAt:e.target.value}})}/></label></fieldset>
        <fieldset><legend>Student arrival</legend><label>Verification opens<input type="time" value={policy.students.opensAt} onChange={(e)=>setPolicy({...policy,students:{...policy.students,opensAt:e.target.value}})}/></label><label>Automated verification closes<input type="time" value={policy.students.closesAt} onChange={(e)=>setPolicy({...policy,students:{...policy.students,closesAt:e.target.value}})}/></label><div className="attendance-rule-note">Student lateness uses the same expected resumption time + grace period. Class teachers can still record absent/excused decisions through the manual register.</div></fieldset>
        <fieldset><legend>Rotating QR security</legend><Toggle checked={policy.qr.enabled} onChange={(value)=>setPolicy({...policy,qr:{...policy.qr,enabled:value}})} title="Enable live QR station" body="Allows an authorised display account to launch the rotating staff code."/><label>Code rotation (seconds)<input type="number" min={30} max={120} value={policy.qr.rotationSeconds} onChange={(e)=>setPolicy({...policy,qr:{...policy.qr,rotationSeconds:Number(e.target.value)}})}/></label><Toggle checked={policy.qr.requireFace} onChange={(value)=>setPolicy({...policy,qr:{...policy.qr,requireFace:value}})} title="Require face after QR scan" body="The face must match the same signed-in staff account."/><label>School-presence proof<select value={policy.qr.presenceMode} onChange={(e)=>setPolicy({...policy,qr:{...policy.qr,presenceMode:e.target.value as Policy["qr"]["presenceMode"]}})}><option value="network_or_location">School network OR location</option><option value="network">School network only</option><option value="location">Location only</option></select></label></fieldset>
        <fieldset><legend>Hardware health</legend><Toggle checked={policy.devices.enabled} onChange={(value)=>setPolicy({...policy,devices:{...policy.devices,enabled:value}})} title="Accept connected devices" body="When off, device attendance and heartbeats are rejected."/><label>Mark device offline after (seconds)<input type="number" min={60} max={900} value={policy.devices.heartbeatOfflineSeconds} onChange={(e)=>setPolicy({...policy,devices:{...policy.devices,heartbeatOfflineSeconds:Number(e.target.value)}})}/></label><div className="attendance-rule-note">Timezone: <strong>{policy.timezone}</strong>. Holidays and attendance-blocking calendar dates continue to override normal opening times.</div></fieldset>
      </div><div className="attendance-control-actions"><button className="primary" type="button" disabled={busy} onClick={()=>void savePolicy()}>{busy?"Saving…":"Save & activate attendance rules"}</button></div>
    </section>:null}

    {view==="qr"?<section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Live QR station</span><h3>Turn any school display into a secure attendance terminal</h3><p>No dedicated biometric hardware is required. The display produces the shared rotating code; each staff account may use each code once.</p></div><QrCode size={28}/></div><div className="attendance-qr-layout"><div className="attendance-qr-preview"><QrCode size={92}/><strong>{policy?.qr.rotationSeconds??60}-second rotating code</strong><span>{policy?.qr.requireFace?"QR + school presence + face proof":"QR + school presence"}</span><Link className="attendance-launch" href="/school/attendance/display" target="_blank"><MonitorUp size={16}/>Launch full-screen QR station</Link></div><div className="attendance-security-list"><h4>Anti-cheat controls</h4><p><ShieldCheck size={16}/><span><strong>Signed-in identity</strong>The scanner belongs to the teacher's authenticated account.</span></p><p><Clock3 size={16}/><span><strong>Short-lived code</strong>The display changes automatically; old codes expire.</span></p><p><RadioTower size={16}/><span><strong>School presence</strong>{policy?.qr.presenceMode==="network"?"Must be on the school network.":policy?.qr.presenceMode==="location"?"Must pass school-location verification.":"Must pass school network or location verification."}</span></p><p><ScanFace size={16}/><span><strong>Optional face proof</strong>{policy?.qr.requireFace?"Enabled. The captured face must match the same staff account.":"Disabled. Enable it in Rules & times after staff faces are enrolled."}</span></p></div></div></section>:null}

    {view==="devices"?<>
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Connection wizard</span><h3>Register a face, fingerprint or card terminal</h3><p>Choose a connection profile first. Gateway profiles are explicit because many vendor terminals cannot call SukuuNova directly without an adapter.</p></div></div><div className="device-profile-grid">{ATTENDANCE_DEVICE_PROFILES.map((profile)=><button type="button" key={profile.id} className={profileId===profile.id?"selected":""} onClick={()=>{setProfileId(profile.id);if(!profile.kinds.includes(kind))setKind(profile.kinds[0]);}}><strong>{profile.name}</strong><small>{profile.connectionMode==="direct"?"Direct HTTPS":"Local gateway"}</small><p>{profile.summary}</p></button>)}</div><div className="attendance-device-form"><label>Attendance method<select value={kind} onChange={(e)=>setKind(e.target.value as typeof kind)}>{selectedProfile.kinds.map((value)=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label><label>Terminal serial / ID<input value={serial} onChange={(e)=>setSerial(e.target.value)} placeholder="e.g. GATE-01"/></label><label>Vendor model (optional)<input value={modelName} onChange={(e)=>setModelName(e.target.value)} placeholder="Model printed on device"/></label><label>Location label<input value={label} onChange={(e)=>setLabel(e.target.value)} placeholder="Main Gate"/></label></div><div className="attendance-profile-steps">{selectedProfile.setup.map((step,index)=><div key={step}><b>{index+1}</b><span>{step}</span></div>)}</div><div className="attendance-control-actions"><button className="primary" type="button" disabled={busy||!serial.trim()||!label.trim()} onClick={()=>void registerDevice()}>{busy?"Registering…":"Register terminal"}</button></div></section>
      {receipt?<ConnectionReceipt receipt={receipt}/>:null}
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Device fleet</span><h3>Connected attendance terminals</h3><p>“Online” means SukuuNova has received a signed heartbeat or attendance event inside the configured health window.</p></div><span className="attendance-online-count">{online} online</span></div><div className="attendance-device-list">{devices.map((device)=><div className="attendance-device-row" key={device.id}><div className={`device-health ${device.connectivity}`}/><div><strong>{device.label}</strong><small>{device.modelName?`${device.modelName} · `:""}{device.deviceSerial}</small></div><span>{device.kind}</span><span className={`device-state ${device.connectivity}`}>{device.connectivity.replaceAll("_"," ")}</span><small>{device.lastSeenAt?`Last seen ${new Date(device.lastSeenAt).toLocaleString()}`:"Never connected"}</small><div className="device-row-actions">{device.status==="active"?<><button type="button" disabled={busy} onClick={()=>void deviceAction(device.id,"rotate_secret")}>Rotate secret</button><button type="button" disabled={busy} onClick={()=>void deviceAction(device.id,"revoke")}>Revoke</button></>:<button type="button" disabled={busy} onClick={()=>void deviceAction(device.id,"reactivate_with_new_secret")}>Reconnect</button>}</div></div>)}{!devices.length?<div className="attendance-empty">No terminals registered yet. Use the connection wizard above or use the Live QR option with no dedicated hardware.</div>:null}</div></section>
    </>:null}

    {view==="biometrics"?<>
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Fingerprint & card identities</span><h3>Connect the terminal's enrollment ID to the correct person</h3><p>SukuuNova stores the vendor's external identifier—not a raw fingerprint template. Enrollment itself stays on the terminal/vendor system.</p></div><Fingerprint size={26}/></div><div className="attendance-device-form"><label>Method<select value={identityKind} onChange={(e)=>setIdentityKind(e.target.value as typeof identityKind)}><option value="fingerprint">Fingerprint</option><option value="card">Card / RFID</option></select></label><label>Person type<select value={targetType} onChange={(e)=>{const next=e.target.value as typeof targetType;setTargetType(next);setTargetId((next==="student"?students:staff)[0]?.id??"");}}><option value="student">Student</option><option value="staff">Staff</option></select></label><label>Person<select value={targetId} onChange={(e)=>setTargetId(e.target.value)}>{people.map((person)=><option value={person.id} key={person.id}>{person.name}{"admissionNo" in person?` · ${person.admissionNo}`:""}</option>)}</select></label><label>Terminal user / enrollment ID<input value={externalId} onChange={(e)=>setExternalId(e.target.value)} placeholder="ID emitted by terminal"/></label></div><div className="attendance-control-actions"><button className="primary" type="button" disabled={busy||!targetId||!externalId.trim()} onClick={()=>void saveIdentity()}>Save identity mapping</button></div><div className="identity-list">{identities.slice(0,30).map((identity)=>{const person=identity.studentId?students.find((row)=>row.id===identity.studentId):staff.find((row)=>row.id===identity.staffId);return <div key={identity.id}><span>{identity.deviceKind}</span><strong>{identity.externalId}</strong><small>{person?.name??"Unknown person"}</small><button type="button" disabled={busy} onClick={()=>void removeIdentity(identity.id)}>Remove</button></div>;})}</div></section>
      <section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Face enrollment</span><h3>Enroll the person who should be recognised</h3><p>Staff face enrollment supports secure QR face proof and face terminals. Student face enrollment requires a linked primary guardian because consent is part of the biometric workflow.</p></div><Camera size={26}/></div><div className="attendance-device-form"><label>Person type<select value={faceTargetType} onChange={(e)=>{const next=e.target.value as typeof faceTargetType;setFaceTargetType(next);setFaceTargetId((next==="student"?students:staff)[0]?.id??"");}}><option value="staff">Staff</option><option value="student">Student</option></select></label><label>Person<select value={faceTargetId} onChange={(e)=>setFaceTargetId(e.target.value)}>{facePeople.map((person)=><option key={person.id} value={person.id}>{person.name}{"admissionNo" in person?` · ${person.admissionNo}`:""}</option>)}</select></label><label className="face-file">Clear face photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(e)=>void readFaceFile(e.target.files?.[0]??null)}/><small>Use a clear, front-facing image under 2 MB.</small></label><div className="biometric-readiness"><ScanFace size={18}/><span>{faceTargetType==="staff"?(staff.find((p)=>p.id===faceTargetId)?.faceEnrolledAt?"Face already enrolled · saving replaces the enrollment":"No face enrollment yet"):(students.find((p)=>p.id===faceTargetId)?.primaryGuardian?`Guardian consent link: ${students.find((p)=>p.id===faceTargetId)?.primaryGuardian?.name}`:"Primary guardian required before enrollment")}</span></div></div>{faceImage?<div className="face-preview"><img src={faceImage} alt="Face capture preview"/><span>Preview only. Submit when the image is clear.</span></div>:null}<div className="attendance-control-actions"><button className="primary" type="button" disabled={busy||!faceTargetId||!faceImage} onClick={()=>void enrollFace()}>{busy?"Enrolling…":"Enroll face securely"}</button></div></section>
    </>:null}

    {view==="manual"?<section className="attendance-control-panel"><div className="attendance-control-heading"><div><span>Manual class register</span><h3>Fast attendance when a class teacher is taking the register</h3><p>Manual attendance is not a weaker copy of device attendance. It is the authorised classroom workflow for present, late, absent and excused decisions and remains available when automated verification has closed.</p></div><UsersRound size={28}/></div><div className="manual-attendance-options"><div><strong>Class register</strong><p>Choose class and date, start with everyone present, then change only exceptions.</p><Link href="/school/attendance/register">Open class register</Link></div><div><strong>Attendance overview</strong><p>Review present, late, absent and missing decisions across your permitted classes.</p><Link href="/school/attendance">Open attendance overview</Link></div><div><strong>Exceptions</strong><p>Resolve corrections and unusual attendance states through the governed review workflow.</p><Link href="/school/attendance/exceptions">Review exceptions</Link></div></div></section>:null}
  </div>;
}

function Metric({icon:Icon,label,value,meta}:{icon:typeof Settings2;label:string;value:string;meta:string}){return <div className="attendance-metric"><span><Icon size={17}/></span><small>{label}</small><strong>{value}</strong><p>{meta}</p></div>}
function ControlCard({icon:Icon,title,body,action}:{icon:typeof Settings2;title:string;body:string;action:React.ReactNode}){return <article><span><Icon size={19}/></span><h3>{title}</h3><p>{body}</p><div>{action}</div></article>}
function Step({n,title,body}:{n:string;title:string;body:string}){return <div><b>{n}</b><span><strong>{title}</strong><small>{body}</small></span></div>}
function Toggle({checked,onChange,title,body}:{checked:boolean;onChange:(value:boolean)=>void;title:string;body:string}){return <label className="attendance-toggle"><input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)}/><span><strong>{title}</strong><small>{body}</small></span></label>}
function ConnectionReceipt({receipt}:{receipt:ConnectionReceipt}){const copy=(value:string)=>navigator.clipboard?.writeText(value);return <section className="attendance-control-panel connection-receipt"><div className="attendance-control-heading"><div><span>One-time connection receipt</span><h3>Connect the terminal now</h3><p>The raw device secret is shown only in this response. Store it only in the terminal/gateway configuration.</p></div><ShieldCheck size={26}/></div><div className="connection-grid"><ReceiptField label="School code" value={receipt.connection.schoolCode} onCopy={copy}/><ReceiptField label="Device serial" value={receipt.connection.deviceSerial} onCopy={copy}/><ReceiptField label="Device secret" value={receipt.deviceSecret} onCopy={copy}/><ReceiptField label="Heartbeat endpoint" value={receipt.connection.heartbeatUrl} onCopy={copy}/><ReceiptField label="Attendance endpoint" value={receipt.connection.attendanceUrl} onCopy={copy}/></div><div className="connection-warning">After the gateway starts, it should send signed heartbeats periodically. The fleet will switch from “never connected” to “online” when SukuuNova receives one.</div></section>}
function ReceiptField({label,value,onCopy}:{label:string;value:string;onCopy:(value:string)=>void}){return <div><small>{label}</small><code>{value}</code><button type="button" onClick={()=>onCopy(value)}>Copy</button></div>}
