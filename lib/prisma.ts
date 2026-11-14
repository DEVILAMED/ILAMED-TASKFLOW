import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
const RETRYABLE_CONNECTION_ERROR_CODES = new Set(["P1001", "P1017"]);
const connectionTimeoutMillis = Number(process.env.PG_CONNECTION_TIMEOUT_MS || 15000);
const maxPoolConnections = Number(process.env.PG_POOL_MAX || 1);

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

if (!Number.isInteger(maxPoolConnections) || maxPoolConnections < 1 || maxPoolConnections > 15) {
  throw new Error("PG_POOL_MAX must be an integer between 1 and 15.");
}

function isRetryableConnectionError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    RETRYABLE_CONNECTION_ERROR_CODES.has(error.code)
  ) {
    return true;
  }

  return error instanceof Error && error.message.includes("Server has closed the connection");
}

function createPrismaClient() {
  const adapter = new PrismaPg(
    {
      connectionString,
      connectionTimeoutMillis,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      max: maxPoolConnections,
    },
    {
      onConnectionError(error) {
        console.error("PostgreSQL connection error", error);
      },
      onPoolError(error) {
        console.error("PostgreSQL pool error", error);
      },
    },
  );

  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  }).$extends({
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (!isRetryableConnectionError(error)) {
            throw error;
          }

          console.warn("Retrying Prisma query after a transient PostgreSQL connection drop.");
          return query(args);
        }
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

declare global {
  var ilamedPrisma: ExtendedPrismaClient | undefined;
}

const globalForPrisma = globalThis as typeof globalThis & {
  ilamedPrisma?: ExtendedPrismaClient;
};

// A schema change can leave the development server holding an older generated client.
const cachedPrisma = globalForPrisma.ilamedPrisma;
export const prisma = cachedPrisma?.dailyWorkReport ? cachedPrisma : createPrismaClient();
if (cachedPrisma && cachedPrisma !== prisma) void cachedPrisma.$disconnect();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.ilamedPrisma = prisma;
}
