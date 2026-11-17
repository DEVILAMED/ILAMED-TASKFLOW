ALTER TABLE "Task" ADD COLUMN "startDate" DATE;

-- Older tasks may have only an end date. Once a start date is set, a matching
-- end date is required and the range must run forward, including same-day work.
ALTER TABLE "Task" ADD CONSTRAINT "Task_date_range_check"
CHECK ("startDate" IS NULL OR ("dueDate" IS NOT NULL AND "startDate" <= "dueDate"::date));
