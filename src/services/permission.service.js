import { ROLES } from "../constants/roles.js";

export const isChatAllowed = (participants) => {
  const roles = participants.map(p => p.roleId);

  // Buyer ↔ Admin not allowed
  if (roles.includes(ROLES.BUYER) && roles.includes(ROLES.ADMIN)) {
    return false;
  }

  return true;
};
