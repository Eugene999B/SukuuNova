# SukuuNova Family, Transport, Device & Guide Blueprint

This blueprint supersedes the earlier assumption that SukuuNova needs a separate Student Portal. The product direction is a **Family Learning Portal**: one secure guardian/family shell, multiple linked children, and child-scoped learning/operations experiences inside the same portal.

## 1. Family Portal 2.0

The Family Portal is the shared home for parents/guardians and child learning context.

### Core child context
- Persistent child switcher across attendance, academics, assignments, fees, report cards, Library, Arcade, transport and messages.
- Authorization is always re-established from Guardian-to-Student links server-side. `studentId` is view context, never authority.
- Each child gets a dashboard with today's attendance, upcoming work, results/reports, fees summary, Library progress, Arcade progress and transport state.
- Family-wide announcements may appear once, but child-specific records must never mix.

### Optional Learner Mode inside the Family Portal
A separate Student Portal is not required. If schools want a child to use the same family account independently, add an optional **Learner Mode** for the selected child:
- learning-only surface: assignments, Library, Arcade, timetable, approved resources and school announcements;
- hides guardian finance controls, guardian messaging history, family settings and sibling private data;
- optionally protected by a family/school learner PIN;
- exiting Learner Mode returns to the guardian shell after guardian re-auth/PIN when configured.

## 2. Advanced school transport architecture

Current SukuuNova transport foundations (vehicles, routes, stops, vehicle locations, parent locations, boarding events and compliance reminders) remain the base. The advanced system should extend them rather than create a second transport ledger.

### 2.1 Vehicle tracker hardware standard

**Recommended standard for buses: Teltonika FMC130**
- 4G LTE Cat 1 with 2G fallback variants;
- GNSS tracking;
- internal backup battery;
- 3 digital inputs / 3 digital outputs;
- 2 analog inputs;
- CAN-adapter input;
- 1-Wire;
- enough I/O for ignition, door state, panic button, buzzer/RFID/CAN extensions.

**Budget/basic option: Teltonika FMC920**
- 4G Cat 1 GNSS tracker with backup battery;
- basic digital/analog I/O;
- suitable when the school needs location + ignition only.

Do not mass-purchase trackers before one physical unit passes the SukuuNova lab certification checklist.

### 2.2 Tracker-to-SukuuNova data path

Do not connect trackers directly to Next.js application routes. Vehicle trackers use long-lived TCP/UDP telemetry and require a dedicated ingestion service.

Recommended path:

`Bus tracker -> Ghana data/M2M SIM -> SukuuNova Tracker Gateway -> normalized location/event stream -> PostgreSQL/real-time cache -> geofence/ETA engine -> Message outbox -> Family Portal`

Tracker Gateway responsibilities:
- listen on dedicated TCP/TLS ports;
- identify device by IMEI/device registration;
- decode vendor protocol (Teltonika Codec 8 Extended first);
- reject unknown/disabled devices;
- normalize GPS time, latitude, longitude, speed, heading, satellite/GNSS quality, ignition and I/O state;
- write only to the mapped school/vehicle;
- publish latest-location updates for live maps;
- expose health metrics, not school-facing credentials.

Prefer secure device transport where the selected model/network supports it. If a tracker cannot provide strong TLS authentication, use a private APN/VPN or tightly firewalled isolated ingestion endpoint and treat IMEI as an identifier, not a secret.

### 2.3 Device registration model

Add a tenant-safe `TransportTrackerDevice` concept with at least:
- id, schoolId, vehicleId;
- vendor, model;
- IMEI / serial number (globally unique where appropriate);
- SIM ICCID / MSISDN (protected display);
- carrier/APN label;
- protocol/codec;
- status: provisioning / active / offline / suspended / retired;
- firmware/config version;
- lastSeenAt;
- lastGpsAt;
- lastPowerState;
- lastKnownIp where useful;
- installation date + installer;
- installation notes;
- health/diagnostic summary;
- audit trail.

Never expose raw tracker credentials to school parents.

### 2.4 Recommended Teltonika setup profile

Initial pilot profile should be conservative and stable:
- network: LTE Cat 1, fallback where device/carrier supports it;
- SIM: M2M/IoT SIM preferred; normal data SIM acceptable for lab/pilot;
- APN: carrier-provided;
- data protocol: Codec 8 Extended;
- transport: TCP or secure supported variant;
- server: dedicated tracker-ingest hostname/IP and port;
- time: UTC in telemetry; render school-local time in SukuuNova;
- moving location interval: roughly 10-15 seconds during an active school trip;
- stationary interval: 60-180 seconds;
- ignition input configured;
- offline flash buffering enabled;
- FOTA/remote configuration enabled through vendor management tooling;
- no remote engine immobilization in the school-bus pilot.

The internal tracker battery is only a short backup. If a school requires long tracking after vehicle power loss, install an approved external backup power solution.

### 2.5 Trip model

Tracking must be trip-aware rather than treating every vehicle as permanently live.

Add/extend:
- route;
- scheduled run;
- trip instance;
- direction: morning pickup / afternoon drop-off / special;
- assigned vehicle;
- assigned driver;
- assigned learners;
- planned start/end;
- actual start/end;
- status: planned / preparing / active / paused / completed / cancelled;
- route polyline and stop sequence;
- tracker freshness state.

Parents may see the assigned vehicle only during a relevant active trip window.

## 3. Parent pickup/drop-off locations

### 3.1 Map pin experience

Inside each child's Transport area the guardian can:
- use current phone/browser location;
- search an address/landmark;
- drag a pin to the exact preferred pickup/drop-off point;
- choose Morning, Afternoon or Both;
- add short directions such as "blue gate opposite pharmacy";
- set regular days;
- request a temporary alternate location with start/end validity;
- see the configured early-warning radius on the map.

### 3.2 School approval is mandatory

A guardian submits a **pickup request**. The transport officer/authorized school user approves it and assigns it to a route/stop.

Parents must not be able to alter bus routes unilaterally. A temporary change may have a school cutoff and must be approved before it becomes operational.

### 3.3 Two-stage notification radii

Use two configurable geofences rather than one oversized circle:
- **Approaching radius**: e.g. 800 m-2 km depending on traffic/area;
- **Arriving radius**: e.g. 100-400 m.

Schools choose defaults; transport officers may tune exceptional stops. Store meters internally even if the UI also displays miles/km.

## 4. Geofence engine: prevent false alerts

Never send an alert because one GPS point happens to fall inside a circle.

Per trip + learner/stop maintain a state machine:
- outside;
- approaching;
- arriving;
- arrived/passed;
- completed.

An approaching notification should require:
- active trip;
- location fresh (for example <90 seconds old);
- correct assigned bus/route;
- two or more consecutive valid points meeting the condition;
- distance decreasing or route/heading consistent with approach;
- not already notified for that trip/event;
- configurable minimum speed / stationary handling;
- no route-completed state.

Use hysteresis so GPS jitter does not toggle a bus repeatedly in/out of the same geofence.

Idempotency key example:
`transport:{tripId}:{studentId}:approaching`

The same event must not charge SMS credits twice.

## 5. Live Family Portal map

Use a SukuuNova-branded embedded map rather than redirecting parents to another map application.

Recommended front end:
- MapLibre GL JS renderer;
- commercial/private map tiles and geocoding for production (MapTiler is one practical first provider);
- do not rely on public OpenStreetMap tile servers as a free production CDN;
- preserve provider abstraction so map tiles/geocoder can later be self-hosted or switched.

Parent live view:
- assigned bus marker with smooth interpolation;
- route line;
- child's approved pickup/drop-off pin;
- next stop;
- estimated arrival window;
- last update age;
- state chip: On route / Approaching / Arriving / Delayed / Location unavailable / Trip completed;
- morning/afternoon context;
- recent boarding/alighting confirmation where available.

School transport command centre additionally shows:
- full active fleet;
- speed/heading;
- route deviation;
- stale tracker/offline device;
- ignition/power state;
- emergency input;
- overdue compliance;
- active trips and unassigned children.

Parents must never see other families' pickup coordinates or unassigned buses.

## 6. Real-time delivery

Recommended real-time stack:
- Tracker Gateway writes durable points to PostgreSQL and current position to a low-latency cache/event stream;
- Family Portal subscribes through WebSocket or Server-Sent Events scoped to the authenticated guardian + selected child + active trip;
- fallback polling if the streaming channel fails;
- never extrapolate a vehicle indefinitely after tracker loss;
- after a stale threshold, freeze the marker and clearly show "Location delayed".

Detailed points can have a shorter retention period; retain trip summaries/events longer according to school/privacy policy.

## 7. Transport notifications

Transport alerts should use the existing unified Message outbox:
- in-app first;
- SMS when school policy enables it and wallet has credits;
- WhatsApp when approved/configured;
- optional fallback rules.

Templates:
- bus_trip_started;
- bus_approaching_pickup;
- bus_arriving_pickup;
- child_boarded;
- child_alighted;
- route_delay;
- tracker_location_unavailable;
- trip_completed;
- transport_emergency.

Guardian preference controls may select channels for routine events, while school safety/emergency rules may mark some notices mandatory.

## 8. Boarding/alighting verification

The existing boarding-event concept should be retained and deepened.

Possible methods:
- driver/attendant scans learner QR;
- NFC/RFID card reader connected through supported tracker/accessory/gateway;
- dedicated bus tablet/phone roster;
- manual attendant confirmation as fallback.

Every boarding/alighting event is linked to trip, vehicle, learner and timestamp and can trigger the configured guardian notification exactly once.

## 9. Biometric hardware integration

### 9.1 Pilot standard

Recommended first certified unit: **ZKTeco SpeedFace-V5L** because it supports face, fingerprint and card in one terminal and offers TCP/IP, optional Wi-Fi, ADMS, AC Push, TA Push and HTTPS backend support.

Procurement rule: buy one lab unit first, prove enrollment + event delivery + offline recovery + duplicate handling + clock/timezone + network failure, then certify the exact firmware/model before bulk purchase.

### 9.2 SukuuNova Device Gateway

Support two modes:
1. direct cloud push where the exact certified device/firmware can securely push to SukuuNova;
2. **SukuuNova Device Gateway** on a school mini-PC/Raspberry Pi/Windows service for LAN-only devices.

Gateway duties:
- discover/connect to configured devices;
- map vendor user IDs to SukuuNova staff/student IDs;
- normalize face/fingerprint/card attendance events;
- buffer while internet is down;
- retry with idempotency;
- heartbeat/device health;
- push to SukuuNova over outbound HTTPS;
- never expose the school LAN device directly to the public internet.

### 9.3 Biometric privacy principle

Prefer storing biometric templates on the certified device/vendor system and sending identity/event results to SukuuNova. Do not collect raw fingerprint images or raw biometric templates in the main application unless a specific certified workflow truly requires it.

## 10. Platform-owner Implementation & Guide Center

Add a first-class **SukuuNova Academy / Implementation Center** to the platform-owner portal.

### Guide groups

**Start & launch a school**
- create school;
- branding;
- academic year/term;
- classes/subjects;
- roles/users;
- students/guardians;
- data import;
- fees;
- go-live readiness.

**Attendance & biometric devices**
- recommended device matrix;
- wiring/network checklist;
- register device;
- configure IP/Wi-Fi;
- set push/gateway mode;
- enrollment;
- first test punch;
- last-seen/health;
- offline recovery;
- troubleshooting.

**Transport & GPS**
- approved tracker models;
- SIM/APN preparation;
- power/wiring;
- IMEI registration;
- server/port/codec configuration;
- route/trip setup;
- pickup approval;
- test GPS point;
- live map test;
- geofence alert test;
- FOTA/config update;
- tracker-offline troubleshooting.

**SMS**
- Arkesel default setup;
- optional Sailup/Hubtel setup;
- sender ID approval;
- platform inventory purchase;
- school allocation/resale;
- school wallet;
- segment estimator;
- test send;
- refunds/failures;
- low balance.

**WhatsApp**
- business/sender setup;
- Twilio/Meta provider credentials;
- template approval;
- report-card document template;
- webhook verification;
- test recipient;
- sent/delivered/read/failed states;
- troubleshooting.

**Academics & reports**
- timetable;
- lesson plans;
- assignments;
- gradebook;
- report-card approval/release;
- guardian visibility;
- WhatsApp/SMS release tests.

**Library & Arcade**
- add digital/physical resources;
- read-only/download policy;
- circulation;
- learner resources;
- 64-game controls;
- age/standard settings;
- leaderboards.

**Finance & school operations**
- fee structures;
- invoices/payments/reversals;
- receipts;
- payroll;
- transport;
- feeding;
- assets;
- visitors/pickup;
- recruitment.

### Guide UX
- card-based categories;
- search;
- role filters;
- progress/checklists;
- estimated setup time;
- prerequisites;
- screenshots/annotated diagrams;
- approved vendor product image where licensing permits;
- "Open this setting" deep links;
- copyable configuration values;
- Test Connection / Run Test buttons;
- success criteria;
- common failure explanations;
- printable/shareable school handout;
- versioned guide history so instructions match certified firmware/provider versions.

School admins should receive a simpler school-facing copy of relevant guides. Teachers, parents and transport staff get role-specific Help Center articles written in plain language.

## 11. Family Help Center

Inside the Family Portal provide visual guides for:
- switch between children;
- set/request pickup location;
- follow the live bus;
- understand bus status;
- receive/adjust notification preferences;
- view attendance;
- open results/report cards;
- use Library Reading Mode;
- use Arcade/leaderboards;
- submit learning work;
- view fees/receipts;
- contact school.

Keep parent instructions short, illustrated and task-focused.

## 12. Report cards over WhatsApp/SMS: hardening plan

Current report release already produces signed public report-PDF URLs and queues unified notifications, but the release preflight still contains legacy SMS provider assumptions and WhatsApp delivery depends on correctly configured Twilio Content templates.

Before pilot certification:
- replace legacy SMS env preflight with the active multi-provider SMS readiness check;
- validate school channel settings and actual provider readiness;
- use E.164 phone normalization;
- add school/admin "Send test report-card notification" workflow;
- support an approved WhatsApp PDF/document content template;
- verify the media endpoint with GET/HEAD, correct `application/pdf` content type and file-size limit;
- add Twilio status callbacks for accepted/sent/delivered/read/failed where available;
- show per-guardian delivery status in the report-card release UI;
- make retries idempotent;
- provide optional fallback from WhatsApp failure to in-app/SMS according to school policy;
- keep guardian-portal report access as the authoritative long-term copy.

Preferred privacy model:
- WhatsApp PDF attachment may use a short-lived provider-fetch token;
- SMS should prefer a guardian-login deep link rather than a long-lived bearer PDF link;
- every external release is auditable.

## 13. Hardware procurement checklist

Do not buy a device merely because the vendor says it supports GPS/face/fingerprint.

For every exact model/firmware verify:
- Ghana-supported cellular bands (for trackers);
- local SIM/APN compatibility;
- protocol/API availability;
- push vs polling behavior;
- TLS/HTTPS support;
- offline buffer capacity;
- time synchronization;
- remote firmware/configuration path;
- power requirements;
- operating temperature/environment;
- local warranty/distributor/installer support;
- replacement availability;
- total cost of SIM/data/cloud licensing;
- one full SukuuNova lab test.

Maintain an `Approved Device Catalogue` in the platform portal with status: Research / Lab testing / Certified / Deprecated / Blocked.

## 14. Immediate engineering order

1. Correct the pilot plan to Family Portal 2.0 instead of a separate Student Portal.
2. Harden report-card SMS/WhatsApp provider preflight and delivery receipts.
3. Build advanced transport data model: tracker devices, trips, learner transport assignment, guardian pickup requests, geofence state and alert idempotency.
4. Build dedicated Teltonika Tracker Gateway + Codec 8 Extended decoder and health registry.
5. Build Family Portal transport map/pin approval workflow with MapLibre.
6. Build geofence/ETA alert engine and connect it to the existing prepaid messaging outbox.
7. Build Platform Device Center + Approved Device Catalogue.
8. Build ZKTeco SpeedFace-V5L adapter/gateway certification path.
9. Build Platform Implementation/Guide Center and Family Help Center.
10. Run real-hardware pilot certification before advertising live tracking/biometric hardware as generally available.

The goal is not merely to show a moving bus icon. The goal is a reliable, auditable, privacy-safe transport and device platform that schools can install repeatedly using SukuuNova's own guides and diagnostics.
