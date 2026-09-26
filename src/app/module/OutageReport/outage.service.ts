import { PaymentStatus, UserRole } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { ICreateOutageReportPayload } from "./outage.interface";

const OUTAGE_SERVICE_FEE = 100;

const createOutageReport = async (
  userId: string,
  payload: ICreateOutageReportPayload,
) => {
  // 1. Find the authenticated customer
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      role: UserRole.CUSTOMER,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      areaId: true,
    },
  });

  if (!user) {
    throw new AppError(404, "Customer not found");
  }

  // 2. Customer must belong to an area
  if (!user.areaId) {
    throw new AppError(
      400,
      "You are not assigned to an area. Please contact the administrator.",
    );
  }

  // 3. Verify the area still exists and is active
  const area = await prisma.area.findFirst({
    where: {
      id: user.areaId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      code: true,
      feederId: true,
    },
  });

  if (!area) {
    throw new AppError(404, "Your assigned area was not found");
  }

  // 4. Prevent duplicate unpaid reports
  const existingPendingReport = await prisma.outageReport.findFirst({
    where: {
      userId: user.id,
      payment: {
        status: PaymentStatus.PENDING,
      },
    },
    include: {
      payment: true,
    },
  });

  if (existingPendingReport) {
    throw new AppError(
      409,
      "You already have an outage report with pending payment",
    );
  }

  // 5. Create report + payment atomically
  const result = await prisma.$transaction(async (tx) => {
    const outageReport = await tx.outageReport.create({
      data: {
        userId: user.id,
        areaId: area.id,
        description: payload.description,
        latitude: payload.latitude,
        longitude: payload.longitude,
      },
    });

    const payment = await tx.payment.create({
      data: {
        amount: OUTAGE_SERVICE_FEE,
        currency: "BDT",
        status: PaymentStatus.PENDING,
        userId: user.id,
        outageReportId: outageReport.id,
      },
    });

    return {
      outageReport,
      payment,
    };
  });

  return {
    report: result.outageReport,
    payment: result.payment,
    area: {
      id: area.id,
      name: area.name,
      code: area.code,
    },
    serviceFee: OUTAGE_SERVICE_FEE,
    currency: "BDT",
  };
};

export const OutageService = {
  createOutageReport,
};
