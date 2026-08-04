-- AlterTable
ALTER TABLE `leads` ADD COLUMN `agent_id` CHAR(36) NULL,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `site` VARCHAR(512) NULL;
