import { STANDARD_CATEGORIES } from '../controllers/equipment.controller.js';

const ALLOWED_RENTAL_TYPES = ['daily', 'weekly', 'monthly'];

export function validateEquipmentBody(body, isUpdate = false) {
  if (!isUpdate || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 80) {
      return 'name must be between 2 and 80 characters';
    }
  }

  if (!isUpdate || body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.trim().length < 5) {
      return 'description must be at least 5 characters';
    }
  }

  if (!isUpdate || body.category !== undefined) {
    if (!STANDARD_CATEGORIES.includes(body.category)) {
      return `category must be one of: ${STANDARD_CATEGORIES.join(', ')}`;
    }
  }

  if (!isUpdate || body.location !== undefined) {
    if (typeof body.location !== 'string' || body.location.trim().length < 2) {
      return 'location is required';
    }
  }

  if (!isUpdate || body.price !== undefined) {
    const p = Number(body.price);
    if (!Number.isInteger(p) || p <= 0) {
      return 'price must be a positive integer in BDT';
    }
  }

  if (!isUpdate || body.rentalType !== undefined) {
    if (!ALLOWED_RENTAL_TYPES.includes(body.rentalType)) {
      return 'rentalType must be daily, weekly, or monthly';
    }
  }

  if (!isUpdate || body.quantity !== undefined) {
    const q = Number(body.quantity);
    if (!Number.isInteger(q) || q < 1) {
      return 'quantity must be a positive integer of at least 1';
    }
  }

  if (!isUpdate || body.condition !== undefined) {
    if (typeof body.condition !== 'string' || !body.condition.trim()) {
      return 'condition is required';
    }
  }

  if (!isUpdate || body.brand !== undefined) {
    if (typeof body.brand !== 'string' || !body.brand.trim()) {
      return 'brand is required';
    }
  }

  if (!isUpdate || body.model !== undefined) {
    if (typeof body.model !== 'string' || !body.model.trim()) {
      return 'model is required';
    }
  }

  if (!isUpdate || body.image !== undefined) {
    if (typeof body.image !== 'string' || !body.image.trim()) {
      return 'image URL is required';
    }
    try {
      const u = new URL(body.image.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return 'image must be a valid http or https URL';
      }
    } catch {
      return 'image must be a valid URL';
    }
  }

  if (!isUpdate || body.terms !== undefined) {
    if (typeof body.terms !== 'string' || body.terms.trim().length < 5) {
      return 'terms must be at least 5 characters';
    }
  }

  return null;
}
