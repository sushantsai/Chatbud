// Team roles and the areas of the team portal each one opens.
// The server enforces these on every action; this file only decides what to show.
export const teamRoleLabels: Record<string, string> = {
  FINANCE: "Finance",
  FULFILLMENT: "Fulfillment",
  VERIFICATION: "Verification reviewer",
  CLINICAL_REVIEW: "Clinical reviewer",
  SUPPORT: "Customer support",
  CATALOG: "Catalogue manager",
  SECURITY_ADMIN: "Administrator",
};
export type TeamArea =
  | "dashboard"
  | "applications"
  | "support"
  | "finance"
  | "settings"
  | "operations"
  | "orders"
  | "catalogue"
  | "team";
const areaRoles: Record<TeamArea, string[]> = {
  dashboard: Object.keys(teamRoleLabels),
  applications: ["VERIFICATION"],
  operations: ["SUPPORT", "FINANCE", "FULFILLMENT", "SECURITY_ADMIN"],
  settings: ["SECURITY_ADMIN", "CATALOG", "FULFILLMENT"],
  finance: ["FINANCE", "SUPPORT", "SECURITY_ADMIN"],
  support: ["SUPPORT", "SECURITY_ADMIN"],
  orders: ["SUPPORT", "CATALOG", "FULFILLMENT", "SECURITY_ADMIN"],
  catalogue: ["CATALOG", "SECURITY_ADMIN"],
  team: ["SECURITY_ADMIN"],
};
export const canOpen = (roles: string[] | undefined, area: TeamArea) =>
  (roles || []).some((role) => areaRoles[area].includes(role));
