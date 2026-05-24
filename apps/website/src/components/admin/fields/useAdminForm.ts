import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "./form-context.ts";
import { TextField } from "./TextField.tsx";
import { TextareaField } from "./TextareaField.tsx";

/**
 * Shared form hook for all admin entity forms.
 * Extends the base TanStack Form useForm with composed field components
 * (TextField, TextareaField) that integrate Label, input primitive, and
 * InlineFieldSuggestion in one place.
 *
 * Usage:
 *   const form = useAdminForm({ defaultValues: { ... }, onSubmit: ... });
 *
 *   <form.AppField name="summary">
 *     {(field) => <field.TextField label="Summary" suggestionPath="summary" />}
 *   </form.AppField>
 */
export const { useAppForm: useAdminForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField },
  formComponents: {},
});
