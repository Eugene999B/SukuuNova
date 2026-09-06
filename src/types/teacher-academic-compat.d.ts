// Compatibility declaration for the first teacher-workspace slice.
// The initial service intentionally used raw SQL instead of Prisma models; this keeps
// the legacy raw row extensible while later Prisma schema work lands.
declare interface Object {
  answerGuide?: unknown;
}
