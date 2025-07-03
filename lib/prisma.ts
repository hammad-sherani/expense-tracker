import { PrismaClient } from '@prisma/client'

const prismaClinetSingleton = () => new PrismaClient();

declare global {
  var prismaGlobal:  undefined | ReturnType<typeof prismaClinetSingleton>;
}
export const prisma = globalThis.prismaGlobal || prismaClinetSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}