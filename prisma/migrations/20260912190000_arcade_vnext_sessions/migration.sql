-- Arcade vNext is additive. Legacy "ArcadeRound" remains the live production path.

CREATE TABLE "ArcadeGameSession" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "game" TEXT NOT NULL,
  "gameSchema" TEXT NOT NULL,
  "ageBand" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "publicMission" JSONB NOT NULL,
  "privateMission" JSONB NOT NULL,
  "currentState" JSONB NOT NULL,
  "skillTargets" JSONB NOT NULL DEFAULT '[]',
  "currentSequence" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ArcadeGameSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArcadeGameSession_status_check" CHECK ("status" IN ('active','completed','abandoned')),
  CONSTRAINT "ArcadeGameSession_sequence_check" CHECK ("currentSequence" >= 0)
);

CREATE TABLE "ArcadeGameEvent" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "clientSequence" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArcadeGameEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArcadeGameEvent_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "ArcadeGameEvent_client_sequence_check" CHECK ("clientSequence" >= 0),
  CONSTRAINT "ArcadeGameEvent_kind_check" CHECK ("kind" IN ('action','artifact','finish'))
);

CREATE TABLE "ArcadeGameSnapshot" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "gameSchema" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArcadeGameSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArcadeGameSnapshot_sequence_check" CHECK ("sequence" >= 0)
);

CREATE TABLE "ArcadeGameArtifact" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "artifactType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArcadeGameArtifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArcadeGameArtifact_sequence_check" CHECK ("sequence" > 0)
);

CREATE TABLE "ArcadeGameAssessment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "gameSchema" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "summary" JSONB NOT NULL,
  "rewards" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArcadeGameAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArcadeGameSession_id_schoolId_key" ON "ArcadeGameSession"("id", "schoolId");
CREATE INDEX "ArcadeGameSession_school_student_status_idx" ON "ArcadeGameSession"("schoolId", "studentId", "status", "lastActiveAt");
CREATE INDEX "ArcadeGameSession_school_game_schema_idx" ON "ArcadeGameSession"("schoolId", "game", "gameSchema", "status");

CREATE UNIQUE INDEX "ArcadeGameEvent_id_schoolId_key" ON "ArcadeGameEvent"("id", "schoolId");
CREATE UNIQUE INDEX "ArcadeGameEvent_session_sequence_key" ON "ArcadeGameEvent"("sessionId", "sequence");
CREATE UNIQUE INDEX "ArcadeGameEvent_session_idempotency_key" ON "ArcadeGameEvent"("sessionId", "idempotencyKey");
CREATE INDEX "ArcadeGameEvent_school_session_created_idx" ON "ArcadeGameEvent"("schoolId", "sessionId", "createdAt");

CREATE UNIQUE INDEX "ArcadeGameSnapshot_id_schoolId_key" ON "ArcadeGameSnapshot"("id", "schoolId");
CREATE UNIQUE INDEX "ArcadeGameSnapshot_session_sequence_key" ON "ArcadeGameSnapshot"("sessionId", "sequence");
CREATE INDEX "ArcadeGameSnapshot_school_session_idx" ON "ArcadeGameSnapshot"("schoolId", "sessionId", "sequence");

CREATE UNIQUE INDEX "ArcadeGameArtifact_id_schoolId_key" ON "ArcadeGameArtifact"("id", "schoolId");
CREATE UNIQUE INDEX "ArcadeGameArtifact_session_sequence_key" ON "ArcadeGameArtifact"("sessionId", "sequence");
CREATE INDEX "ArcadeGameArtifact_school_session_idx" ON "ArcadeGameArtifact"("schoolId", "sessionId", "createdAt");

CREATE UNIQUE INDEX "ArcadeGameAssessment_id_schoolId_key" ON "ArcadeGameAssessment"("id", "schoolId");
CREATE UNIQUE INDEX "ArcadeGameAssessment_session_key" ON "ArcadeGameAssessment"("sessionId");
CREATE INDEX "ArcadeGameAssessment_school_session_idx" ON "ArcadeGameAssessment"("schoolId", "sessionId");

ALTER TABLE "ArcadeGameSession"
  ADD CONSTRAINT "ArcadeGameSession_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ArcadeGameSession_studentId_schoolId_fkey" FOREIGN KEY ("studentId", "schoolId") REFERENCES "Student"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArcadeGameEvent"
  ADD CONSTRAINT "ArcadeGameEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ArcadeGameEvent_sessionId_schoolId_fkey" FOREIGN KEY ("sessionId", "schoolId") REFERENCES "ArcadeGameSession"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArcadeGameSnapshot"
  ADD CONSTRAINT "ArcadeGameSnapshot_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ArcadeGameSnapshot_sessionId_schoolId_fkey" FOREIGN KEY ("sessionId", "schoolId") REFERENCES "ArcadeGameSession"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArcadeGameArtifact"
  ADD CONSTRAINT "ArcadeGameArtifact_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ArcadeGameArtifact_sessionId_schoolId_fkey" FOREIGN KEY ("sessionId", "schoolId") REFERENCES "ArcadeGameSession"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArcadeGameAssessment"
  ADD CONSTRAINT "ArcadeGameAssessment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ArcadeGameAssessment_sessionId_schoolId_fkey" FOREIGN KEY ("sessionId", "schoolId") REFERENCES "ArcadeGameSession"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArcadeGameSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArcadeGameSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "arcade_vnext_session_tenant" ON "ArcadeGameSession"
  USING ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''))
  WITH CHECK ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''));

ALTER TABLE "ArcadeGameEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArcadeGameEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "arcade_vnext_event_tenant" ON "ArcadeGameEvent"
  USING ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''))
  WITH CHECK ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''));

ALTER TABLE "ArcadeGameSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArcadeGameSnapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "arcade_vnext_snapshot_tenant" ON "ArcadeGameSnapshot"
  USING ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''))
  WITH CHECK ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''));

ALTER TABLE "ArcadeGameArtifact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArcadeGameArtifact" FORCE ROW LEVEL SECURITY;
CREATE POLICY "arcade_vnext_artifact_tenant" ON "ArcadeGameArtifact"
  USING ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''))
  WITH CHECK ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''));

ALTER TABLE "ArcadeGameAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArcadeGameAssessment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "arcade_vnext_assessment_tenant" ON "ArcadeGameAssessment"
  USING ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''))
  WITH CHECK ("schoolId"=NULLIF(current_setting('app.current_school_id',true),''));
