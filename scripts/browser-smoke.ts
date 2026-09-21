import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { chromium } from "playwright";
import { createTenantFixture, rawDb } from "../tests/helpers";
import { withTenant } from "../src/lib/db";
import { createFeeItem, generateInvoice } from "../src/lib/finance-service";
import { resolveStudentTermClass } from "../src/lib/student-term-context";

async function main() {
  const baseURL = "http://localhost:3000";
  const f = await createTenantFixture();
  const password = randomBytes(24).toString("base64url");
  const setup = await withTenant(f.schoolId, async (tx) => {
    await tx.user.update({ where: { id: f.ownerId }, data: { passwordHash: await hash(password, 4) } });
    await tx.role.update({ where: { id: f.ownerRoleId }, data: { key: "owner", name: "Owner" } });
    const year = await tx.academicYear.create({ data: { schoolId: f.schoolId, name: "2026/27", startDate: new Date("2026-09-01"), endDate: new Date("2027-08-31") } });
    const term = await tx.term.create({ data: { schoolId: f.schoolId, academicYearId: year.id, name: "Term 1", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31") } });
    await tx.class.create({ data: { schoolId: f.schoolId, name: "Basic 1" } });
    return { year, term };
  });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
    const login = await context.request.post("/api/auth/school/login", { data: { uniqueCode: f.uniqueCode, identifier: f.ownerId + "@test.invalid", password } });
    assert.equal(login.status(), 200, "Owner login failed: " + await login.text());
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(`${page.url()}: ${error.message}`));
    await page.goto("/dashboard");
    await page.getByText("Setup completion", { exact: true }).waitFor();
    assert.ok(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth + 1), "Mobile dashboard overflows horizontally");
    await page.goto("/school/devices");
    await page.getByRole("button", { name: "Rules & times", exact: true }).waitFor();
    await page.getByRole("button", { name: "Rules & times", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Rules & times", exact: true }).getAttribute("aria-pressed"), "true");
    const uploaded = await context.request.post("/api/school/import", { multipart: {
      action: "upload", kind: "students",
      file: { name: "browser-learners.csv", mimeType: "text/csv", buffer: Buffer.from("Student Name,Admission No,Class\nƐsi Ɔpoku,BROWSER-001,Basic 1\n") },
    } });
    assert.equal(uploaded.status(), 201, await uploaded.text());
    const { batch } = await uploaded.json();
    const validated = await context.request.post("/api/school/import", { data: { action: "validate", batchId: batch.id, columnMapping: batch.columnMapping } });
    assert.equal(validated.status(), 200, await validated.text());
    const applied = await context.request.post("/api/school/import", { data: { action: "apply", batchId: batch.id, confirmation: "APPLY", intakeAcademicYearId: setup.year.id, placementTermId: setup.term.id } });
    assert.equal(applied.status(), 200, await applied.text());
    const student = await withTenant(f.schoolId, (tx) => tx.student.findFirstOrThrow({ where: { admissionNo: "BROWSER-001" } }));
    const placement = await withTenant(f.schoolId, (tx) => resolveStudentTermClass(tx, { schoolId: f.schoolId, studentId: student.id, termId: setup.term.id }));
    assert.equal(placement.enrollmentStatus, "confirmed");
    assert.equal((await context.request.get("/api/school/payroll-v2")).status(), 403, "Payroll must be unavailable without an entitlement");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/school/students");
    await page.getByText("Ɛsi Ɔpoku", { exact: true }).first().waitFor();
    const legacyInvoice = await withTenant(f.schoolId, async tx => {
      await createFeeItem(tx, { schoolId: f.schoolId, actorId: f.ownerId, termId: setup.term.id, name: "Existing tuition", amount: 500 });
      return generateInvoice(tx, { schoolId: f.schoolId, actorId: f.ownerId, studentId: student.id, termId: setup.term.id });
    });
    assert.ok(legacyInvoice);
    await page.goto("/school/finance/payments");
    await page.getByLabel("Amount received", { exact: true }).waitFor();
    await page.getByLabel("Amount received", { exact: true }).fill("125");
    assert.equal(await page.getByRole("button", { name: "Post payment", exact: true }).isDisabled(), true, "Reference must be required");
    await page.getByLabel("Reference", { exact: true }).fill("BROWSER-LEGACY-001");
    await page.getByRole("button", { name: "Post payment", exact: true }).click();
    await page.getByText("Payment posted and learner balance updated.", { exact: true }).waitFor();
    const paymentInput = { action: "payment.legacy", studentId: student.id, invoiceId: legacyInvoice.id, amount: 125, method: "cash", reference: "BROWSER-LEGACY-001" };
    const retry = await context.request.post("/api/school/finance-v2", { data: paymentInput });
    assert.equal(retry.status(), 200, await retry.text());
    const overpayment = await context.request.post("/api/school/finance-v2", { data: { ...paymentInput, reference: "BROWSER-OVERPAY", amount: 501 } });
    assert.equal(overpayment.status(), 409, "Overpayment must be rejected");
    const wrongLearner = await context.request.post("/api/school/finance-v2", { data: { ...paymentInput, studentId: "wrong-learner" } });
    assert.equal(wrongLearner.status(), 404, "Invoice must belong to the selected learner");
    const snapshot = await (await context.request.get("/api/school/finance-v2")).json();
    const balance = snapshot.invoiceBalances.find((i: { id: string }) => i.id === legacyInvoice.id);
    assert.equal(Number(balance.totalAmount) - Number(balance.paidAmount), 375);
    assert.equal(balance.hasCategoryCharges, false);
    assert.equal(await withTenant(f.schoolId, tx => tx.payment.count({ where: { reference: "BROWSER-LEGACY-001" } })), 1);
    const report = await context.request.get("/api/school/finance-v2/export?format=pdf");
    assert.equal(report.status(), 200, await report.text());
    assert.equal(report.headers()["content-type"], "application/pdf");
    assert.ok((await report.body()).subarray(0,5).toString()==="%PDF-", "Unicode finance PDF must render");
    assert.equal((await context.request.get("/api/school/finance-v2/export?from=2026-02-30")).status(),400);
    await page.goto("/school/finance");
    await page.getByText("GH₵375.00", { exact: true }).waitFor();
    // Public learning journey: mobile navigation, broad paths, default audio and real answers.
    await page.setViewportSize({width:360,height:800});
    await page.goto("/learn");
    await page.getByRole("link",{name:"Start practice",exact:true}).waitFor();
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"Learning home overflows on mobile");
    await page.getByLabel("Learning audio settings").click();
    assert.equal(await page.getByLabel("Interaction sounds",{exact:true}).isChecked(),true,"Interaction sounds must be enabled by default");
    await page.getByRole("button",{name:"Test sound",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector("[data-audio-state]")?.getAttribute("data-audio-state")==="ready");
    await page.getByLabel("Gentle focus music",{exact:true}).check();
    await page.getByLabel("Gentle focus music",{exact:true}).uncheck();
    await page.getByLabel("Learning audio settings").click();

    await page.goto("/learn/explore?entry=exam");
    await page.getByRole("heading",{name:"Your exam",exact:true}).waitFor();
    assert.equal(await page.getByText("0% accuracy",{exact:true}).count(),0,"Learning setup must not show a fake accuracy dashboard");
    assert.equal(await page.getByText("answer streak",{exact:true}).count(),0,"Learning setup must not show an empty streak dashboard");
    assert.ok(await page.locator("body").evaluate(body=>body.scrollHeight<=window.innerHeight+1),"Learning setup must own one mobile viewport instead of creating a long page");
    await page.getByRole("button",{name:/BECE/}).click();
    await page.getByRole("button",{name:"BECE practice",exact:true}).click();
    await page.getByRole("button",{name:/Mathematics/}).first().click();
    assert.equal(await page.getByRole("button",{name:"Mixed topics",exact:true}).isDisabled(),true,"Mapped exam topics must stop before session setup when practice is not ready");

    await page.goto("/learn/explore?entry=basic");
    await page.getByRole("heading",{name:"Your class / level",exact:true}).waitFor();
    assert.equal(await page.getByRole("heading",{name:"Your school pathway",exact:true}).count(),0,"Basic School must skip the SHS/pathway screen");

    await page.goto("/learn/explore?entry=shs");
    await page.getByRole("heading",{name:"Your SHS programme",exact:true}).waitFor();
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"Learning setup overflows at 360px");
    assert.ok(await page.locator("body").evaluate(body=>body.scrollHeight<=window.innerHeight+1),"School setup must stay inside one mobile viewport");
    await page.getByRole("button",{name:/General Science/}).click();
    await page.getByRole("button",{name:"SHS 1",exact:true}).click();
    await page.getByRole("button",{name:/Core Mathematics/}).click();
    await page.getByRole("button",{name:"Mixed topics",exact:true}).click();
    await page.getByRole("button",{name:"5",exact:true}).click();
    await page.getByRole("button",{name:"Start",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector("main[data-session-active=\"true\"]"));
    assert.equal(await page.getByRole("button",{name:"Exit session",exact:true}).isVisible(),true,"Active learning must use the focused session surface");
    assert.equal(await page.locator("main").evaluate(el=>getComputedStyle(el).position),"fixed","Focused session must own the mobile viewport");
    assert.equal(await page.getByTestId("session-tools").evaluate(el=>getComputedStyle(el).position),"sticky","Mobile session controls must stay reachable");
    const prompts=new Set<string>();
    let sawIntelligentMission=false;
    let verifiedOneColumnChoices=false;
    for(let question=0;question<5;question++){
      const player=page.getByTestId("learning-question");
      await player.waitFor();
      prompts.add(await player.locator("h3").innerText());
      await page.getByTestId("question-signals").waitFor();
      if(await page.getByTestId("question-mission").count()) sawIntelligentMission=true;
      assert.equal(await player.getByRole("button",{name:"Check answer",exact:true}).isDisabled(),true,"Blank answers must not be marked");
      const checkButton=player.getByRole("button",{name:"Check answer",exact:true});
      assert.ok((await checkButton.boundingBox())!.height>=48,"Mobile Check answer target must be at least 48px high");
      const choices=player.getByTestId("learning-option");
      if(await choices.count()){
        if((await choices.count())>=2){
          const firstBox=await choices.nth(0).boundingBox();
          const secondBox=await choices.nth(1).boundingBox();
          if(firstBox&&secondBox){
            assert.ok(secondBox.y>=firstBox.y+firstBox.height-1,"Mobile answer choices must stack vertically");
            verifiedOneColumnChoices=true;
          }
        }
        await choices.first().click();
      } else {
        await player.getByLabel("Your answer").fill("0");
      }
      await checkButton.click();
      const feedback=player.getByRole("status");
      await feedback.waitFor();
      const feedbackText=await feedback.innerText();
      const expectedCue=feedbackText.includes("Yes!")?"correct":"retry";
      await page.waitForFunction(
        (cue)=>document.querySelector("[data-audio-control]")?.getAttribute("data-last-cue")===cue,
        expectedCue,
      );
      await player.getByRole("button",{name:question===4?"View results":"Next question",exact:true}).click();
    }
    await page.getByText("SESSION COMPLETE",{exact:true}).waitFor();
    assert.equal(prompts.size,5,"SHS session must not repeat a question");
    assert.equal(verifiedOneColumnChoices,true,"Browser smoke must verify one-column mobile answer layout");
    assert.equal(sawIntelligentMission,true,"SHS session must surface at least one intelligent mission");
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"Learning explorer overflows on mobile");

    await page.goto("/learn/explore?entry=university");
    await page.getByRole("heading",{name:"Your programme",exact:true}).waitFor();
    const programmeSearch=page.getByPlaceholder("Search programmes…");
    await programmeSearch.waitFor();
    await programmeSearch.fill("law");
    await page.getByRole("button",{name:/Law \(LLB\)/}).waitFor();
    await programmeSearch.fill("medicine");
    await page.getByRole("button",{name:/Medicine \(MBChB\)/}).click();
    await page.getByRole("button",{name:"Level 100",exact:true}).click();
    await page.getByRole("button",{name:/Human Anatomy/}).click();
    await page.getByRole("button",{name:"Mixed topics",exact:true}).click();
    await page.getByRole("button",{name:"5",exact:true}).click();
    await page.getByRole("button",{name:"Start",exact:true}).click();
    await page.getByTestId("learning-question").waitFor();
    assert.equal(await page.getByRole("button",{name:"Exit session",exact:true}).isVisible(),true,"Medicine practice must launch a focused session");
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"University session overflows at mobile width");

    await page.setViewportSize({width:1366,height:768});
    await page.goto("/learn/explore?entry=university");
    await page.getByRole("heading",{name:"Your programme",exact:true}).waitFor();
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"Learning explorer overflows on desktop");
    const desktopCards=page.locator('button').filter({hasText:"Computer Science"});
    assert.ok(await desktopCards.count()>0,"Desktop programme cards must remain available after mobile redesign");
    assert.deepEqual(pageErrors, [], "Browser emitted JavaScript errors");
    console.log("Browser smoke passed: login, mobile dashboard, labeled device tabs, Unicode learner import, confirmed enrollment, payroll plan denial desktop learner directory, legacy invoice collection, retry protection, overpayment denial and complete finance totals.");
  } finally { await browser.close(); await rawDb.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
