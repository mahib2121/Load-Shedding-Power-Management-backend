import dotenv from "dotenv";
import path from "path";
import { email } from "zod";

dotenv.config({
  path: path.join(process.cwd(), ".env"),
});

const config = {
  node_env: process.env.NODE_ENV || "development",

  port: Number(process.env.PORT) || 5000,

  database_url: process.env.DATABASE_URL,

  backend_url: process.env.BACKEND_URL || "http://localhost:5000",

  frontend_url: process.env.FRONTEND_URL || "http://localhost:3000",

  bcrypt_salt_rounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,

  jwt_access_secret: process.env.JWT_ACCESS_SECRET || "",

  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET || "",
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN || "1d",
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  super_admin_name: process.env.SUPER_ADMIN_NAME || "",
  super_admin_email: process.env.SUPER_ADMIN_EMAIL || "",
  super_admin_password: process.env.SUPER_ADMIN_PASSWORD || "",
  zone_manager_name: process.env.ZONE_MANAGER_NAME || "",
  zone_manager_email: process.env.ZONE_MANAGER_EMAIL || "",
  zone_manager_password: process.env.ZONE_MANAGER_PASSWORD || "",
  field_operator_name: process.env.FIELD_OPERATOR_NAME,
  field_operator_email: process.env.FIELD_OPERATOR_EMAIL,
  field_operator_password: process.env.FIELD_OPERATOR_PASSWORD,
  field_operator_2_name: process.env.FIELD_OPERATOR_2_NAME,
  field_operator_2_email: process.env.FIELD_OPERATOR_2_EMAIL,
  field_operator_2_password: process.env.FIELD_OPERATOR_2_PASSWORD,
  customer_name: process.env.CUSTOMER_NAME,
  customer_email: process.env.CUSTOMER_EMAIL,
  customer_password: process.env.CUSTOMER_PASSWORD,
  google_client_id: process.env.GOOGLE_CLIENT_ID,

  redis_username: process.env.REDIS_USER,
  redis_password: process.env.REDIS_PASSWORD,
  redis_host: process.env.REDIS_HOST,
  redis_port: process.env.REDIS_PORT,
  smtp_user: process.env.SMTP_USER,
  smtp_password: process.env.SMTP_Password,
  email_sender: process.env.email_sender,
  cloudName: process.env.cloudName,
  cloudAPIkey: process.env.cloudApiKey,
  cloudAPIsecret: process.env.cloudApiSecret,
};

export default config;
