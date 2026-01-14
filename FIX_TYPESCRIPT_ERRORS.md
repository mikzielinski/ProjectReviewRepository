# Naprawa błędów TypeScript w build GitHub Actions

## Błędy do naprawienia:

1. ✅ `detailed_table_styles` - DODANO do interfejsu DocStyles
2. ⚠️ `OfficeDocumentViewer` - zadeklarowany w Templates.tsx, ale nieużywany (jest inny OfficeDocumentViewer w DocumentsTab.tsx)
3. ⚠️ `e` - nieużywany parametr (musi być gdzieś w catch/event handler)
4. ⚠️ `deleting` - już zakomentowane w FolderTree.tsx
5. ⚠️ `useAuth` - już zakomentowane w FolderTree.tsx
6. ⚠️ `handleEditDocument` - zadeklarowany w DocumentsTab.tsx, ale nieużywany
7. ⚠️ `version` - właściwość nie istnieje na typie template (2x) - może być w TemplateInfoModal.tsx
8. ⚠️ `AuditLogModal` - zadeklarowany w DocumentsTab.tsx, ale nieużywany
9. ⚠️ `formatChanges` - zadeklarowany w AuditLogModal.tsx, ale nieużywany

## Następne kroki:

Musisz sprawdzić dokładne lokalizacje tych błędów w logach GitHub Actions i naprawić je jeden po drugim.

