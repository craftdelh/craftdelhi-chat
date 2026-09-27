import test from "node:test";
import assert from "node:assert/strict";
import { chooseOrderRoom, getOrderContextIds } from "../src/utils/orderRoom.js";
import { extractPureContextId } from "../src/utils/extractPureId.js";

test("includes canonical and legacy order-room identifiers", () => {
  assert.deepEqual(getOrderContextIds(68), ["ORDER_68", "ORDER_ID_68", "68"]);
});

test("chooses the legacy room that contains the latest message over an empty canonical room", () => {
  const rooms = [
    { _id: "new-empty-room", contextId: "ORDER_68" },
    { _id: "existing-chat-room", contextId: "ORDER_ID_68" }
  ];

  assert.equal(
    chooseOrderRoom(rooms, "existing-chat-room")._id,
    "existing-chat-room"
  );
});

test("prefers the canonical room when none of the matching rooms has messages", () => {
  const rooms = [
    { _id: "numeric-room", contextId: "68" },
    { _id: "canonical-room", contextId: "ORDER_68" }
  ];

  assert.equal(chooseOrderRoom(rooms)._id, "canonical-room");
});

test("extracts the order id from admin order-room identifiers", () => {
  assert.equal(extractPureContextId("ORDER", "ORDER_ADMIN_68_12"), 68);
});
