import postgres from "postgres";
import * as schema from "./schema";
export declare const db: (import("drizzle-orm/postgres-js").PostgresJsDatabase<Record<string, unknown>> & {
    $client: postgres.Sql<{}>;
}) | null;
export declare const hasDatabase: boolean;
export { schema };
