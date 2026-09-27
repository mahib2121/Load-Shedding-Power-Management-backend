import type { UploadApiResponse } from "cloudinary";

import { cloudinaryUpload } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
  // 1. Make sure the user exists before uploading anything
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { imagePublicId: true },
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  // 2. Upload new image to Cloudinary via a streamed buffer
  const cloudinaryResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      const uploadStream = cloudinaryUpload.uploader.upload_stream(
        {
          resource_type: "image",
          folder: "load-shedding/users/profile",
        },
        (error, result) => {
          if (error) {
            return reject(error);
          }

          if (!result) {
            return reject(new Error("No result returned from Cloudinary"));
          }

          resolve(result);
        },
      );

      uploadStream.end(buffer);
    },
  );

  // 3. Update the user record with new image URL/public id
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      imageUrl: cloudinaryResult.secure_url,
      imagePublicId: cloudinaryResult.public_id,
    },
    omit: {
      password: true,
    },
  });

  // 4. Best-effort cleanup of old Cloudinary asset (do not fail the request)
  const previousPublicId = existingUser.imagePublicId;
  if (previousPublicId && previousPublicId !== cloudinaryResult.public_id) {
    try {
      await cloudinaryUpload.uploader.destroy(previousPublicId);
    } catch (err) {
      console.error(
        "Failed to delete previous Cloudinary image:",
        (err as Error).message,
      );
    }
  }

  return updatedUser;
};

export const UserServices = {
  uploadProfileImage,
};
