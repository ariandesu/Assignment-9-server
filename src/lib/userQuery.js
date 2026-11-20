import { ObjectId } from 'mongodb';

export function byUserId(id) {
  if (ObjectId.isValid(id)) {
    return { _id: new ObjectId(id) };
  }
  return { _id: id };
}
