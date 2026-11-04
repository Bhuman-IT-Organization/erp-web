import { describe, expect, it } from 'vitest';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import {
  DELETE_REFUSED_CODES,
  FIXED_EQUIPMENT_DEPRECIATIONS_ENDPOINTS,
  FIXED_EQUIPMENT_DEPRECIATIONS_ERRORS,
  FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_COLUMNS,
  FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_PATH,
  FIXED_EQUIPMENT_DEPRECIATIONS_PATH,
  fixedEquipmentDepreciationsHooks,
  fixedEquipmentDepreciationsPath,
  NOT_FOUND_CODE,
  VALIDATION_CODE,
} from '../fixed-equipment-depreciations.endpoints';

describe('fixed-equipment-depreciations endpoints', () => {
  it('declares exactly the six calls the api module serves, method and path', () => {
    expect(FIXED_EQUIPMENT_DEPRECIATIONS_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/fixed-equipment-depreciations' },
      export: { method: 'GET', path: '/api/v1/fixed-equipment-depreciations/export' },
      detail: { method: 'GET', path: '/api/v1/fixed-equipment-depreciations/:id' },
      create: { method: 'POST', path: '/api/v1/fixed-equipment-depreciations' },
      update: { method: 'PATCH', path: '/api/v1/fixed-equipment-depreciations/:id' },
      remove: { method: 'DELETE', path: '/api/v1/fixed-equipment-depreciations/:id' },
    });
  });

  it('derives the list and a record path from the table, the id encoded', () => {
    expect(FIXED_EQUIPMENT_DEPRECIATIONS_PATH).toBe('/api/v1/fixed-equipment-depreciations');
    expect(fixedEquipmentDepreciationsPath('7')).toBe('/api/v1/fixed-equipment-depreciations/7');
    expect(fixedEquipmentDepreciationsPath('a b')).toBe(
      '/api/v1/fixed-equipment-depreciations/a%20b',
    );
    expect(fixedEquipmentDepreciationsPath('a/1')).toBe(
      '/api/v1/fixed-equipment-depreciations/a%2F1',
    );
  });

  it("exports Perfex's three columns in the api's order", () => {
    expect(FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_PATH).toBe(
      '/api/v1/fixed-equipment-depreciations/export',
    );
    expect(FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_COLUMNS).toEqual(['id', 'name', 'term']);
  });

  it("names the api's codes: not found and the two delete refusals; never a name-taken code", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(DELETE_REFUSED_CODES).toEqual([
      'ERP-FIXEDEQUIPMENTDEPRECIATIONS-0001',
      'ERP-FIXEDEQUIPMENTDEPRECIATIONS-0002',
    ]);
    expect(FIXED_EQUIPMENT_DEPRECIATIONS_ERRORS).toEqual({
      namespace: 'fixed-equipment-depreciations',
      codes: [
        'ERP-CORE-0004',
        'ERP-FIXEDEQUIPMENTDEPRECIATIONS-0001',
        'ERP-FIXEDEQUIPMENTDEPRECIATIONS-0002',
      ],
    });
  });

  it('every declared code has a message in English and in Arabic', () => {
    for (const code of FIXED_EQUIPMENT_DEPRECIATIONS_ERRORS.codes) {
      expect(en['fixed-equipment-depreciations'].errors).toHaveProperty(code);
      expect(ar['fixed-equipment-depreciations'].errors).toHaveProperty(code);
    }
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(fixedEquipmentDepreciationsHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
