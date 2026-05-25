// TanStack form's generic plumbing is wide enough that typing the `form`
// instance across component boundaries is more pain than value. Sections
// receive `form` as opaque and rely on the duck-typed FieldApi inside
// admin/fields/* (TextField, TextareaField, TagInputField).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyForm = any;
