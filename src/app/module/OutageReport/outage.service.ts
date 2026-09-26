import {
  AssignmentStatus,
  JobType,
  OutageStatus,
  PaymentStatus,
  UserRole,
} from "../../../generated/prisma/enums";
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

const verifyOutage = async (
  outageId: string,
  user: {
    userId: string;
    role: UserRole;
    zoneId?: string | null;
  },
) => {
  const outage = await prisma.outage.findUnique({
    where: {
      id: outageId,
    },
  });

  if (!outage) {
    throw new AppError(404, "Outage not found");
  }

  if (outage.status !== OutageStatus.REPORTED) {
    throw new AppError(
      400,
      `Outage cannot be verified from ${outage.status} status`,
    );
  }

  // Zone Manager can only verify outages inside their zone
  if (user.role === UserRole.ZONE_MANAGER && outage.zoneId !== user.zoneId) {
    throw new AppError(403, "You can only verify outages in your zone");
  }

  const updatedOutage = await prisma.outage.update({
    where: {
      id: outage.id,
    },
    data: {
      status: OutageStatus.VERIFIED,
      verifiedAt: new Date(),
    },
  });

  return updatedOutage;
};

const assignTechnician = async (
  outageId: string,
  technicianId: string,
  notes: string | undefined,
  user: {
    userId: string;
    role: UserRole;
    zoneId?: string | null;
  },
) => {
  const outage = await prisma.outage.findUnique({
    where: {
      id: outageId,
    },
  });

  if (!outage) {
    throw new AppError(404, "Outage not found");
  }

  if (outage.status !== OutageStatus.VERIFIED) {
    throw new AppError(
      400,
      `Technician can only be assigned to a VERIFIED outage. Current status: ${outage.status}`,
    );
  }

  // Zone Manager can only assign technicians
  // to outages inside their own zone
  if (user.role === UserRole.ZONE_MANAGER && outage.zoneId !== user.zoneId) {
    throw new AppError(
      403,
      "You can only assign technicians to outages in your zone",
    );
  }

  // Find valid technician
  const technician = await prisma.user.findFirst({
    where: {
      id: technicianId,
      role: UserRole.FIELD_OPERATOR,
      jobType: JobType.TECHNICIAN,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      jobType: true,
      zoneId: true,
    },
  });

  if (!technician) {
    throw new AppError(404, "Active technician not found");
  }

  // Technician must belong to the same zone
  if (technician.zoneId !== outage.zoneId) {
    throw new AppError(400, "Technician does not belong to the outage zone");
  }

  // Prevent multiple active assignments
  const existingAssignment = await prisma.technicianAssignment.findFirst({
    where: {
      outageId,
      status: {
        in: [
          AssignmentStatus.PENDING,
          AssignmentStatus.ACCEPTED,
          AssignmentStatus.IN_PROGRESS,
        ],
      },
    },
  });

  if (existingAssignment) {
    throw new AppError(400, "A technician is already assigned to this outage");
  }

  // Create assignment + update outage atomically
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.technicianAssignment.create({
      data: {
        outageId,
        technicianId,
        status: AssignmentStatus.PENDING,
        notes,
      },
      include: {
        technician: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            jobType: true,
          },
        },
      },
    });

    const updatedOutage = await tx.outage.update({
      where: {
        id: outageId,
      },
      data: {
        status: OutageStatus.ASSIGNED,
      },
      include: {
        zone: true,
        feeder: true,
        area: true,
      },
    });

    return {
      outage: updatedOutage,
      assignment,
    };
  });
};

const startRepair = async (
  outageId: string,
  user: {
    userId: string;
    role: UserRole;
    jobType?: JobType | null;
  },
) => {
  // Only technicians can start repair
  if (user.role !== UserRole.FIELD_OPERATOR) {
    throw new AppError(403, "Only field operators can start outage repair");
  }

  if (user.jobType !== JobType.TECHNICIAN) {
    throw new AppError(403, "Only technicians can start outage repair");
  }

  const outage = await prisma.outage.findUnique({
    where: {
      id: outageId,
    },
    include: {
      assignments: {
        where: {
          technicianId: user.userId,
          status: {
            in: [AssignmentStatus.PENDING, AssignmentStatus.ACCEPTED],
          },
        },
      },
    },
  });

  if (!outage) {
    throw new AppError(404, "Outage not found");
  }

  if (outage.status !== OutageStatus.ASSIGNED) {
    throw new AppError(
      400,
      `Repair cannot be started from ${outage.status} status`,
    );
  }

  const assignment = outage.assignments[0];

  if (!assignment) {
    throw new AppError(403, "You are not assigned to this outage");
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const updatedAssignment = await tx.technicianAssignment.update({
      where: {
        id: assignment.id,
      },
      data: {
        status: AssignmentStatus.IN_PROGRESS,
        startedAt: now,
        acceptedAt: assignment.acceptedAt ?? now,
      },
    });

    const updatedOutage = await tx.outage.update({
      where: {
        id: outageId,
      },
      data: {
        status: OutageStatus.IN_PROGRESS,
        startedAt: now,
      },
      include: {
        zone: true,
        feeder: true,
        area: true,
      },
    });

    return {
      outage: updatedOutage,
      assignment: updatedAssignment,
    };
  });
};

const restoreOutage = async (
  outageId: string,
  user: {
    userId: string;
    role: UserRole;
    jobType?: JobType | null;
  },
) => {
  // Only technicians can restore power
  if (user.role !== UserRole.FIELD_OPERATOR) {
    throw new AppError(403, "Only field operators can restore an outage");
  }

  if (user.jobType !== JobType.TECHNICIAN) {
    throw new AppError(403, "Only technicians can restore an outage");
  }

  const outage = await prisma.outage.findUnique({
    where: {
      id: outageId,
    },
    include: {
      assignments: {
        where: {
          technicianId: user.userId,
          status: AssignmentStatus.IN_PROGRESS,
        },
      },
    },
  });

  if (!outage) {
    throw new AppError(404, "Outage not found");
  }

  if (outage.status !== OutageStatus.IN_PROGRESS) {
    throw new AppError(
      400,
      `Outage cannot be restored from ${outage.status} status`,
    );
  }

  const assignment = outage.assignments[0];

  if (!assignment) {
    throw new AppError(
      403,
      "You are not the technician currently working on this outage",
    );
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const updatedAssignment = await tx.technicianAssignment.update({
      where: {
        id: assignment.id,
      },
      data: {
        status: AssignmentStatus.COMPLETED,
        completedAt: now,
      },
    });

    const updatedOutage = await tx.outage.update({
      where: {
        id: outageId,
      },
      data: {
        status: OutageStatus.RESTORED,
        restoredAt: now,
      },
      include: {
        zone: true,
        feeder: true,
        area: true,
      },
    });

    return {
      outage: updatedOutage,
      assignment: updatedAssignment,
    };
  });
};

export const OutageService = {
  createOutageReport,
  verifyOutage,
  assignTechnician,
  startRepair,
  restoreOutage,
};
