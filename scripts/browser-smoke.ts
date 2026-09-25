import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
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
    // Reports must remain downloadable while exam marks are pending.
    await withTenant(f.schoolId, async tx => {
      const template=await tx.reportCardTemplate.create({data:{schoolId:f.schoolId,name:"Browser report",layoutConfig:{}}});
      await tx.schoolSettings.update({where:{schoolId:f.schoolId},data:{reportCardTemplateId:template.id,allowPartialReportCards:false}});
      const teacherRole=await tx.role.create({data:{schoolId:f.schoolId,name:"Subject Teacher",key:"subject_teacher"}});
      await tx.userRole.create({data:{schoolId:f.schoolId,userId:f.memberId,roleId:teacherRole.id}});
      const subject=await tx.subject.create({data:{schoolId:f.schoolId,name:"Mathematics"}});
      await tx.classSubjectTeacher.create({data:{schoolId:f.schoolId,classId:placement.classId,subjectId:subject.id,teacherId:f.memberId}});
      const ca=await tx.assessment.create({data:{schoolId:f.schoolId,classId:placement.classId,termId:setup.term.id,subjectId:subject.id,name:"Class work",type:"ca",weight:30,maxScore:100}});
      await tx.assessment.create({data:{schoolId:f.schoolId,classId:placement.classId,termId:setup.term.id,subjectId:subject.id,name:"Exam",type:"exam",weight:70,maxScore:100}});
      await tx.score.create({data:{schoolId:f.schoolId,studentId:student.id,subjectId:subject.id,assessmentId:ca.id,value:80,enteredBy:f.memberId}});
    });
    const generated=await context.request.post("/api/school/report-cards/generate-batch",{data:{termId:setup.term.id,classId:placement.classId}});
    assert.equal(generated.status(),200,await generated.text());
    const generatedBody=await generated.json();
    assert.equal(generatedBody.generated,1,JSON.stringify(generatedBody));
    const learnerReport=await withTenant(f.schoolId,tx=>tx.reportCard.findFirstOrThrow({where:{studentId:student.id,termId:setup.term.id}}));
    for(let attempt=0;attempt<2;attempt++){
      const download=await context.request.get("/api/mvp/report-cards/"+learnerReport.id+"/pdf");
      assert.equal(download.status(),200,"Repeated PDF download must succeed");
      assert.match(download.headers()["content-type"],/application\/pdf/);
      const document=await PDFDocument.load(await download.body());
      assert.ok(document.getPageCount()>=1);
      assert.ok(document.getTitle()?.includes("Ɛsi Ɔpoku"),"Unicode learner identity must survive PDF rendering");
    }
    await page.goto("/school/report-cards?year="+setup.year.id+"&term="+setup.term.id+"&classId="+placement.classId);
    await page.getByRole("button",{name:"Open class reports",exact:true}).waitFor();
    await page.getByRole("link",{name:"Download PDF",exact:true}).first().waitFor();
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"Mobile report list overflows");
    await page.goto("/school/report-cards/"+learnerReport.id+"/print");
    await page.getByText("Pending",{exact:true}).first().waitFor();

    // Authenticated academic workflow and account boundaries (isolated CI only).
    const boundary = await withTenant(f.schoolId, async tx => {
      await tx.user.update({where:{id:f.memberId},data:{passwordHash:await hash(password,4)}});
      await tx.class.update({where:{id:placement.classId},data:{classTeacherId:f.memberId}});
      const role=await tx.role.findFirstOrThrow({where:{schoolId:f.schoolId,key:"subject_teacher"}});
      for(const permission of ["report_cards:view","report_cards:submit","report_cards:approve"]) {
        await tx.rolePermission.create({data:{schoolId:f.schoolId,roleId:role.id,permissionId:f.permissionIds.get(permission)!}});
      }
      const exam=await tx.assessment.findFirstOrThrow({where:{schoolId:f.schoolId,termId:setup.term.id,type:"exam"}});
      await tx.score.create({data:{schoolId:f.schoolId,studentId:student.id,subjectId:exam.subjectId,assessmentId:exam.id,value:80,enteredBy:f.memberId}});
      const parent=await tx.user.create({data:{schoolId:f.schoolId,name:"Linked parent",email:"parent-"+f.uniqueCode+"@test.invalid",passwordHash:await hash(password,4)}});
      const parentRole=await tx.role.create({data:{schoolId:f.schoolId,name:"Parent",key:"parent"}});
      for(const permission of ["report_cards:view","parents:read_linked"]) await tx.rolePermission.create({data:{schoolId:f.schoolId,roleId:parentRole.id,permissionId:f.permissionIds.get(permission)!}});
      await tx.userRole.create({data:{schoolId:f.schoolId,userId:parent.id,roleId:parentRole.id}});
      const guardian=await tx.guardian.create({data:{schoolId:f.schoolId,userId:parent.id,name:"Linked parent"}});
      await tx.studentGuardian.create({data:{schoolId:f.schoolId,studentId:student.id,guardianId:guardian.id,relationship:"parent"}});
      await tx.term.create({data:{schoolId:f.schoolId,academicYearId:setup.year.id,name:"Term 2",startDate:new Date("2027-01-01"),endDate:new Date("2027-04-01")}});
      const finalTerm=await tx.term.create({data:{schoolId:f.schoolId,academicYearId:setup.year.id,name:"Term 3",startDate:new Date("2027-04-02"),endDate:new Date("2027-07-31")}});
      const finalReport=await tx.reportCard.create({data:{schoolId:f.schoolId,studentId:student.id,termId:finalTerm.id,calculationSnapshot:{classId:placement.classId}}});
      return {parentEmail:parent.email!,finalReportId:finalReport.id};
    });
    const teacherContext=await browser.newContext({baseURL});
    const parentContext=await browser.newContext({baseURL});
    const foreignContext=await browser.newContext({baseURL});
    const anonymousContext=await browser.newContext({baseURL});
    try {
      assert.equal((await teacherContext.request.post("/api/auth/school/login",{data:{uniqueCode:f.uniqueCode,identifier:f.memberId+"@test.invalid",password}})).status(),200);
      assert.equal((await parentContext.request.post("/api/auth/guardian/login",{data:{schoolCode:f.uniqueCode,identifier:boundary.parentEmail,password}})).status(),200);
      const pdfPath="/api/mvp/report-cards/"+learnerReport.id+"/pdf";
      assert.ok([401,403].includes((await anonymousContext.request.get(pdfPath)).status()),"Anonymous PDF access must be denied");
      assert.equal((await parentContext.request.get(pdfPath)).status(),403,"Parents must not read a draft report");
      assert.equal((await context.request.post("/api/mvp/report-cards",{data:{action:"submit",reportCardId:learnerReport.id}})).status(),403,"An owner who is not the class teacher cannot submit");
      const finalSubmission=await teacherContext.request.post("/api/mvp/report-cards",{data:{action:"submit",reportCardId:boundary.finalReportId}});
      assert.equal(finalSubmission.status(),409,"Final-term API submission must require a promotion recommendation");
      const submitted=await teacherContext.request.post("/api/mvp/report-cards",{data:{action:"submit",reportCardId:learnerReport.id}});
      assert.equal(submitted.status(),200,await submitted.text());
      assert.equal((await teacherContext.request.post("/api/mvp/report-cards",{data:{action:"approve",reportCardId:learnerReport.id}})).status(),403,"A teacher cannot approve their own submission");
      const approved=await context.request.post("/api/mvp/report-cards",{data:{action:"approve",reportCardId:learnerReport.id,headRemark:"Continue your steady progress."}});
      assert.equal(approved.status(),200,await approved.text());
      assert.equal((await parentContext.request.get(pdfPath)).status(),200,"Linked parent can download the approved report");
      const parentReports=await parentContext.request.get("/api/mvp/report-cards");
      assert.equal(parentReports.status(),401,"Guardian sessions cannot enter the staff report-list API");
      assert.equal((await parentContext.request.get("/api/mvp/report-cards/"+boundary.finalReportId+"/pdf")).status(),403,"Final-term drafts remain private to school staff");
      const deniedRegeneration=await context.request.post("/api/mvp/report-cards",{data:{action:"generate",studentId:student.id,termId:setup.term.id}});
      assert.equal(deniedRegeneration.status(),409,"Approved reports cannot be regenerated");
      const release=await context.request.post("/api/mvp/report-cards",{data:{action:"send",reportCardId:learnerReport.id}});
      assert.equal(release.status(),409,"Unconfigured family delivery must fail clearly");
      assert.equal((await withTenant(f.schoolId,tx=>tx.reportCard.findUniqueOrThrow({where:{id:learnerReport.id}}))).status,"approved","A failed release must preserve approved status");
      const other=await createTenantFixture();
      // Set only this isolated fixture's login credential.
      const foreignHash=await hash(password,4);
      await withTenant(other.schoolId,tx=>tx.user.update({where:{id:other.ownerId},data:{passwordHash:foreignHash}}));
      assert.equal((await foreignContext.request.post("/api/auth/school/login",{data:{uniqueCode:other.uniqueCode,identifier:other.ownerId+"@test.invalid",password}})).status(),200);
      assert.equal((await foreignContext.request.get(pdfPath)).status(),404,"Another school cannot access a guessed report ID");
      const unauthorizedParent=await parentContext.request.post("/api/mvp/report-cards",{data:{action:"approve",reportCardId:boundary.finalReportId}});
      assert.equal(unauthorizedParent.status(),401,"Guardian sessions cannot enter staff approval actions");
    } finally {
      await teacherContext.close();await parentContext.close();await foreignContext.close();await anonymousContext.close();
    }
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
    await page.getByRole("button",{name:"Close audio settings",exact:true}).click();

    await page.goto("/learn/explore?entry=exam");
    await page.getByRole("heading",{name:"Your exam",exact:true}).waitFor();
    assert.equal(await page.getByText("0% accuracy",{exact:true}).count(),0,"Learning setup must not show a fake accuracy dashboard");
    assert.equal(await page.getByText("answer streak",{exact:true}).count(),0,"Learning setup must not show an empty streak dashboard");
    assert.ok(await page.locator("body").evaluate(body=>body.scrollHeight<=window.innerHeight+1),"Learning setup must own one mobile viewport instead of creating a long page");
    await page.getByRole("button",{name:/BECE/}).click();
    await page.getByRole("button",{name:"BECE practice",exact:true}).click();
    await page.getByRole("button",{name:/Mathematics/}).first().click();
    assert.equal(await page.getByRole("button",{name:"Mixed topics",exact:true}).isDisabled(),false,"Published exam subjects must have working practice");
    await page.getByRole("button",{name:"Mixed topics",exact:true}).click();
    await page.getByRole("button",{name:"Against the clock",exact:true}).click();
    await page.getByRole("button",{name:"5",exact:true}).click();
    await page.getByRole("button",{name:"Start",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector("main[data-session-active=\"true\"]"));
    await page.getByTestId("learning-question").waitFor();
    assert.equal(await page.getByRole("button",{name:"Exit session",exact:true}).isVisible(),true,"Exam practice must launch instead of ending in a coming-soon state");
    await page.getByTestId("practice-timer").waitFor();

    await page.goto("/learn/explore?entry=basic");
    await page.getByRole("heading",{name:"Your class / level",exact:true}).waitFor();
    assert.equal(await page.getByRole("heading",{name:"Your school pathway",exact:true}).count(),0,"Basic School must skip the SHS/pathway screen");
    await page.getByRole("button",{name:"Basic 4",exact:true}).click();
    await page.getByRole("button",{name:/Mathematics/}).first().click();
    await page.getByRole("button",{name:/Shape, angles & spatial reasoning/}).click();
    await page.getByRole("button",{name:"5",exact:true}).click();
    await page.getByRole("button",{name:"Start",exact:true}).click();
    await page.getByTestId("learning-question").waitFor();
    assert.equal(await page.getByTestId("question-diagram").count(),1,"Basic 4 geometry must render an actual diagram stimulus");
    assert.ok(await page.getByTestId("question-diagram").locator("svg").count(),"Geometry stimulus must contain a rendered SVG diagram");

    await page.goto("/learn/explore?entry=basic");
    await page.getByRole("button",{name:"Basic 5",exact:true}).click();
    await page.getByRole("button",{name:/English Language/}).first().click();
    await page.getByRole("button",{name:/Reading inference & comprehension/}).click();
    await page.getByRole("button",{name:"5",exact:true}).click();
    await page.getByRole("button",{name:"Start",exact:true}).click();
    await page.getByTestId("learning-question").waitFor();
    assert.equal(await page.getByTestId("question-passage").count(),1,"English reading practice must render a passage stimulus");
    assert.ok((await page.getByTestId("question-passage").innerText()).length>120,"Reading comprehension must use a substantive passage, not a one-line cue");

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
    let verifiedMobileAnswerLayout=false;
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
          const labels=await choices.allTextContents();
          const isBooleanPair=labels.length===2&&labels.includes("True")&&labels.includes("False");
          if(!isBooleanPair){
            const firstBox=await choices.nth(0).boundingBox();
            const secondBox=await choices.nth(1).boundingBox();
            if(firstBox&&secondBox){
              assert.ok(secondBox.y>=firstBox.y+firstBox.height-1,"Mobile single and multi-select answer choices must stack vertically");
              verifiedMobileAnswerLayout=true;
            }
          }
        }
        await choices.first().click();
      } else {
        const answerInput=player.getByLabel("Your answer");
        await answerInput.waitFor();
        const inputBox=await answerInput.boundingBox();
        const playerBox=await player.boundingBox();
        assert.ok(inputBox&&playerBox&&inputBox.width<=playerBox.width+1,"Constructed-response input must stay inside the mobile question card");
        assert.ok(inputBox.height>=48,"Constructed-response input must remain a usable mobile touch target");
        verifiedMobileAnswerLayout=true;
        await answerInput.fill("0");
      }
      await checkButton.click();
      const feedback=player.getByRole("status");
      await feedback.waitFor();
      const feedbackText=await feedback.innerText();
      const expectedCue=feedbackText.includes("Yes!")?"correct":"retry";
      await page.waitForFunction(
        (cue)=>document.querySelector("[data-audio-root]")?.getAttribute("data-last-cue")===cue,
        expectedCue,
      );
      await player.getByRole("button",{name:question===4?"View results":"Next question",exact:true}).click();
    }
    await page.getByText("SESSION COMPLETE",{exact:true}).waitFor();
    assert.equal(prompts.size,5,"SHS session must not repeat a question");
    assert.equal(verifiedMobileAnswerLayout,true,"Browser smoke must verify at least one valid mobile answer layout");
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
    const recoveryPrompt=await page.getByTestId("learning-question").locator("h3").innerText();
    await page.reload();
    await page.getByRole("button",{name:"Resume practice",exact:true}).click();
    assert.equal(await page.getByTestId("learning-question").locator("h3").innerText(),recoveryPrompt,"Reload must restore the same question");
    assert.equal(await page.getByRole("button",{name:"Exit session",exact:true}).isVisible(),true,"Medicine practice must launch a focused session");
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"University session overflows at mobile width");

    await page.setViewportSize({width:1366,height:768});
    await page.goto("/learn/explore?entry=university");
    await page.getByRole("heading",{name:"Your programme",exact:true}).waitFor();
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"Learning explorer overflows on desktop");
    const desktopCards=page.locator('button').filter({hasText:"Computer Science"});
    assert.ok(await desktopCards.count()>0,"Desktop programme cards must remain available after mobile redesign");

    // Public discovery: decisions affect outcomes, evidence produces a saved project,
    // and spaced review survives a page reload.
    await page.setViewportSize({width:1366,height:768});
    await page.goto("/");
    const loginColors=await page.getByRole("link",{name:"School login",exact:true}).evaluate(el=>({text:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
    assert.notEqual(loginColors.text,loginColors.background,"School login text must remain visible against its button");
    await page.getByRole("heading",{name:"What brings you here today?"}).waitFor();
    const homeChoices=page.getByRole("navigation",{name:"Choose your next step"}).getByRole("link");
    assert.equal(await homeChoices.count(),4);
    for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:375,height:667}]){
      await page.setViewportSize(viewport);
      assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"Homepage overflows horizontally");
      assert.ok(await page.locator("body").evaluate(body=>body.scrollHeight<=window.innerHeight+2),"Homepage should fit the standard viewport");
      for(const choice of await homeChoices.all()){
        const box=await choice.boundingBox();
        assert.ok(box && box.y>=0 && box.y+box.height<=viewport.height,"Every starting choice must be visible without scrolling");
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("link",{name:"Talk to us Message, WhatsApp, call or email."}).click();
    await page.waitForURL("**/contact");
    assert.equal(await page.locator('a[href="https://wa.me/233559529261"]').count(),1);
    assert.equal(await page.locator('a[href="mailto:sukuunova@gmail.com"]').count(),1);
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"Homepage overflows on mobile");
    const inquiryResponse=await context.request.post("/api/public/inquiries",{data:{name:"Browser Test",email:"test@example.com",subject:"CI contact flow",message:"Automated test in the isolated CI database."}});
    assert.equal(inquiryResponse.status(),201);
    assert.equal(typeof (await inquiryResponse.json()).reference,"string");
    const blankInquiry=await context.request.post("/api/public/inquiries",{data:{name:"  ",email:"test@example.com",message:"     "}});
    assert.equal(blankInquiry.status(),400,"Whitespace-only inquiries must be rejected");
    // Robot Rescue: real simulation, pause, completion and durable unlocks.
    await page.goto("/play");
    const gameColors=await page.locator(".rr-wordmark strong,.rr-mode-options strong").evaluateAll(nodes=>nodes.map(node=>({
      foreground:getComputedStyle(node).color,
      background:getComputedStyle(document.querySelector(".rr-shell")!).backgroundColor,
    })));
    const gameLuminance=(color:string)=>{
      const channels=(color.match(/[0-9.]+/g)||[]).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
      return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
    };
    const gameContrast=gameColors.map(({foreground,background})=>{
      const fg=gameLuminance(foreground),bg=gameLuminance(background);
      return(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
    });
    assert.equal(gameContrast.length,3);
    assert.ok(gameContrast.every(ratio=>ratio>=4.5),"Game labels must remain readable despite shared site typography");
    await page.getByRole("button",{name:"Start rescue",exact:true}).click();
    await page.getByRole("button",{name:/Launch pod/}).click();
    await page.getByTestId("rescue-status").filter({hasText:"Flight in progress"}).waitFor();
    await page.getByRole("button",{name:"Pause",exact:true}).click();
    await page.getByTestId("rescue-status").filter({hasText:"Flight paused"}).waitFor();
    const pausedClock=await page.getByTestId("rescue-clock").innerText();
    await page.waitForTimeout(300);
    assert.equal(await page.getByTestId("rescue-clock").innerText(),pausedClock,"Pause must freeze physics time");
    await page.getByRole("button",{name:"Resume flight",exact:true}).click();
    await page.getByRole("heading",{name:"Pip is coming home.",exact:true}).waitFor({timeout:15000});
    const rescueResult=page.getByRole("dialog",{name:"Pip is coming home."});
    await rescueResult.getByText("What this flight teaches",{exact:true}).focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),"Next rescue","Result focus must stay within its available actions");
    await page.getByRole("button",{name:"Next rescue",exact:true}).click();
    await page.getByRole("heading",{name:"Higher ground",exact:true}).waitFor();
    await page.reload();
    await page.getByRole("button",{name:"Continue rescue",exact:true}).waitFor();
    await page.getByRole("button",{name:"Open mission map",exact:true}).click();
    assert.equal(await page.getByRole("button").filter({hasText:"Higher ground"}).isEnabled(),true);
    assert.equal(await page.getByRole("button").filter({hasText:"Against the wind"}).isEnabled(),false);
    await page.getByRole("button",{name:"Close dialog",exact:true}).click();
    await page.goto("/explore?activity=market&challenge=0");
    await page.getByLabel("Your prediction").selectOption({label:"I expect a profit."});
    await page.getByRole("button",{name:"Open the stall",exact:true}).click();
    await page.getByTestId("market-result").waitFor();
    await page.getByLabel("What caused your result, and what will you change next time?").fill("I sold my stock. Next I will compare a lower price.");
    await page.getByRole("button",{name:"Save to My projects",exact:true}).click();
    await page.getByRole("button",{name:"My projects",exact:true}).click();
    await page.getByRole("button",{name:/My market experiment/}).click();
    await page.getByLabel("What will you try next?").fill("Try the rainy day.");
    await page.getByRole("button",{name:"Save project",exact:true}).click();
    await page.reload();
    await page.getByRole("button",{name:/My market experiment/}).click();
    assert.equal(await page.getByLabel("What will you try next?").inputValue(),"Try the rainy day.");
    await page.goto("/explore?activity=energy");
    await page.getByRole("button",{name:"Test the energy plan",exact:true}).click();
    await page.getByTestId("energy-result").waitFor();
    await page.goto("/explore?activity=evidence&challenge=0");
    await page.getByRole("button",{name:"Inspect the kitchen pipe for a leak.",exact:true}).click();
    await page.getByRole("button",{name:"Check the evidence",exact:true}).click();
    await page.getByText("Your conclusion follows the evidence.",{exact:true}).waitFor();
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"Discovery overflows on mobile");
    await page.goto("/learn/remember");
    await page.getByRole("button",{name:"Add an idea to remember",exact:true}).click();
    await page.getByLabel("Question or prompt",{exact:true}).fill("What is our review test?");
    await page.getByLabel("Answer to remember",{exact:true}).fill("Recall first, reveal second.");
    await page.getByRole("button",{name:"Save idea",exact:true}).click();
    assert.ok(await page.getByTestId("remember-card").isVisible());
    await page.getByRole("button",{name:"Show the answer",exact:true}).click();
    await page.getByRole("button",{name:"I remembered clearly",exact:true}).click();
    await page.reload();
    assert.ok(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth+1),"Remember overflows on mobile");

    assert.deepEqual(pageErrors, [], "Browser emitted JavaScript errors");
    console.log("Browser smoke passed: login, mobile dashboard, labeled device tabs, Unicode learner import, confirmed enrollment, payroll plan denial desktop learner directory, legacy invoice collection, retry protection, overpayment denial and complete finance totals.");
  } finally { await browser.close(); await rawDb.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
