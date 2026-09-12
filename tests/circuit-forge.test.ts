import { describe, expect, it } from "vitest";
import { createCircuitForgeQuestions } from "../src/lib/circuit-forge-content";
import { circuitForgeChargeGain, circuitForgeComboGain, circuitForgeFaultDamage, circuitForgeFuseRecovery, circuitForgeScanRecovery, circuitForgeStabilityGain, circuitForgeWindowMs } from "../src/lib/circuit-forge";

describe("Circuit Forge controlled electricity content",()=>{
 it("creates secure gradable microgrid missions",()=>{const questions=createCircuitForgeQuestions(5,40);expect(questions).toHaveLength(40);for(const question of questions){expect(question.kind).toBe("path");expect(question.options).toHaveLength(4);expect(new Set(question.options).size).toBe(4);expect(question.options).toContain(question.answer);expect(question.conceptKey.startsWith("circuit-forge:")).toBe(true);expect(question.scene.boardTitle).toBe("Circuit Forge");expect(question.scene.circuitTags.length).toBeGreaterThan(0);expect(question.scene.faultLevel).toBeGreaterThanOrEqual(1);expect(question.scene.faultLevel).toBeLessThanOrEqual(5);}});
 it("keeps foundational play to paths, components and safety",()=>{const modes=new Set(createCircuitForgeQuestions(1,30).map((question)=>question.scene.mission));expect([...modes].every((mode)=>["path","component","safety"].includes(mode))).toBe(true);});
 it("unlocks circuit analysis, measurement, faults and load maths",()=>{const modes=new Set(createCircuitForgeQuestions(5,80).map((question)=>question.scene.mission));for(const mode of ["series","parallel","fault","measure","load"])expect(modes.has(mode as never)).toBe(true);});
});

describe("Circuit Forge mechanics",()=>{
 it("gives supported learners more switching time within bounds",()=>{expect(circuitForgeWindowMs(4,1.2,"guided")).toBeGreaterThan(circuitForgeWindowMs(4,1.2,"challenge"));expect(circuitForgeWindowMs(99,99,"challenge")).toBeGreaterThanOrEqual(8500);expect(circuitForgeWindowMs(-5,.01,"guided")).toBeLessThanOrEqual(26000);});
 it("bounds fault damage and grid scan recovery",()=>{expect(circuitForgeFaultDamage(20,1,false)).toBe(0);expect(circuitForgeFaultDamage(100,99,true)).toBeLessThanOrEqual(11);expect(circuitForgeScanRecovery(90,0)).toBe(75);expect(circuitForgeScanRecovery(20,2)).toBe(0);});
 it("rewards efficient routing and keeps protection recovery bounded",()=>{expect(circuitForgeStabilityGain(20,5)).toBeGreaterThan(circuitForgeStabilityGain(90,1));expect(circuitForgeChargeGain(5,20)).toBeLessThanOrEqual(7);expect(circuitForgeComboGain(20)).toBe(2);expect(circuitForgeComboGain(90)).toBe(0);expect(circuitForgeFuseRecovery(97)).toBe(100);});
});
