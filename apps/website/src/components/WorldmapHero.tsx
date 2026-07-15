import type { FC } from "react";
import {
  GROUP_COLORS,
  GROUP_ORDER,
  REGION_COLORS,
  REGION_LABELS,
  type RegionCode,
} from "../lib/regions.ts";
import type { ResolvedDot } from "../lib/worldmap-placement.ts";

export interface WorldmapHeroProps {
  dots: ResolvedDot[];
  cols: number;
  rows: number;
  /** "" for en, "/de" for de. */
  prefix: string;
  lang: "en" | "de";
  /** Templated label strings containing "{region}". */
  labels: { moreRecipes: string; moreMixtures: string };
}

/**
 * Dotted worldmap hero (see ADR 0021). Renders a CSS-grid silhouette of land
 * dots; filled dots are focusable links to their item, with a popover (shown on
 * hover/focus-within, pure CSS) offering the item and a region-filtered list.
 * No client JS required — safe to render static or hydrate for a future
 * interactive explore page.
 */
export const WorldmapHero: FC<WorldmapHeroProps> = ({ dots, cols, rows, prefix, lang, labels }) => {
  return (
    <section aria-label="Culinary regions worldmap" className="worldmap-hero">
      <div
        className="worldmap-grid"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          aspectRatio: `${cols} / ${rows}`,
          width: "100%",
        }}
      >
        {dots.map((dot) => {
          const color = REGION_COLORS[dot.regionId];
          const cell = { gridColumn: dot.col + 1, gridRow: dot.row + 1 } as const;

          if (!dot.item) {
            // Empty land dot — faint region-colored ring, inert.
            return (
              <span
                key={`${dot.col}-${dot.row}`}
                aria-hidden="true"
                className="worldmap-dot worldmap-dot--empty"
                style={{ ...cell, "--dot-color": color } as React.CSSProperties}
              />
            );
          }

          const { item } = dot;
          const regionName = REGION_LABELS[dot.regionId as RegionCode][lang];
          const itemHref = `${prefix}/${item.collection}/${item.slug}/`;
          const regionHref = `${prefix}/${item.collection}/?region=${dot.regionId}`;
          const moreTemplate =
            item.collection === "mixtures" ? labels.moreMixtures : labels.moreRecipes;
          const moreLabel = moreTemplate.replace("{region}", regionName);
          // Flip popover below the dot for the top of the map; align to the
          // nearer edge horizontally so it never clips off-screen.
          const placeBelow = dot.row < rows * 0.45;
          const halign = dot.col < cols * 0.18 ? "start" : dot.col > cols * 0.82 ? "end" : "center";

          return (
            <span
              key={`${dot.col}-${dot.row}`}
              className="worldmap-dot worldmap-dot--filled group"
              style={{ ...cell, "--dot-color": color } as React.CSSProperties}
            >
              <a
                href={itemHref}
                className="worldmap-dot__hit"
                aria-label={`${item.title} — ${regionName}`}
              />
              <div
                role="group"
                aria-label={`${regionName}: ${item.title}`}
                className="worldmap-popover"
                data-valign={placeBelow ? "below" : "above"}
                data-halign={halign}
              >
                {item.image ? (
                  <img src={item.image} alt={item.title} className="worldmap-popover__img" />
                ) : null}
                <div className="worldmap-popover__body">
                  <span className="worldmap-popover__tag" style={{ backgroundColor: color }}>
                    {regionName}
                  </span>
                  <h3 className="worldmap-popover__title">{item.title}</h3>
                  {item.description ? (
                    <p className="worldmap-popover__desc">{item.description}</p>
                  ) : null}
                  <a href={itemHref} className="worldmap-popover__link">
                    {item.title}
                  </a>
                  <a
                    href={regionHref}
                    className="worldmap-popover__link worldmap-popover__link--muted"
                  >
                    {moreLabel}
                  </a>
                </div>
              </div>
            </span>
          );
        })}
      </div>

      <ul className="worldmap-legend" aria-label="Region groups">
        {GROUP_ORDER.map((group) => (
          <li key={group} className="worldmap-legend__item">
            <span
              className="worldmap-legend__swatch"
              style={{ backgroundColor: GROUP_COLORS[group] }}
            />
            <span className="worldmap-legend__label">{group}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default WorldmapHero;
