import { AppShell } from "@/components/AppShell";
import HandoutPrintStudio, { type HandoutModule } from "./HandoutPrintStudio";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { getSchoolDocumentIdentity } from "@/lib/school-document-identity";
import "./handout.css";

const MODULES: Record<string, HandoutModule> = {
  face_recognition: {
    key: "face_recognition",
    label: "Smart gate & face attendance",
    description: "Face-assisted identity checks and attendance workflows for configured school entry points.",
  },
  payroll: {
    key: "payroll",
    label: "Staff payroll",
    description: "Staff salary structures, payroll runs and individual payslip access.",
  },
  transport: {
    key: "transport",
    label: "Transport tracking",
    description: "School transport routes, boarding events and guardian journey updates.",
  },
  feeding: {
    key: "feeding",
    label: "School feeding",
    description: "Track school feeding operations alongside your wider school workspace.",
  },
  cbt: {
    key: "cbt",
    label: "Online exams",
    description: "Computer-based assessment workflows for online examinations.",
  },
  library: {
    key: "library",
    label: "Library",
    description: "Library records and the school resources your team manages for learners.",
  },
  assets: {
    key: "assets",
    label: "Assets",
    description: "Operational asset records for the school and its day-to-day resources.",
  },
  recruitment: {
    key: "recruitment",
    label: "Recruitment",
    description: "Staff recruitment and hiring workflows for the school team.",
  },
};

function enabledFlags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((flag): flag is string => typeof flag === "string");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => enabled === true)
      .map(([flag]) => flag);
  }
  return [];
}

function supportContact() {
  const phone = process.env.SUKUUNOVA_SUPPORT_PHONE?.trim();
  const whatsapp = process.env.SUKUUNOVA_SUPPORT_WHATSAPP?.trim();
  const email = process.env.SUKUUNOVA_SUPPORT_EMAIL?.trim();
  const values = [
    phone && `phone ${phone}`,
    whatsapp && `WhatsApp ${whatsapp}`,
    email && `email ${email}`,
  ].filter(Boolean) as string[];
  return values.length ? values.join(" · ") : "SukuuNova Help & Support in your school workspace";
}

export default async function SettingsHandoutPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({
    where: { id: session.schoolId },
    select: {
      name: true,
      uniqueCode: true,
      logoUrl: true,
      brandColors: true,
      subscriptionPlan: { select: { name: true, featureFlags: true } },
      settings: { select: { reportCardWatermark: true } },
    },
  }));

  if (!school) return null;

  const planName = school.subscriptionPlan?.name ?? "Plan not assigned";
  const flags = enabledFlags(school.subscriptionPlan?.featureFlags);
  const modules = flags
    .map((flag) => MODULES[flag])
    .filter((module): module is HandoutModule => Boolean(module));
  const generatedDate = new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Accra",
  }).format(new Date());

  return (
    <AppShell
      universe="school"
      title="SukuuNova Handout"
      subtitle="A printable guide to your system, ready to share with your staff."
      active="School Settings"
      schoolName={school.name}
      schoolCode={school.uniqueCode}
      userName={session.name}
    >
      <HandoutPrintStudio
        identity={getSchoolDocumentIdentity({ ...school, watermark: school.settings?.reportCardWatermark })}
        generatedDate={generatedDate}
        planName={planName}
        modules={modules}
        supportContact={supportContact()}
      />
    </AppShell>
  );
}
