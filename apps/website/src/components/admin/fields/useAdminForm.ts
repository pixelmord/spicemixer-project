/**
 * Shared form hook for all admin entity forms.
 * Re-exports useForm from TanStack Form so consumers get a consistently named
 * import. Field components (TextField, TextareaField) receive the field API
 * via the standard render-prop pattern:
 *
 *   const form = useAdminForm({ defaultValues: { ... }, onSubmit: ... });
 *
 *   <form.Field name="summary">
 *     {(field) => <TextField field={field} label="Summary" suggestionPath="summary" />}
 *   </form.Field>
 */
export { useForm as useAdminForm } from "@tanstack/react-form";
