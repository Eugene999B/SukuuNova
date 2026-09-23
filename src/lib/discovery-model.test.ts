import {describe,it,expect} from "vitest";
import {marketResult,energyResult,normalizeProjects} from "./discovery-model";
describe("Discovery simulations",()=>{
 it("charges for all stock and counts unsold perishables",()=>{const r=marketResult({stock:50,price:6},0);expect(r.sold).toBe(33);expect(r.unsold).toBe(17);expect(r.profit).toBe(36);expect(r.revenue-r.cost).toBe(r.profit);});
 it("higher prices can reduce profit",()=>{expect(marketResult({stock:50,price:15},0).profit).toBeLessThan(marketResult({stock:50,price:6},0).profit);});
 it("battery capacity cannot create energy",()=>{const r=energyResult({solar:0,batteries:8,clinic:true,homes:true,library:true});expect(r.stored).toBe(0);expect(r.shortfall).toBe(56);expect(r.success).toBe(false);});
 it("offers a feasible sunny budget plan, with a cloudy tradeoff",()=>{const p={solar:5,batteries:3,clinic:true,homes:true,library:true};expect(energyResult(p).success).toBe(true);expect(energyResult(p,true).success).toBe(false);});
 it("rejects corrupt saved project data",()=>{expect(normalizeProjects([{},null,{id:3}])).toEqual([]);});
});
