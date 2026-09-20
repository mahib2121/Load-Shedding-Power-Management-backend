import bcrypt from "bcryptjs";

import { JobType, UserRole } from "../../generated/prisma/enums";

import config from "../config";
import { prisma } from "../lib/prisma";

/* =========================================================
   Helper
========================================================= */

const hashPassword = async (password: string) => {
	return bcrypt.hash(password, Number(config.bcrypt_salt_rounds));
};

/* =========================================================
   Infrastructure Seed
========================================================= */

const seedInfrastructure = async () => {
	/*
	 * Zone
	 */
	const zone = await prisma.zone.upsert({
		where: {
			code: "DHK-NORTH",
		},
		update: {},
		create: {
			name: "Dhaka North Zone",
			code: "DHK-NORTH",
			description:
				"Demo distribution zone for the load shedding management system.",
		},
	});

	/*
	 * Substation
	 */
	const substation = await prisma.substation.upsert({
		where: {
			code: "MIRPUR-SS-01",
		},
		update: {},
		create: {
			name: "Mirpur Substation",
			code: "MIRPUR-SS-01",
			capacityMW: 50,
			zoneId: zone.id,
		},
	});

	/*
	 * Feeder 1
	 */
	const feeder1 = await prisma.feeder.upsert({
		where: {
			code: "MIRPUR-F01",
		},
		update: {},
		create: {
			name: "Mirpur Feeder 01",
			code: "MIRPUR-F01",
			capacityMW: 10,
			currentLoadMW: 7.5,
			priority: "NORMAL",
			substationId: substation.id,
			isActive: true,
		},
	});

	/*
	 * Feeder 2
	 */
	const feeder2 = await prisma.feeder.upsert({
		where: {
			code: "MIRPUR-F02",
		},
		update: {},
		create: {
			name: "Mirpur Feeder 02",
			code: "MIRPUR-F02",
			capacityMW: 12,
			currentLoadMW: 9,
			priority: "HIGH",
			substationId: substation.id,
			isActive: true,
		},
	});

	/*
	 * Areas
	 */
	const area1 = await prisma.area.upsert({
		where: {
			code: "MIRPUR-01",
		},
		update: {},
		create: {
			name: "Mirpur 1",
			code: "MIRPUR-01",
			feederId: feeder1.id,
		},
	});

	const area2 = await prisma.area.upsert({
		where: {
			code: "MIRPUR-02",
		},
		update: {},
		create: {
			name: "Mirpur 2",
			code: "MIRPUR-02",
			feederId: feeder2.id,
		},
	});

	console.log("Infrastructure seeded successfully.");

	return {
		zone,
		substation,
		feeder1,
		feeder2,
		area1,
		area2,
	};
};

/* =========================================================
   Super Admin
========================================================= */

export const seedSuperAdmin = async () => {
	const name = config.super_admin_name;
	const email = config.super_admin_email;
	const password = config.super_admin_password;

	if (!name || !email || !password) {
		throw new Error(
			"Super Admin name, email or password is missing in environment variables.",
		);
	}

	const hashedPassword = await hashPassword(password);

	const user = await prisma.user.upsert({
		where: {
			email: email.toLowerCase(),
		},
		update: {
			name,
			role: UserRole.SUPER_ADMIN,
			isActive: true,
			deletedAt: null,
		},
		create: {
			name,
			email: email.toLowerCase(),
			password: hashedPassword,
			role: UserRole.SUPER_ADMIN,
			jobType: null,
			areaId: null,
			zoneId: null,
			isActive: true,
		},
		omit: {
			password: true,
		},
	});

	console.log(`Super Admin ready: ${user.email}`);

	return user;
};

/* =========================================================
   Zone Manager
========================================================= */

export const seedZoneManager = async (zoneId: string) => {
	const name = config.zone_manager_name;
	const email = config.zone_manager_email;
	const password = config.zone_manager_password;

	if (!name || !email || !password) {
		throw new Error(
			"Zone Manager name, email or password is missing in environment variables.",
		);
	}

	const hashedPassword = await hashPassword(password);

	const user = await prisma.user.upsert({
		where: {
			email: email.toLowerCase(),
		},
		update: {
			name,
			role: UserRole.ZONE_MANAGER,
			jobType: null,
			zoneId,
			areaId: null,
			isActive: true,
			deletedAt: null,
		},
		create: {
			name,
			email: email.toLowerCase(),
			password: hashedPassword,
			role: UserRole.ZONE_MANAGER,
			jobType: null,
			zoneId,
			areaId: null,
			isActive: true,
		},
		omit: {
			password: true,
		},
	});

	console.log(`Zone Manager ready: ${user.email}`);

	return user;
};

/* =========================================================
   Field Operator - Technician
========================================================= */

export const seedFieldOperatorTechnician = async (zoneId: string) => {
	const name = config.field_operator_name;
	const email = config.field_operator_email;
	const password = config.field_operator_password;

	if (!name || !email || !password) {
		throw new Error(
			"Field Operator name, email or password is missing in environment variables.",
		);
	}

	const hashedPassword = await hashPassword(password);

	const user = await prisma.user.upsert({
		where: {
			email: email.toLowerCase(),
		},
		update: {
			name,
			role: UserRole.FIELD_OPERATOR,
			jobType: JobType.TECHNICIAN,
			zoneId,
			areaId: null,
			isActive: true,
			deletedAt: null,
		},
		create: {
			name,
			email: email.toLowerCase(),
			password: hashedPassword,
			role: UserRole.FIELD_OPERATOR,
			jobType: JobType.TECHNICIAN,
			zoneId,
			areaId: null,
			isActive: true,
		},
		omit: {
			password: true,
		},
	});

	console.log(`Technician ready: ${user.email}`);

	return user;
};

/* =========================================================
   Field Operator - Operator
========================================================= */

export const seedFieldOperatorOperator = async (zoneId: string) => {
	const name = config.field_operator_2_name;
	const email = config.field_operator_2_email;
	const password = config.field_operator_2_password;

	if (!name || !email || !password) {
		throw new Error(
			"Second Field Operator name, email or password is missing in environment variables.",
		);
	}

	const hashedPassword = await hashPassword(password);

	const user = await prisma.user.upsert({
		where: {
			email: email.toLowerCase(),
		},
		update: {
			name,
			role: UserRole.FIELD_OPERATOR,
			jobType: JobType.OPERATOR,
			zoneId,
			areaId: null,
			isActive: true,
			deletedAt: null,
		},
		create: {
			name,
			email: email.toLowerCase(),
			password: hashedPassword,
			role: UserRole.FIELD_OPERATOR,
			jobType: JobType.OPERATOR,
			zoneId,
			areaId: null,
			isActive: true,
		},
		omit: {
			password: true,
		},
	});

	console.log(`Operator ready: ${user.email}`);

	return user;
};

/* =========================================================
   Customer
========================================================= */

export const seedCustomer = async (areaId: string) => {
	const name = config.customer_name;
	const email = config.customer_email;
	const password = config.customer_password;

	if (!name || !email || !password) {
		throw new Error(
			"Customer name, email or password is missing in environment variables.",
		);
	}

	const hashedPassword = await hashPassword(password);

	const user = await prisma.user.upsert({
		where: {
			email: email.toLowerCase(),
		},
		update: {
			name,
			role: UserRole.CUSTOMER,
			jobType: null,
			areaId,
			zoneId: null,
			isActive: true,
			deletedAt: null,
		},
		create: {
			name,
			email: email.toLowerCase(),
			password: hashedPassword,
			role: UserRole.CUSTOMER,
			jobType: null,
			areaId,
			zoneId: null,
			isActive: true,
		},
		omit: {
			password: true,
		},
	});

	console.log(`Customer ready: ${user.email}`);

	return user;
};

/* =========================================================
   Main Seed
========================================================= */

export const seedDatabase = async () => {
	console.log("Starting database seed...");

	try {
		const infrastructure = await seedInfrastructure();

		await seedSuperAdmin();

		await seedZoneManager(infrastructure.zone.id);

		await seedFieldOperatorTechnician(infrastructure.zone.id);

		await seedFieldOperatorOperator(infrastructure.zone.id);

		await seedCustomer(infrastructure.area1.id);

		console.log("Database seed completed successfully.");
	} catch (error) {
		console.error("Database seed failed:", error);
		throw error;
	}
};
