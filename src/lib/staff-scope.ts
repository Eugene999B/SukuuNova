import type { Prisma } from "@prisma/client";
// Include dual staff/family accounts. A nullable legacy role key must not
// make SQL's three-valued NOT logic hide a legitimate Owner or Teacher.
export const staffUserWhere: Prisma.UserWhereInput = {
  userRoles: { some: { role: { AND: [
    { OR: [{ key: null }, { key: { notIn: ["parent", "guardian", "student"], mode: "insensitive" } }] },
    { name: { notIn: ["parent", "guardian", "student"], mode: "insensitive" } },
  ] } } },
};
