import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { generateBalancedTimetable } from "@/lib/timetable-engine-v2";
import { getAcademicEngineConfig, saveAcademicEngineConfig } from "@/lib/academic-engine";

const day=z.object({dayOfWeek:z.number().int().min(1).max(7),name:z.string().min(2).max(20),enabled:z.boolean(),start:z.string().regex(/^\\d{2}:\\d{2}$/),end:z.string().regex(/^\\d{2}:\\d{2}$/)});
const timetable=z.object({days:z.array(day).min(1).max(7),periodMinutes:z.number().int().min(20).max(120),breaks:z.array(z.object({name:z.string().min(1).max(40),start:z.string().regex(/^\\d{2}:\\d{2}$/),end:z.string().regex(/^\\d{2}:\\d{2}$/)})).max(8),periodsPerDay:z.number().int().min(1).max(16),published:z.boolean(),weeklyPeriods:z.record(z.string(),z.number().int().min(1).max(10)).optional()});
const assessment=z.object({categories:z.array(z.object({name:z.string().min(1).max(80),weight:z.number().min(0).max(100)})).min(1).max(16),rounding:z.enum(["nearest","down","up"]),missingScorePolicy:z.enum(["blank","zero"]),allowTeacherOverride:z.boolean()});
const report=z.object({includePosition:z.boolean(),includeSubjectPosition:z.boolean(),includeAttendance:z.boolean(),includeTeacherRemark:z.boolean(),includeHeadRemark:z.boolean(),includeSignatures:z.boolean(),includeSchoolContacts:z.boolean(),rankMethod:z.enum(["total_average","weighted_total"]),showGrades:z.boolean(),showClassAverage:z.boolean()});
const schema=z.discriminatedUnion("action",[z.object({action:z.literal("save"),timetable:timetable.optional(),assessment:assessment.optional(),reportCard:report.optional()}),z.object({action:z.literal("generate"),replaceExisting:z.boolean().default(false),classIds:z.array(z.string()).max(100).optional()})]);
export async function GET(){try{const session=await requireSchoolSession();return NextResponse.json(await withTenant(session.schoolId,tx=>getAcademicEngineConfig(tx)));}catch(e){return routeError(e);}}
export async function POST(request:Request){try{const session=await requireSchoolSession();const input=schema.parse(await request.json());return NextResponse.json(await withTenant(session.schoolId,tx=>input.action==="save"?saveAcademicEngineConfig(tx,{schoolId:session.schoolId,actorId:session.userId,timetable:input.timetable,assessment:input.assessment,reportCard:input.reportCard}):generateBalancedTimetable(tx,{schoolId:session.schoolId,actorId:session.userId,replaceExisting:input.replaceExisting,classIds:input.classIds})));}catch(e){return routeError(e);}}
