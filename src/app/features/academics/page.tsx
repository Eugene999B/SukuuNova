import "../capability.css";
import { MarketingCapabilityPage } from "@/components/MarketingCapabilityPage";

export default function AcademicsFeaturePage() {
  return (
    <MarketingCapabilityPage
      eyebrow="Academics"
      title="Make the academic day easier to see, manage and improve."
      intro="Classes, subjects, timetable, homework, assessment and report cards work better when they are connected to the same academic structure instead of living in separate tools."
      accent="#244f83"
      workspaceHref="/school/classes"
      workspaceLabel="Open Academics"
      sections={[
        { title: "Build the academic structure", body: "Keep classes, houses, subjects and teaching relationships organised around the structure your school actually uses." },
        { title: "Timetable with context", body: "Plan the week around classes, subjects and teachers, then keep the resulting schedule visible where people need it." },
        { title: "Homework stays attached", body: "Teachers can assign and review work in the context of the class and subject rather than starting from a blank communication tool." },
        { title: "Assessment becomes a story", body: "Bring assessment records together so teachers and leadership can see patterns rather than isolated marks." },
        { title: "Report cards follow the record", body: "Move from academic evidence to clear reporting without rebuilding the learner context every term." },
        { title: "Leadership sees readiness", body: "Connected academic data gives school leaders a clearer view of teaching, completion and areas that need attention." },
      ]}
      outcomes={[
        "Less duplicate academic setup",
        "A clearer weekly teaching structure",
        "Homework and assessment stay connected",
        "Better context for report cards and leadership review",
      ]}
    />
  );
}
