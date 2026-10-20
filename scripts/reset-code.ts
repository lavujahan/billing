// Issues a new 5-digit login code for a mobile number and clears any lockout. Prints the code once.
//   npm run reset-code -- --mobile 9876543210
import { parseArgs } from "node:util";
import { normalizeMobile } from "../src/lib/auth/phone";
import { resetUserCode } from "../src/lib/auth/users";
import { createServiceClient } from "../src/lib/supabase/service";

const { values } = parseArgs({ options: { mobile: { type: "string" } } });

async function main() {
  const mobile = normalizeMobile(values.mobile ?? "");
  if (!mobile) throw new Error("--mobile must be a 10-digit Indian mobile number");
  const service = createServiceClient();
  const { data: user } = await service.from("users").select("id, full_name, role, active").eq("mobile", mobile).maybeSingle();
  if (!user) throw new Error(`No login for ${mobile}`);
  const code = await resetUserCode(service, user.id);
  console.log(`✓ New code for ${user.full_name} (${user.role}, ${mobile})${user.active ? "" : " — note: this login is deactivated"}`);
  console.log(`  Login code (shown once): ${code}`);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
