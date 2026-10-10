import { prisma } from "../../lib/prisma";

const getAreas = async () => {
  return prisma.area.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      code: true,
    },
    orderBy: {
      name: "asc",
    },
  });
};

export const AreaService = {
  getAreas,
};
