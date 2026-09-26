import axios from "axios";

import { PaymentStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";

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

export const PaymentService = {
  initialPayment,
};
