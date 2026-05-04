import EntityDiff from "./EntityDiff.tsx";

interface Props {
  existing: Record<string, unknown>;
  proposed: Record<string, unknown>;
  locale?: string;
}

export default function PairingDiff({ existing, proposed, locale }: Props) {
  return <EntityDiff kind="pairing" existing={existing} proposed={proposed} locale={locale} />;
}
