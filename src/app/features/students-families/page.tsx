import "../capability.css";
import { MarketingCapabilityPage } from "@/components/MarketingCapabilityPage";

export default function StudentsFamiliesFeaturePage() {
  return (
    <MarketingCapabilityPage
      eyebrow="Students & families"
      title="Keep every important person connected to the school day."
      intro="Bring admissions, learner records, guardians and people operations into one dependable picture, so the school always knows who is here, who belongs together and what needs attention."
      accent="#174a7e"
      workspaceHref="/school/students"
      workspaceLabel="Open Students"
      sections={[
        { title: "Admissions become a record", body: "Capture the journey from enquiry to application to enrolment without creating a second source of truth." },
        { title: "A learner is more than a name", body: "Keep student details, class placement, guardian relationships and day-to-day context connected around the same learner record." },
        { title: "Families stay in the picture", body: "Give authorised staff the context they need to contact guardians and follow up without searching through disconnected lists." },
        { title: "People operations stay orderly", body: "Keep staff and learner information aligned with the responsibilities, roles and relationships that depend on it." },
        { title: "Access follows responsibility", body: "Role-based access keeps sensitive people information visible only to the people who need it for their work." },
        { title: "The school sees one story", body: "The same underlying people records can support attendance, academics, finance and communication without repeated data entry." },
      ]}
      outcomes={[
        "Fewer duplicate learner and guardian records",
        "Clearer handoffs from admissions to enrolment",
        "Faster access to the context staff need",
        "A connected foundation for attendance and academics",
      ]}
    />
  );
}
