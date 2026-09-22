import type { JobType, UserRole } from "../../../generated/prisma/browser";

export interface ILoginUserPayload {
  email: string;
  password: string;
}

export interface IRegisterUserPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  areaId: string;
}

export interface IGoogleLoginPayload {
  idToken: string;
}

export interface IRequestUser {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  jobType?: JobType | null;
  zoneId?: string | null;
  areaId?: string | null;
}

export interface IForgotPasswordPayload {
  email: string;
}

export interface IResetPasswordPayload {
  email: string;
  otp: string;
  newPassword: string;
}
