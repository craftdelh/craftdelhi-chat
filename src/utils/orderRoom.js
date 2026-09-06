export const getOrderContextIds = (orderId) => [
  `ORDER_${orderId}`,
  `ORDER_ID_${orderId}`,
  String(orderId)
];

export const chooseOrderRoom = (rooms = [], latestMessageRoomId = null) => {
  if (!rooms.length) return null;

  if (latestMessageRoomId) {
    const roomWithLatestMessage = rooms.find(
      room => String(room._id) === String(latestMessageRoomId)
    );
    if (roomWithLatestMessage) return roomWithLatestMessage;
  }

  return rooms.find(room => {
    const contextId = String(room.contextId);
    return contextId.startsWith("ORDER_") && !contextId.startsWith("ORDER_ID_");
  }) || rooms[0];
};
