// The feature's public surface (FE-07): another feature or a route imports from here only.
// One feature serves all four W1-06 screens, because there is one backend module `v1/identity`.
export { StaffListPage } from './pages/StaffListPage';
export { StaffMemberPage } from './pages/StaffMemberPage';
export { RolesListPage } from './pages/RolesListPage';
export { RolePage } from './pages/RolePage';
export type { StaffMember, StaffRole } from './schemas/staff.schema';
