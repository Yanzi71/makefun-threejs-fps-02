// The look plan, in one place. EMBERLINE is a dusk foundry yard: charcoal steel, warm
// rust and amber light against a cool slate sky. Every colour in the game is one of
// these seven; the same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#16181d', // ground, far fog
  surface: '#22262d', // walls, floor plates
  hairline: '#333945', // crates, cover, trim
  ink: '#ece7db', // light metal, UI text
  muted: '#8b939e', // concrete, secondary text
  accent: '#f0a830', // amber: bomb sites, highlights, Warden trim
  danger: '#d9483b', // rust red: Raider trim, damage, bomb light
};

export function shade(name) {
  return PALETTE[name];
}
