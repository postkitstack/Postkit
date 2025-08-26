/*
 * Realm-Role Priority Mapper  (works on Keycloak 24, Nashorn ES-5)
 * Chooses the highest-priority *realm* role and exports it
 * as the "role" claim.
 */

/* ---------- CONFIG ---------- */
var ROLE_PRIORITY = [
  "app_admin",
  "account_manager",
  "contractor",
  "employee",
  "contract_employee",
  "client",
  "service_role",
  "anon",
]; // high → low
var DEFAULT_ROLE = "authenticated";
/* ---------------------------- */

/* -------- Collect realm roles into a JS array -------- */
var Collectors = Java.type("java.util.stream.Collectors");

var realmRoleNames = Java.from(
  // JS array
  user
    .getRealmRoleMappingsStream() // Stream<RoleModel>
    .map(function (r) {
      return r.getName();
    }) // Stream<String>
    .collect(Collectors.toList()) // List<String>
);

/* -------- Pick the first priority match -------- */
var selected = DEFAULT_ROLE;
for (var i = 0; i < ROLE_PRIORITY.length; i++) {
  if (realmRoleNames.indexOf(ROLE_PRIORITY[i]) !== -1) {
    selected = ROLE_PRIORITY[i];
    break;
  }
}

/* -------- Return it to the token -------- */
exports = selected;
