// Both property and recent-draft queries use alias i. Filter before pagination;
// retain imports, derived versions and editor work even without listing fields.
export const visibleImportSql=`(i.status!='importing' OR i.draft_pending=0 OR i.source_kind!='manual'
  OR json_extract(i.input_json,'$.editorSource') IS NOT NULL OR json_extract(i.input_json,'$.sourceHash') IS NOT NULL
  OR EXISTS(SELECT 1 FROM import_objects o WHERE o.agency_id=i.agency_id AND o.import_id=i.id)
  OR EXISTS(SELECT 1 FROM editor_music_assets a WHERE a.agency_id=i.agency_id AND a.import_id=i.id)
  OR EXISTS(SELECT 1 FROM editor_voice_sources v WHERE v.agency_id=i.agency_id AND v.import_id=i.id)
  OR EXISTS(SELECT 1 FROM creation_drafts d WHERE d.agency_id=i.agency_id AND d.id=i.id AND (
    trim(coalesce(json_extract(d.data_json,'$.originalText'),''))!=''
    OR json_extract(d.data_json,'$.canonicalUrl') IS NOT NULL
    OR json_extract(d.data_json,'$.videoCustomization.editor') IS NOT NULL
    OR EXISTS(SELECT 1 FROM json_each(coalesce(json_extract(d.data_json,'$.manualInput'),json_extract(d.data_json,'$.fields'))) f
      WHERE trim(coalesce(cast(f.value AS TEXT),''))!='' AND NOT(f.key='propertyType' AND f.value='apartment')
        AND NOT(f.key='transaction' AND f.value='sale')))))`;
