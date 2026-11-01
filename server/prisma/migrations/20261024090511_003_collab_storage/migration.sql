-- CreateTable
CREATE TABLE "DocumentSnapshot" (
    "documentId" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSnapshot_pkey" PRIMARY KEY ("documentId")
);

-- CreateTable
CREATE TABLE "DocumentUpdate" (
    "id" SERIAL NOT NULL,
    "documentId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentUpdate_documentId_id_idx" ON "DocumentUpdate"("documentId", "id");

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUpdate" ADD CONSTRAINT "DocumentUpdate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
