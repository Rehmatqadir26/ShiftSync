import type { PrismaClient } from "@prisma/client";

/** Client passed to interactive `$transaction` callbacks (and the root client). */
export type DbClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
