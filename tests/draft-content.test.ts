import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasManualDraftContent,
  hasCreationDraftContent,
  emptyCreationFields,
  ManualDraftInput,
} from '../packages/contracts/src/index';
import { blankCreationDraft } from '../packages/db/src/creation-drafts';

test('Un formulaire intact ou composé d’espaces ne constitue pas un brouillon', () => {
  assert.equal(hasManualDraftContent(emptyCreationFields()), false);
  assert.equal(
    hasManualDraftContent({
      ...emptyCreationFields(),
      propertyType: 'apartment',
      transaction: 'sale',
      title: '  ',
      description: '\n\t ',
    }),
    false,
  );
  assert.equal(hasCreationDraftContent(blankCreationDraft()), false);
  for (const fields of [
    { title: 'A' },
    { description: 'Une terrasse' },
    { locality: 'L' },
    { priceCents: '12,' },
    { propertyType: 'house' },
    { transaction: 'rent' },
  ])
    assert.equal(hasManualDraftContent(fields), true);
  assert.equal(hasManualDraftContent({}, 1), true);
});
test('Les saisies incomplètes sont conservées séparément des faits validés', () => {
  const manualInput = ManualDraftInput.parse({
    title: 'A',
    propertyType: 'apartment',
    transaction: 'sale',
    locality: '',
    description: '',
    priceCents: '12,',
    charges: '',
    area: '',
    rooms: '',
  });
  assert.equal(hasCreationDraftContent({ ...blankCreationDraft(), manualInput }), true);
  assert.equal(
    hasCreationDraftContent({ ...blankCreationDraft(), manualInput: { ...manualInput, title: '', priceCents: '' } }),
    false,
  );
  assert.equal(
    hasCreationDraftContent({ ...blankCreationDraft(), canonicalUrl: 'https://example.invalid/annonce' }),
    true,
  );
  assert.equal(ManualDraftInput.safeParse({ ...manualInput, title: 'a'.repeat(201) }).success, false);
});
