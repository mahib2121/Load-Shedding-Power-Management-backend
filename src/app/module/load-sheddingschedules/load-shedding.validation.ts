import z from "zod";

const CreateScheduleZodSchema = z.object({
  name: z
    .string()
    .min(3, "Schedule name must be at least 3 characters")
    .max(100, "Schedule name must not exceed 100 characters"),

  date: z.coerce.date(),

  expectedDemandMW: z
    .number()
    .positive("Expected demand must be greater than 0"),

  availableSupplyMW: z
    .number()
    .nonnegative("Available supply cannot be negative"),

  zoneId: z.string().uuid("Invalid zone ID"),
});
const CreateScheduleSlotZodSchema = z.object({
  feederId: z.string().uuid("Invalid feeder ID"),

  startTime: z.coerce.date(),

  endTime: z.coerce.date(),

  durationHours: z
    .number()
    .int()
    .min(1, "Duration must be at least 1 hour")
    .max(2, "Duration cannot exceed 2 hours"),

  plannedLoadReductionMW: z
    .number()
    .positive("Planned load reduction must be greater than 0"),
});

const ScheduleIdParamsSchema = z.object({
  scheduleId: z.string().uuid("Invalid schedule ID"),
});
export const LoadSheddingValidation = {
  CreateScheduleZodSchema,
  CreateScheduleSlotZodSchema,
  ScheduleIdParamsSchema,
};
