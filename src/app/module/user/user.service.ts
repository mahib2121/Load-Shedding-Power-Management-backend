// import type { UploadApiResponse } from "cloudinary";

// import { cloudinaryUpload } from "../../lib/cloudinary";
// import { prisma } from "../../lib/prisma";

// const uploadProfileImage = async (buffer: Buffer, userId: string) => {
//   // 1. Get current profile image
//   const currentUser = await prisma.user.findUnique({
//     where: {
//       id: userId,
//     },
//     select: {
//       imagePublicId: true,
//       imageUrl: true,
//     },
//   });

//   // 2. Upload new image to Cloudinary
//   const cloudinaryResult = await new Promise<UploadApiResponse>(
//     (resolve, reject) => {
//       const uploadStream = cloudinaryUpload.uploader.upload_stream(
//         {
//           resource_type: "image",
//           folder: "load-shedding/users/profile",
//         },
//         (error, result) => {
//           if (error) {
//             return reject(error);
//           }

//           if (!result) {
//             return reject(new Error("No result returned from Cloudinary"));
//           }

//           resolve(result);
//         },
//       );

//       uploadStream.end(buffer);
//     },
//   );

//   // 3. Update database
//   const updatedUser = await prisma.user.update({
//     where: {
//       id: userId,
//     },
//     data: {
//       imageUrl: cloudinaryResult.secure_url,
//       imagePublicId: cloudinaryResult.public_id,
//     },
//     omit: {
//       password: true,
//     },
//   });

//   // 4. Delete old Cloudinary image
//   if (currentUser?.imagePublicId) {
//     await cloudinary.uploader.destroy(currentUser.imagePublicId);
//   }

//   return updatedUser;
// };

// export const UserServices = {
//   uploadProfileImage,
// };
