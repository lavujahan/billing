// Creates a login from the command line. Prints the 5-digit code once.
//   First owner + business:  npm run create-user -- --owner --business "Sri Lakshmi Hardware" --mobile 9876543210 --name "Senthil"
//   Another user:            npm run create-user -- --business-id <uuid> --mobile 9876500000 --name "Ravi" --role staff
import { parseArgs } from "node:util";
import { normalizeMobile } from "../src/lib/auth/phone";
import { createBusinessUser, type Role } from "../src/lib/auth/users";
import { createServiceClient } from "../src/lib/supabase/service";

const { values } = parseArgs({
  options: {
    owner: { type: "boolean", default: false },
    business: { type: "string" },
    "business-id": { type: "string" },
    mobile: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "staff" },
  },
});

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  const mobile = normalizeMobile(values.mobile ?? "") ?? fail("--mobile must be a 10-digit Indian mobile number");
  const fullName = values.name?.trim() || fail("--name is required");
  const role = (values.owner ? "owner" : values.role) as Role;
  if (!["owner", "admin", "staff"].includes(role)) fail("--role must be owner, admin or staff");

  const service = createServiceClient();
  let businessId = values["business-id"];

  if (!businessId) {
    if (!values.owner || !values.business) fail("Use --owner --business <name> for a new business, or pass --business-id");
    const { data, error } = await service.from("businesses").insert({ name: values.business }).select("id").single();
    if (error) fail(`Could not create business: ${error.message}`);
    businessId = data.id;
    console.log(`✓ Business "${values.business}" created (${businessId})`);
  }

  const { code } = await createBusinessUser(service, { businessId: businessId!, mobile, fullName, role });
  console.log(`✓ ${role} "${fullName}" created for ${mobile}`);
  console.log(`  Login code (shown once): ${code}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
