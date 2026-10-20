-- AlterTable
ALTER TABLE "events" ADD COLUMN     "excluded_dates" TEXT[] DEFAULT ARRAY[]::TEXT[];
