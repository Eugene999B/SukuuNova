import type { Prisma } from "@prisma/client";
// A person may be both a teacher and a parent; any non-family role qualifies.
export const staffUserWhere: Prisma.UserWhereInput = {
  userRoles: { some: { role: { NOT: { OR: [
    { key: { in: ["parent", "guardian", "student"], mode: "insensitive" } },
    { name: { in: ["parent", "guardian", "student"], mode: "insensitive" } },
  ] } } } },
};
