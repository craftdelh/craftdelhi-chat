export const extractPureContextId = (contextType, contextId) => {
  if (!contextId) return null;

  // Already a number
  if (typeof contextId === "number") {
    return contextId;
  }

  if (typeof contextId === "string") {
    // PRODUCT_ID_123
    if (contextType === "PRODUCT" && contextId.startsWith("PRODUCT_ID_")) {
      return Number(contextId.split("_")[2]);
    }

    // ORDER_ID_987
    if (contextType === "ORDER" && contextId.startsWith("ORDER_ID_")) {
      return Number(contextId.split("_")[2]);
    }

    // PRODUCT_ADMIN_123_45
    if (contextType === "PRODUCT" && contextId.startsWith("PRODUCT_ADMIN_")) {
      return Number(contextId.split("_")[2]);
    }

    // ORDER_ADMIN_987_45
    if (contextType === "ORDER" && contextId.startsWith("ORDER_ADMIN_")) {
      return Number(contextId.split("_")[2]);
    }

    // ORDER_987 (dedicated quotation/order chat)
    if (contextType === "ORDER" && contextId.startsWith("ORDER_")) {
      return Number(contextId.split("_")[1]);
    }

    // Pure numeric string
    if (!isNaN(contextId)) {
      return Number(contextId);
    }
  }

  return null;
};
