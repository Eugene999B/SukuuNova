import "../capability.css";
import { MarketingCapabilityPage } from "@/components/MarketingCapabilityPage";

export default function AttendanceSafetyFeaturePage() {
  return (
    <MarketingCapabilityPage
      eyebrow="Attendance & safety"
      title="Know who is present, late or missing before it becomes a bigger problem."
      intro="Daily registers, lateness, absence, device attendance and exception handling come together so a school can respond quickly and keep a dependable record of the day."
      accent="#195b55"
      workspaceHref="/school/attendance"
      workspaceLabel="Open Attendance"
      sections={[
        { title: "Start with the daily register", body: "Give staff a clear place to mark attendance and see the current state of every learner." },
        { title: "Lateness is visible too", body: "Capture exceptions instead of forcing the school to reconstruct the morning from messages and memory." },
        { title: "Device attendance can feed the same story", body: "Keep approved device-based attendance connected to the school record instead of treating it as a separate universe." },
        { title: "Follow up from the exception", body: "Make absence and attendance exceptions easier to review and act on while the context is still fresh." },
        { title: "Sensitive data stays controlled", body: "Attendance information follows the same role and tenant boundaries as the rest of the school record." },
        { title: "Leadership gets useful signals", body: "Spot patterns and recurring exceptions without reducing attendance to a single headline number." },
      ]}
      outcomes={[
        "Faster daily attendance routines",
        "Clearer visibility into lateness and absence",
        "One record for manual and approved device attendance",
        "Better follow-through on attendance exceptions",
      ]}
    />
  );
}
