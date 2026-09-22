import bcrypt from "bcryptjs";
import type { SignOptions, JwtPayload } from "jsonwebtoken";
import {
  UserRole,
  UserStatus,
  type JobType,
} from "../../../generated/prisma/enums";
import type { TokenPayload } from "google-auth-library";
import { googleClient } from "../../lib/googleAuth";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import type {
  IGoogleLoginPayload,
  ILoginUserPayload,
  IRegisterUserPayload,
  IRequestUser,
} from "./auth.interface";

const generateTokens = (user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  jobType?: JobType | null;
  zoneId?: string | null;
  areaId?: string | null;
}) => {
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    jobType: user.jobType ?? null,
    zoneId: user.zoneId ?? null,
    areaId: user.areaId ?? null,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const registerUser = async (payload: IRegisterUserPayload) => {
  const email = payload.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  // Customers must belong to an area.
  if (!payload.areaId) {
    throw new Error("Area is required for customer registration");
  }

  // Verify area exists.
  const area = await prisma.area.findFirst({
    where: {
      id: payload.areaId,
      deletedAt: null,
    },
  });

  if (!area) {
    throw new Error("Area not found");
  }

  const hashedPassword = await bcrypt.hash(payload.password, 10);

  const user = await prisma.user.create({
    data: {
      name: payload.name.trim(),
      email,
      password: hashedPassword,

      role: UserRole.CUSTOMER,
      jobType: null,

      areaId: payload.areaId,
      zoneId: null,

      isActive: true,
    },
    omit: {
      password: true,
    },
  });

  const tokens = generateTokens(user);

  return {
    user,
    ...tokens,
  };
};

const loginUser = async (payload: ILoginUserPayload) => {
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error("Invalid credentials");
  }

  if (user.deletedAt !== null) {
    throw new Error("User account has been deleted");
  }

  if (!user.isActive) {
    throw new Error("User account is inactive");
  }

  if (!user.password) {
    throw new Error("This account does not have password authentication");
  }

  const isPasswordMatched = await bcrypt.compare(
    payload.password,
    user.password,
  );

  if (!isPasswordMatched) {
    throw new Error("Invalid credentials");
  }

  const tokens = generateTokens(user);

  return tokens;
};

const getMe = async (user: IRequestUser) => {
  const existingUser = await prisma.user.findFirst({
    where: {
      id: user.userId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      jobType: true,
      isActive: true,
      areaId: true,
      zoneId: true,
      createdAt: true,
      updatedAt: true,

      area: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },

      zone: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  if (!existingUser.isActive) {
    throw new Error("User account is inactive");
  }

  return existingUser;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new Error(
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  if (!data.userId) {
    throw new Error("Invalid refresh token payload");
  }

  const user = await prisma.user.findFirst({
    where: {
      id: data.userId as string,
      deletedAt: null,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.isActive) {
    throw new Error("User account is inactive");
  }

  const tokens = generateTokens(user);

  return tokens;
};

const logoutUser = async () => {
  return {
    message: "Logged out successfully",
  };
};

const createSystemUser = async (payload: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  jobType?: JobType;
  zoneId?: string;
  areaId?: string;
  phone?: string;
}) => {
  const email = payload.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  /**
   * Role validation
   */

  // CUSTOMER
  if (payload.role === UserRole.CUSTOMER) {
    if (!payload.areaId) {
      throw new Error("Customer must have an area");
    }

    if (payload.zoneId) {
      throw new Error("Customer should not have a zone directly");
    }

    if (payload.jobType) {
      throw new Error("Customer cannot have a job type");
    }
  }

  // FIELD_OPERATOR
  if (payload.role === UserRole.FIELD_OPERATOR) {
    if (!payload.zoneId) {
      throw new Error("Field operator must have a zone");
    }

    if (!payload.jobType) {
      throw new Error(
        "Field operator must have a job type: OPERATOR or TECHNICIAN",
      );
    }

    if (payload.areaId) {
      throw new Error("Field operator should not have an area");
    }
  }

  // ZONE_MANAGER
  if (payload.role === UserRole.ZONE_MANAGER) {
    if (!payload.zoneId) {
      throw new Error("Zone manager must have a zone");
    }

    if (payload.jobType) {
      throw new Error("Zone manager cannot have a job type");
    }

    if (payload.areaId) {
      throw new Error("Zone manager should not have an area");
    }
  }

  // SUPER_ADMIN
  if (payload.role === UserRole.SUPER_ADMIN) {
    if (payload.zoneId || payload.areaId || payload.jobType) {
      throw new Error("Super admin should not have zone, area or job type");
    }
  }

  // Validate zone if provided.
  if (payload.zoneId) {
    const zone = await prisma.zone.findFirst({
      where: {
        id: payload.zoneId,
        deletedAt: null,
      },
    });

    if (!zone) {
      throw new Error("Zone not found");
    }
  }

  // Validate area if provided.
  if (payload.areaId) {
    const area = await prisma.area.findFirst({
      where: {
        id: payload.areaId,
        deletedAt: null,
      },
    });

    if (!area) {
      throw new Error("Area not found");
    }
  }

  const hashedPassword = await bcrypt.hash(payload.password, 10);

  const user = await prisma.user.create({
    data: {
      name: payload.name.trim(),
      email,
      password: hashedPassword,
      phone: payload.phone,

      role: payload.role,
      jobType: payload.jobType ?? null,

      zoneId: payload.zoneId ?? null,
      areaId: payload.areaId ?? null,

      isActive: true,
    },

    omit: {
      password: true,
    },
  });

  return user;
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  let googlePayload: TokenPayload | undefined;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });

    googlePayload = ticket.getPayload();
  } catch (error) {
    console.error("Google ID token verification failed:", error);

    throw new Error("Invalid or expired Google ID token");
  }

  if (!googlePayload) {
    throw new Error("Invalid Google authentication response");
  }

  if (!googlePayload.sub) {
    throw new Error("Google user ID not found");
  }

  if (!googlePayload.email) {
    throw new Error("Google email not found");
  }

  if (!googlePayload.name) {
    throw new Error("Google user name not found");
  }

  const email = googlePayload.email.trim().toLowerCase();

  /*
   * First check whether this Google account already exists.
   */
  let user = await prisma.user.findUnique({
    where: {
      googleId: googlePayload.sub,
    },
  });

  /*
   * Google account doesn't exist.
   */
  if (!user) {
    const existingEmailUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    /*
     * Existing normal customer.
     *
     * Link the Google account to the existing customer.
     */
    if (existingEmailUser) {
      if (existingEmailUser.deletedAt !== null) {
        throw new Error("User account has been deleted");
      }

      if (!existingEmailUser.isActive) {
        throw new Error("User account is inactive");
      }

      /*
       * Don't allow Google login to link to
       * staff/admin accounts.
       */
      if (existingEmailUser.role !== UserRole.CUSTOMER) {
        throw new Error(
          "This email belongs to a system account. Please use password login.",
        );
      }

      user = await prisma.user.update({
        where: {
          id: existingEmailUser.id,
        },
        data: {
          googleId: googlePayload.sub,
        },
      });
    } else {
      throw new Error(
        "Google account is not registered. Please register first with an area.",
      );
    }
  }

  if (user.deletedAt !== null) {
    throw new Error("User account has been deleted");
  }

  if (!user.isActive) {
    throw new Error("User account is inactive");
  }

  if (user.role !== UserRole.CUSTOMER) {
    throw new Error("Only customer accounts can use Google login.");
  }

  const tokens = generateTokens(user);

  return tokens;
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
  const { email } = payload;

  const isUserExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExist) {
    throw new Error("User Does Not Exist!");
  }

  if (isUserExist.status === "BLOCKED") {
    throw new Error("User is Blocked");
  }

  if (!isUserExist.emailVerified) {
    throw new Error("User Not Verified");
  }

  if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
    throw new Error("User is Deleted");
  }

  if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
    throw new Error("User Has Account With Google");
  }

  const otp = crypto.randomInt(100000, 1000000).toString();

  const key = `forgor-password-otp:${isUserExist.email}`;

  const expirationSeconds = 5 * 60;

  await redisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  const tempatePath = path.join(
    process.cwd(),
    "src/app/templates/forgot-password.ejs",
  );

  const templateData = {
    name: isUserExist.name,
    otp,
    expirationMinutes: expirationSeconds / 60,
  };

  const html = await ejs.renderFile(tempatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: isUserExist.email,
    subject: "Forgot Password",
    // text : `Your OTP is ${otp}`
    // html: `<h1>Your OTP is ${otp}</h1>`
    html,
  });
};
const resetPassword = async (payload: IResetPasswordPayload) => {
  const { email, otp, newPassword } = payload;

  const isUserExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExist) {
    throw new Error("User Does Not Exist!");
  }

  if (isUserExist.status === "BLOCKED") {
    throw new Error("User is Blocked");
  }

  if (!isUserExist.emailVerified) {
    throw new Error("User Not Verified");
  }

  if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
    throw new Error("User is Deleted");
  }

  if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
    throw new Error("User Has Account With Google");
  }

  const key = `forgor-password-otp:${isUserExist.email}`;

  const redisOtp = await redisClient.get(key);

  if (!redisOtp) {
    throw new Error("Invalid OTP");
  }

  if (redisOtp !== otp) {
    throw new Error("OTP Does Not Match");
  }

  const hashedNewPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  await prisma.user.update({
    where: {
      email: isUserExist.email,
    },
    data: {
      password: hashedNewPassword,
    },
  });

  await redisClient.del([key]);

  const tempatePath = path.join(
    process.cwd(),
    "src/app/templates/reset-password-success.ejs",
  );

  const templateData = {
    name: isUserExist.name,
  };

  const html = await ejs.renderFile(tempatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: isUserExist.email,
    subject: "Password Changed",
    // text : `Your OTP is ${otp}`
    // html: `<h1>Your Password Is Changed</h1>`
    html,
  });
};

export const AuthService = {
  registerUser,
  loginUser,
  getMe,
  refreshToken,
  logoutUser,
  createSystemUser,
  googleLogin,
};
