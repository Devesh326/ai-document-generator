-- CreateTable
CREATE TABLE "Repo" (
    "id" SERIAL NOT NULL,
    "github_repo_id" BIGINT NOT NULL,
    "owner" VARCHAR(255) NOT NULL,
    "repo_name" VARCHAR(255) NOT NULL,
    "installation_id" BIGINT NOT NULL,
    "readme_generated" BOOLEAN NOT NULL DEFAULT false,
    "last_readme_commit" VARCHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadmeGeneration" (
    "id" SERIAL NOT NULL,
    "repo_id" INTEGER NOT NULL,
    "commit_sha" VARCHAR(40) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "pr_number" INTEGER,
    "pr_url" TEXT,
    "type" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ReadmeGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repo_github_repo_id_key" ON "Repo"("github_repo_id");

-- CreateIndex
CREATE INDEX "ReadmeGeneration_repo_id_idx" ON "ReadmeGeneration"("repo_id");

-- AddForeignKey
ALTER TABLE "ReadmeGeneration" ADD CONSTRAINT "ReadmeGeneration_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
