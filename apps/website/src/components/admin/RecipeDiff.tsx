import EntityDiff from "./EntityDiff.tsx";

interface Props {
  existing: Record<string, unknown>;
  proposed: Record<string, unknown>;
}

export default function RecipeDiff({ existing, proposed }: Props) {
  return <EntityDiff kind="recipe" existing={existing} proposed={proposed} />;
}
