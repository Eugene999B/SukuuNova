export type StaffRole = {
  name: string;
  description: string;
  access: string[];
};

export type StaffCategory = {
  id: string;
  label: string;
  description: string;
  roles: StaffRole[];
};

export const STAFF_CATEGORIES: StaffCategory[] = [
  {
    id: "leadership",
    label: "School Leadership",
    description: "School-wide leadership, governance and decision-making.",
    roles: [
      { name: "Principal / Headteacher", description: "Leads the school, academic quality, staff and day-to-day operations.", access: ["School overview", "Academics", "Students", "Attendance", "Reports", "Announcements"] },
      { name: "Vice Principal / Deputy Head", description: "Supports school leadership and oversees delegated academic or operational areas.", access: ["School operations", "Academics", "Attendance", "Student welfare"] },
      { name: "Assistant Headteacher", description: "Supports leadership for a defined school phase, campus or operational portfolio.", access: ["Assigned school operations", "Staff", "Students", "Reports"] },
      { name: "Director of Studies / Academic Director", description: "Owns curriculum, teaching quality, assessment and academic planning.", access: ["Subjects", "Timetable", "Lessons", "Gradebook", "Exams", "Report cards"] },
      { name: "Head of Department", description: "Leads a subject department, teachers and academic standards.", access: ["Department subjects", "Assigned classes", "Gradebook", "Lesson planning"] },
      { name: "Academic Coordinator", description: "Coordinates curriculum delivery, assessment calendars and academic follow-up.", access: ["Academics", "Assessment", "Timetable", "Reports"] },
      { name: "School Operations Manager", description: "Coordinates non-academic school operations and service teams.", access: ["Operations", "Facilities", "Transport", "Inventory"] }
    ]
  },
  {
    id: "teaching",
    label: "Teaching & Classroom",
    description: "Teaching, class ownership, subject delivery and classroom support.",
    roles: [
      { name: "Teacher", description: "Teaches assigned subjects/classes, attendance, homework and assessment.", access: ["Assigned classes", "Attendance", "Homework", "Gradebook", "Messages", "Timetable"] },
      { name: "Class Teacher", description: "Primary teacher responsible for a class cohort and day-to-day learner follow-up.", access: ["Class students", "Attendance", "Homework", "Behaviour", "Parent communication"] },
      { name: "Subject Teacher", description: "Teaches one or more subjects across assigned classes or streams.", access: ["Assigned subjects", "Attendance", "Gradebook", "Homework", "Lesson plans"] },
      { name: "Assistant Teacher", description: "Supports an assigned teacher and class with permitted classroom tasks.", access: ["Assigned class", "Attendance", "Homework support", "Class communication"] },
      { name: "Trainee / Student Teacher", description: "Supervised teaching access for practicum or training placement.", access: ["Assigned lessons", "Attendance", "Draft planning"] },
      { name: "Special Education / SEN Teacher", description: "Supports learners with additional learning needs and intervention plans.", access: ["Assigned students", "Learning support", "Attendance", "Progress notes"] },
      { name: "Learning Support Assistant", description: "Provides classroom and learner support under designated staff supervision.", access: ["Assigned students", "Support notes", "Attendance"] },
      { name: "Early Years / Nursery Teacher", description: "Manages early-years teaching, routines and learner development records.", access: ["Assigned class", "Attendance", "Activities", "Progress"] },
      { name: "Teaching Assistant", description: "Supports classroom preparation, activities and supervised learner support.", access: ["Assigned class", "Activities", "Attendance support"] }
    ]
  },
  {
    id: "student-support",
    label: "Student Support & Welfare",
    description: "Learner wellbeing, counselling, discipline, health and safeguarding support.",
    roles: [
      { name: "School Counsellor", description: "Handles student wellbeing, counselling records and support interventions.", access: ["Student welfare", "Counselling notes", "Referrals"] },
      { name: "School Nurse", description: "Manages health visits, first aid and permitted student health records.", access: ["Health records", "Visits", "Emergency alerts"] },
      { name: "Matron / Housemother", description: "Supports boarding learners, welfare, routines and accommodation oversight.", access: ["Boarding", "Welfare", "Attendance", "Incidents"] },
      { name: "Housemaster / Housemistress", description: "Oversees a boarding house and learner welfare.", access: ["House learners", "Attendance", "Exeat", "Welfare"] },
      { name: "Discipline Officer", description: "Coordinates behaviour, conduct cases and disciplinary follow-up.", access: ["Behaviour", "Incidents", "Student welfare"] },
      { name: "Safeguarding / Child Protection Officer", description: "Manages confidential safeguarding workflows and protected referrals.", access: ["Safeguarding", "Referrals", "Protected student records"] },
      { name: "Sports Coordinator", description: "Coordinates sports, physical education and extracurricular teams.", access: ["Sports", "Activities", "Student groups"] },
      { name: "Coach / Activities Coordinator", description: "Runs clubs, activities, competitions and enrichment programs.", access: ["Activities", "Clubs", "Events"] },
      { name: "Chaplain / Faith & Values Lead", description: "Coordinates approved faith, values or chaplaincy activities.", access: ["Activities", "Events", "Student groups"] }
    ]
  },
  {
    id: "administration",
    label: "Administration & Records",
    description: "Front office, admissions, student records, correspondence and administration.",
    roles: [
      { name: "Administrator", description: "Broad school operations without Owner-level authority.", access: ["School operations", "Students", "Staff", "Communications"] },
      { name: "School Secretary", description: "Handles office administration, correspondence and records support.", access: ["Office", "Students", "Staff directory", "Communications"] },
      { name: "Receptionist / Front Desk", description: "Manages reception, visitors, calls and front-office workflows.", access: ["Visitors", "Messages", "Appointments"] },
      { name: "Registrar", description: "Maintains official learner records, enrolment and academic history.", access: ["Admissions", "Students", "Records", "Reports"] },
      { name: "Admissions Officer", description: "Manages enquiries, applications, document checks and enrolment conversion.", access: ["Enquiries", "Applications", "Enrolment", "Admissions reports"] },
      { name: "Records / Data Officer", description: "Maintains data quality, imports, exports and records integrity.", access: ["Student records", "Imports", "Exports", "Data quality"] },
      { name: "Personal Assistant / Executive Assistant", description: "Provides delegated administrative support to school leadership.", access: ["Assigned leadership workflows", "Calendar", "Communications"] },
      { name: "Procurement Officer", description: "Coordinates purchasing, suppliers, approvals and procurement records.", access: ["Procurement", "Inventory", "Suppliers", "Approvals"] },
      { name: "Storekeeper / Stores Officer", description: "Controls stock, issues, receipts and inventory records.", access: ["Inventory", "Stock", "Issue/return", "Reports"] }
    ]
  },
  {
    id: "finance",
    label: "Finance & Payroll",
    description: "Fees, collections, expenses, payroll and financial controls.",
    roles: [
      { name: "Accountant / Bursar", description: "Leads school accounting, fees, expenses and financial reporting.", access: ["Fees", "Invoices", "Payments", "Expenses", "Payroll", "Finance reports"] },
      { name: "Finance Officer", description: "Supports accounting, reconciliations and financial records.", access: ["Payments", "Invoices", "Reconciliation", "Finance reports"] },
      { name: "Cashier", description: "Captures authorised payments and issues receipts.", access: ["Payments", "Receipts", "Daily cashier report"] },
      { name: "Payroll Officer", description: "Manages salaries, deductions, payroll runs and payslips.", access: ["Payroll", "Staff salaries", "Payslips", "Payroll reports"] },
      { name: "Finance Clerk", description: "Handles controlled finance data-entry and filing tasks.", access: ["Invoices", "Payments", "Receipts"] }
    ]
  },
  {
    id: "ict",
    label: "ICT & Digital Services",
    description: "Technology support, systems administration and digital learning.",
    roles: [
      { name: "ICT Manager / Coordinator", description: "Owns school technology operations, systems and digital support.", access: ["ICT", "Device inventory", "User support", "Digital services"] },
      { name: "Systems Administrator", description: "Maintains systems, integrations, accounts and technical configuration.", access: ["Technical settings", "User support", "Integrations", "Audit support"] },
      { name: "IT Support Technician", description: "Handles device, connectivity and user technical support.", access: ["Support tickets", "Devices", "Connectivity"] },
      { name: "ICT / Computing Teacher", description: "Teaches computing and supports digital learning activities.", access: ["Assigned classes", "Subjects", "Gradebook", "Homework"] },
      { name: "Lab Assistant / Technician", description: "Supports science/computing laboratories, equipment and practical sessions.", access: ["Lab inventory", "Practical sessions", "Equipment"] }
    ]
  },
  {
    id: "library",
    label: "Library & Learning Resources",
    description: "Library services, learning resources and resource circulation.",
    roles: [
      { name: "Librarian", description: "Manages the catalogue, circulation, members and library operations.", access: ["Library", "Borrowing", "Returns", "Overdues"] },
      { name: "Library Assistant", description: "Supports circulation, shelving and member services.", access: ["Borrowing", "Returns", "Catalogue"] },
      { name: "Resource Centre Coordinator", description: "Manages digital and physical learning resources.", access: ["Resources", "Library", "Digital content"] }
    ]
  },
  {
    id: "transport",
    label: "Transport & Mobility",
    description: "Routes, vehicles, drivers, manifests and transport safety.",
    roles: [
      { name: "Transport Manager", description: "Manages school transport operations, routes, vehicles and assignments.", access: ["Transport", "Routes", "Vehicles", "Manifests"] },
      { name: "Transport Coordinator", description: "Coordinates daily routes, learner assignments and transport communication.", access: ["Routes", "Manifests", "Transport alerts"] },
      { name: "Driver", description: "Uses only assigned transport routes, trips and manifests.", access: ["Assigned trips", "Manifest", "Transport alerts"] },
      { name: "Bus Attendant / Bus Monitor", description: "Supports learner safety and boarding checks during transport.", access: ["Assigned route", "Manifest", "Safety notes"] }
    ]
  },
  {
    id: "security",
    label: "Security & Front Gate",
    description: "Campus security, visitors, pickup verification and incident reporting.",
    roles: [
      { name: "Security Supervisor", description: "Leads campus security and gate operations.", access: ["Visitors", "Gate operations", "Incidents", "Pickup verification"] },
      { name: "Security Officer / Guard", description: "Handles assigned gate, patrol and visitor workflows.", access: ["Visitors", "Gate", "Incidents", "Pickup checks"] },
      { name: "Gate Officer", description: "Controls authorised entry and exit workflows at the school gate.", access: ["Visitors", "Entry/exit", "Pickup verification"] },
      { name: "Safety / Compliance Officer", description: "Coordinates safety checks, incidents and compliance activities.", access: ["Safety", "Incidents", "Compliance reports"] }
    ]
  },
  {
    id: "boarding",
    label: "Boarding & Accommodation",
    description: "Boarding houses, room allocation, routines, welfare and exeats.",
    roles: [
      { name: "Boarding Coordinator", description: "Oversees boarding operations across houses and accommodation.", access: ["Boarding", "Houses", "Exeat", "Welfare"] },
      { name: "House Parent / House Supervisor", description: "Manages daily house routines and learner welfare.", access: ["House learners", "Attendance", "Welfare", "Incidents"] },
      { name: "Boarding Assistant", description: "Supports supervised boarding routines and learner services.", access: ["Assigned house", "Attendance", "Support tasks"] }
    ]
  },
  {
    id: "catering",
    label: "Catering & Feeding",
    description: "Meals, menus, kitchen operations and feeding records.",
    roles: [
      { name: "Catering Manager", description: "Leads school feeding, kitchen operations and meal planning.", access: ["Feeding", "Menus", "Inventory", "Suppliers"] },
      { name: "Head Cook / Chef", description: "Runs kitchen preparation and meal service.", access: ["Feeding", "Menus", "Kitchen tasks"] },
      { name: "Cook / Kitchen Staff", description: "Supports food preparation and service.", access: ["Meal service", "Kitchen tasks"] },
      { name: "Dining Hall Attendant", description: "Supports supervised meal service and dining operations.", access: ["Meal service", "Attendance support"] }
    ]
  },
  {
    id: "facilities",
    label: "Facilities, Maintenance & Grounds",
    description: "Buildings, maintenance, cleaning, grounds and physical assets.",
    roles: [
      { name: "Facilities Manager", description: "Coordinates buildings, maintenance schedules and service teams.", access: ["Facilities", "Maintenance", "Assets"] },
      { name: "Maintenance Technician", description: "Handles assigned maintenance work orders and repairs.", access: ["Maintenance", "Work orders", "Assets"] },
      { name: "Electrician / Plumber / Tradesperson", description: "Performs assigned technical maintenance work.", access: ["Assigned work orders", "Maintenance records"] },
      { name: "Cleaner / Janitorial Staff", description: "Handles assigned cleaning and facility service tasks.", access: ["Assigned tasks", "Maintenance requests"] },
      { name: "Groundskeeper / Compound Worker", description: "Maintains grounds, outdoor areas and compound services.", access: ["Assigned tasks", "Facilities requests"] },
      { name: "Laundry / Housekeeping Staff", description: "Supports boarding, uniforms or accommodation housekeeping where applicable.", access: ["Assigned tasks", "Boarding support"] }
    ]
  },
  {
    id: "communications",
    label: "Communications & Community",
    description: "School announcements, stakeholder communication and events.",
    roles: [
      { name: "Communications Officer", description: "Coordinates official school communications and announcements.", access: ["Announcements", "Broadcasts", "Events"] },
      { name: "Community / Parent Liaison Officer", description: "Coordinates parent and community engagement.", access: ["Messages", "Parent engagement", "Events"] },
      { name: "Events Coordinator", description: "Plans school events, calendars and participation logistics.", access: ["Events", "Calendar", "Communications"] }
    ]
  },
  {
    id: "human-resources",
    label: "Human Resources",
    description: "Staff records, recruitment, leave, performance and workforce administration.",
    roles: [
      { name: "HR Manager / Officer", description: "Manages staff records, recruitment, onboarding and workforce processes.", access: ["Staff records", "Recruitment", "Leave", "HR reports"] },
      { name: "HR Assistant", description: "Supports controlled HR data-entry and employee administration.", access: ["Staff records", "Recruitment", "HR tasks"] },
      { name: "Recruitment Officer", description: "Coordinates vacancies, candidates, interviews and hiring workflow.", access: ["Recruitment", "Candidates", "Interview scheduling"] }
    ]
  },
  {
    id: "custom",
    label: "Custom School Role",
    description: "Create a role for a responsibility unique to your school.",
    roles: [
      { name: "Custom Role", description: "Define a school-specific responsibility and refine its permissions in Roles & Permissions.", access: ["Custom permissions"] }
    ]
  }
];

export const STAFF_ROLE_LOOKUP = new Map(
  STAFF_CATEGORIES.flatMap((category) => category.roles.map((role) => [role.name, { ...role, category: category.label }]))
);

export const STAFF_CATEGORY_LOOKUP = new Map(STAFF_CATEGORIES.map((category) => [category.id, category]));
