import "../capability.css";
import { MarketingCapabilityPage } from "@/components/MarketingCapabilityPage";

export default function AttendanceSafetyFeaturePage() {
  return <MarketingCapabilityPage eyebrow="Attendance & safety" title="See who is in school, who is late and who needs a call." intro="Take the morning register, catch absences early and keep a clear record of what happened during the day." accent="#195b55" workspaceHref="/school/attendance" workspaceLabel="Attendance" sections={[
    { title: "Start with the register", body: "Teachers can record who is present and who is not without waiting for the office to rebuild the list later." },
    { title: "Mark the exceptions", body: "Lateness and absence stay visible, so a missed learner does not disappear into a pile of messages." },
    { title: "Bring device attendance together", body: "Approved attendance devices can feed into the same school record used by staff." },
    { title: "Follow up while it is fresh", body: "Open the exception, check the context and take the next step while the information is still current." },
    { title: "Keep the record", body: "The school is left with a clear history of attendance events that authorised staff can review later." },
  ]} outcomes={["A faster morning register", "Clearer absence and lateness follow-up", "Manual and approved device attendance in one place", "A record the school can return to later"]} />;
}
