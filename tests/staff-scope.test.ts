import {it,expect} from "vitest";
import {withTenant} from "../src/lib/db";
import {createTenantFixture} from "./helpers";
import {staffUserWhere} from "../src/lib/staff-scope";
it("includes legacy null-key staff roles and excludes family-only roles",async()=>{
 const fixture=await createTenantFixture();
 await withTenant(fixture.schoolId,async tx=>{
  expect(await tx.user.count({where:{...staffUserWhere,id:fixture.ownerId}})).toBe(1);
  const parent=await tx.role.create({data:{schoolId:fixture.schoolId,name:"Guardian",key:"guardian"}});
  const user=await tx.user.create({data:{schoolId:fixture.schoolId,name:"Family",passwordHash:"test-only"}});
  await tx.userRole.create({data:{schoolId:fixture.schoolId,userId:user.id,roleId:parent.id}});
  expect(await tx.user.count({where:{...staffUserWhere,id:user.id}})).toBe(0);
  await tx.userRole.create({data:{schoolId:fixture.schoolId,userId:user.id,roleId:fixture.testRoleId}});
  expect(await tx.user.count({where:{...staffUserWhere,id:user.id}})).toBe(1);
 });
});
