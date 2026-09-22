import { v2 as cloudinary } from "cloudinary";
import config from "../config";

cloudinary.config({
  cloud_name: config.cloudName,
  api_key: config.cloudAPIkey,
  api_secret: config.cloudAPIsecret,
});
export const cloudinaryUpload = cloudinary;
