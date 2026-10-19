import { types } from "@neondatabase/serverless";

/** Better Auth does timestamp arithmetic on bigint columns. node-postgres
 * normally returns int8 as text, which would concatenate retry timestamps.
 * Scope numeric decoding to this pool and reject values JS cannot represent.
 */
export const databaseTypes = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid !== 20 || format === "binary") return types.getTypeParser(oid, format);
    return (value: string) => {
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed)) throw new Error("Database integer exceeds JavaScript's safe range.");
      return parsed;
    };
  },
};
