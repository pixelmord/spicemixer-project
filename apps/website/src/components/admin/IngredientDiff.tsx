import EntityDiff from "./EntityDiff.tsx";

interface Props {
  existing: Record<string, unknown>;
  proposed: Record<string, unknown>;
}

export default function IngredientDiff({ existing, proposed }: Props) {
  return <EntityDiff kind="ingredient" existing={existing} proposed={proposed} />;
}
