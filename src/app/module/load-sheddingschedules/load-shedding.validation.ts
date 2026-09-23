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

export const LoadSheddingValidation = {
  CreateScheduleZodSchema,
};
