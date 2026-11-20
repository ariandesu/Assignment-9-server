import { ObjectId } from 'mongodb';

export function byEquipmentId(id) {
  if (!id) return { _id: null };
  const strId = String(id);
  if (ObjectId.isValid(strId)) {
    return {
      $or: [{ _id: new ObjectId(strId) }, { id: strId }, { _id: strId }],
    };
  }
  return {
    $or: [{ id: strId }, { _id: strId }],
  };
}
