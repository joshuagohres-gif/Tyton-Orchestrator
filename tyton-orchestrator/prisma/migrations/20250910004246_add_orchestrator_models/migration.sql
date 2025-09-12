-- CreateTable
CREATE TABLE "OrchestratorRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StageRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orchestratorId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "StageRun_orchestratorId_fkey" FOREIGN KEY ("orchestratorId") REFERENCES "OrchestratorRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewGate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orchestratorId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewGate_orchestratorId_fkey" FOREIGN KEY ("orchestratorId") REFERENCES "OrchestratorRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
