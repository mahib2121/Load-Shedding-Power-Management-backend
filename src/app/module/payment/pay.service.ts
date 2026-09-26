import axios from "axios";

import { PaymentStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { ISSLCommerzIPN } from "./pay.interface";

const initialPayment = async (paymentId: string, userId: string) => {
  // 1. Find pending payment belonging to the authenticated customer
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      userId,
      status: PaymentStatus.PENDING,
    },
    include: {
      user: true,
    },
  });

  if (!payment) {
    throw new AppError(404, "Pending payment not found");
  }

  // 2. Prepare SSLCommerz payment data
  const paymentData = {
    store_id: config.sslstoreid,
    store_passwd: config.sslstorepassword,

    total_amount: payment.amount,
    currency: payment.currency,

    tran_id: payment.id,

    success_url: "http://localhost:5000/api/v1/payments/success",
    fail_url: "http://localhost:5000/api/v1/payments/fail",
    cancel_url: "http://localhost:5000/api/v1/payments/cancel",
    ipn_url: "https://backend-lime-six-68.vercel.app/api/v1/payments/ipn",

    cus_name: payment.user.name,
    cus_email: payment.user.email,
    cus_phone: payment.user.phone ?? "",

    cus_add1: "Dhaka",
    cus_city: "Dhaka",
    cus_state: "Dhaka",
    cus_postcode: "1000",
    cus_country: "Bangladesh",

    multi_card_name: "mastercard,visacard,amexcard",

    value_a: payment.outageReportId,
    value_b: payment.userId,
    value_c: payment.id,
    value_d: "OUTAGE_REPORT",
  };

  // 3. Convert object to application/x-www-form-urlencoded
  const formData = new URLSearchParams();

  Object.entries(paymentData).forEach(([key, value]) => {
    formData.append(key, String(value));
  });

  // 4. Send request to SSLCommerz
  const response = await axios.post(
    "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
    formData.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  console.log("SSLCommerz response:", response.data);

  return response.data;
};

const handleIPN = async (payload: ISSLCommerzIPN) => {
  const { val_id } = payload;

  if (!val_id) {
    throw new AppError(400, "SSLCommerz validation ID is missing");
  }

  const validationResult = await validateSSLCommerzPayment(val_id);

  console.log("SSLCommerz validation result:", validationResult);

  if (
    validationResult.status !== "VALID" &&
    validationResult.status !== "VALIDATED"
  ) {
    throw new AppError(400, "SSLCommerz transaction validation failed");
  }

  const payment = await prisma.payment.findUnique({
    where: {
      id: validationResult.tran_id,
    },
    include: {
      outageReport: true,
    },
  });

  if (!payment) {
    throw new AppError(404, "Payment transaction not found");
  }

  if (payment.currency !== validationResult.currency) {
    throw new AppError(400, "Payment currency mismatch");
  }

  const gatewayAmount = Number(validationResult.amount);

  if (payment.amount !== gatewayAmount) {
    throw new AppError(400, "Payment amount mismatch");
  }

  const area = await prisma.area.findUnique({
    where: {
      id: payment.outageReport.areaId,
    },
    include: {
      feeder: {
        include: {
          substation: {
            select: {
              id: true,
              zoneId: true,
            },
          },
        },
      },
    },
  });

  if (!area) {
    throw new AppError(404, "Outage area not found");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Update payment only if it is still PENDING.
    const paymentUpdate = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.PAID,
        transactionId: validationResult.tran_id,
        gatewayResponse: validationResult,
      },
    });

    // IPN can be delivered more than once.
    // If another request already processed this payment,
    // don't create another outage.
    if (paymentUpdate.count === 0) {
      const existingPayment = await tx.payment.findUnique({
        where: {
          id: payment.id,
        },
        include: {
          outageReport: {
            include: {
              outage: true,
            },
          },
        },
      });

      if (!existingPayment) {
        throw new AppError(404, "Payment transaction not found");
      }

      return {
        payment: existingPayment,
        outage: existingPayment.outageReport.outage,
        alreadyProcessed: true,
      };
    }

    // Create actual operational outage
    const outage = await tx.outage.create({
      data: {
        title: "Unexpected Power Outage",
        description: payment.outageReport.description,
        status: "REPORTED",
        severity: "MEDIUM",

        zoneId: area.feeder.substation.zoneId,
        feederId: area.feeder.id,
        areaId: area.id,
      },
    });

    // Connect the report with the actual outage
    const outageReport = await tx.outageReport.update({
      where: {
        id: payment.outageReport.id,
      },
      data: {
        outageId: outage.id,
      },
    });

    const updatedPayment = await tx.payment.findUnique({
      where: {
        id: payment.id,
      },
    });

    return {
      payment: updatedPayment,
      outage,
      outageReport,
      alreadyProcessed: false,
    };
  });

  return {
    paymentId: result.payment?.id,
    paymentStatus: result.payment?.status,

    transactionId: validationResult.tran_id,
    valId: validationResult.val_id,

    amount: validationResult.amount,
    currency: validationResult.currency,

    outageId: result.outage?.id,
    outageStatus: result.outage?.status,

    alreadyProcessed: result.alreadyProcessed,
  };
};
const validateSSLCommerzPayment = async (valId: string) => {
  const response = await axios.get(
    "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php",
    {
      params: {
        val_id: valId,
        store_id: config.sslstoreid,
        store_passwd: config.sslstorepassword,
        format: "json",
      },
      timeout: 30000,
    },
  );

  return response.data;
};
export const PaymentService = {
  initialPayment,
  handleIPN,
};
