-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "role" AS ENUM ('owner', 'doctor', 'front_desk');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('active', 'deactivated');

-- CreateEnum
CREATE TYPE "organisation_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('user', 'system', 'operator');

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenge" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "replaced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "previous_refresh_token_hash" TEXT,
    "rotated_at" TIMESTAMPTZ(6),
    "active_organisation_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_event" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "user_id" UUID,
    "phone_hash" TEXT,
    "ip_hash" TEXT,
    "organisation_id" UUID,
    "actor_type" "actor_type" NOT NULL DEFAULT 'user',
    "actor_id" UUID,
    "request_id" TEXT,

    CONSTRAINT "security_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "organisation_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "roles" "role"[],
    "status" "membership_status" NOT NULL DEFAULT 'active',
    "deactivated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisation_id" UUID NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_ids" UUID[],
    "request_id" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id","created_at")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_phone_key" ON "app_user"("phone");

-- CreateIndex
CREATE INDEX "otp_challenge_user_id_created_at_idx" ON "otp_challenge"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_refresh_token_hash_key" ON "session"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_family_id_idx" ON "session"("family_id");

-- CreateIndex
CREATE INDEX "session_previous_refresh_token_hash_idx" ON "session"("previous_refresh_token_hash");

-- CreateIndex
CREATE INDEX "security_event_user_id_created_at_idx" ON "security_event"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "security_event_phone_hash_created_at_idx" ON "security_event"("phone_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "location_organisation_id_id_key" ON "location"("organisation_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "location_organisation_id_name_key" ON "location"("organisation_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "department_organisation_id_id_key" ON "department"("organisation_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "department_location_id_name_key" ON "department"("location_id", "name");

-- CreateIndex
CREATE INDEX "membership_user_id_idx" ON "membership"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_organisation_id_id_key" ON "membership"("organisation_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_organisation_id_user_id_key" ON "membership"("organisation_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_log_organisation_id_created_at_idx" ON "audit_log"("organisation_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_organisation_id_entity_type_created_at_idx" ON "audit_log"("organisation_id", "entity_type", "created_at");

-- AddForeignKey
ALTER TABLE "otp_challenge" ADD CONSTRAINT "otp_challenge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_organisation_id_location_id_fkey" FOREIGN KEY ("organisation_id", "location_id") REFERENCES "location"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

